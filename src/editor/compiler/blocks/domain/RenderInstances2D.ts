/**
 * RenderInstances2D Block Compiler
 *
 * Materializes Domain + Fields into a renderable 2D circle output.
 * This is the sink that turns per-element data into visual output.
 *
 * Takes:
 *   - Domain: element identity (required)
 *   - positions: Field<vec2> - per-element positions (required)
 *   - radius: Field<number> OR Signal<number> - per-element radii or broadcast radius (required)
 *   - color: Field<color> - per-element colors (required)
 *
 * Produces:
 *   - render: RenderTree - SVG-compatible render tree with circles
 */

import type { BlockCompiler, Field, RuntimeCtx, DrawNode } from '../../types';
import { isDefined } from '../../../types/helpers';

// Default compile context for field evaluation
const DEFAULT_CTX = {
  env: {},
  geom: {
    get<K extends object, V>(_key: K, compute: () => V): V {
      return compute();
    },
    invalidate() {},
  },
};

export const RenderInstances2DBlock: BlockCompiler = {
  type: 'RenderInstances2D',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'positions', type: { kind: 'Field:vec2' }, required: true },
    { name: 'radius', type: { kind: 'Field:number' }, required: true },
    { name: 'color', type: { kind: 'Field:color' }, required: true },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        render: {
          kind: 'Error',
          message: 'RenderInstances2D requires a Domain input',
        },
      };
    }

    const positionsArtifact = inputs.positions;
    if (!isDefined(positionsArtifact) || positionsArtifact.kind !== 'Field:vec2') {
      return {
        render: {
          kind: 'Error',
          message: `RenderInstances2D requires a Field<vec2> positions input. Got ${positionsArtifact.kind}`,
        },
      };
    }

    const domain = domainArtifact.value;
    const positionField = positionsArtifact.value;

    // Radius input: accept EITHER Field<number> OR Signal<number>
    // - Field<number>: per-element radii (static or varied)
    // - Signal<number>: broadcast same animated value to all elements
    const radiusArtifact = inputs.radius;
    if (!isDefined(radiusArtifact)) {
      return {
        render: {
          kind: 'Error',
          message: 'RenderInstances2D requires a radius input',
        },
      };
    }
    if (radiusArtifact.kind !== 'Field:number' && radiusArtifact.kind !== 'Signal:number') {
      return {
        render: {
          kind: 'Error',
          message: `RenderInstances2D requires a Field<number> or Signal<number> radius input. Got ${radiusArtifact.kind}`,
        },
      };
    }

    let radiusMode: 'field' | 'signal';
    let radiusField: Field<number> | undefined;
    let radiusSignal: ((t: number, ctx: RuntimeCtx) => number) | undefined;

    if (radiusArtifact.kind === 'Field:number') {
      radiusMode = 'field';
      radiusField = radiusArtifact.value;
    } else {
      radiusMode = 'signal';
      radiusSignal = radiusArtifact.value as (t: number, ctx: RuntimeCtx) => number;
    }

    // Color field - required
    const colorArtifact = inputs.color;
    if (!isDefined(colorArtifact) || colorArtifact.kind !== 'Field:color') {
      return {
        render: {
          kind: 'Error',
          message: `RenderInstances2D requires a Field<color> color input. Got ${colorArtifact.kind}`,
        },
      };
    }

    const colorField: Field<unknown> = colorArtifact.value;

    // Params
    const opacity = Number(params.opacity ?? 1.0);
    const glow = Boolean(params.glow ?? false);
    const glowIntensity = Number(params.glowIntensity ?? 2.0);

    // Create the render function - evaluates fields at render time
    const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
      const n = domain.elements.length;
      const seed = 0; // Fixed seed for consistent rendering

      // Create field evaluation context with time for signal-dependent fields
      // IMPORTANT: t: tMs must come LAST to ensure it's not overwritten by ctx
      const fieldCtx = {
        ...DEFAULT_CTX,
        ...ctx,
        t: tMs,
      };

      // Evaluate fields
      const positions = positionField(seed, n, fieldCtx);
      const colors = colorField(seed, n, fieldCtx);

      // Radius: evaluate based on mode
      let radii: readonly number[];
      if (radiusMode === 'field') {
        radii = radiusField!(seed, n, fieldCtx);
      } else {
        // Signal mode: sample signal once and broadcast to all elements
        const broadcastRadius = radiusSignal!(tMs, ctx);
        radii = new Array(n).fill(broadcastRadius);
      }

      // Build circle nodes
      const circles: DrawNode[] = [];
      for (let i = 0; i < n; i++) {
        const pos = positions[i];
        const r = radii[i] ?? 5;
        const color = colors[i] ?? '#ffffff';

        if (isDefined(pos)) {
          circles.push({
            kind: 'shape',
            id: `circle-${domain.elements[i]}`,
            geom: {
              kind: 'circle',
              cx: pos.x,
              cy: pos.y,
              r,
            },
            style: {
              fill: color as string,
              opacity,
            },
          });
        }
      }

      // Wrap in group, optionally with glow filter
      const children: DrawNode = {
        kind: 'group',
        id: 'instances',
        children: circles,
      };

      if (glow) {
        return {
          kind: 'effect',
          id: 'glow-wrapper',
          effect: {
            kind: 'filter',
            filter: `drop-shadow(0 0 ${10 * glowIntensity}px currentColor)`,
          },
          child: children,
        };
      }

      return children;
    };

    return {
      render: { kind: 'RenderTree', value: renderFn },
    };
  },

  outputs: [
    { name: 'render', type: { kind: 'RenderTree' } },
  ],
};
