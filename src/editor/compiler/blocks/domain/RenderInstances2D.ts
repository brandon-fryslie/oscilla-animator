/**
 * RenderInstances2D Block Compiler
 *
 * Materializes Domain + Fields into a renderable 2D circle output.
 * This is the sink that turns per-element data into visual output.
 *
 * Takes:
 *   - Domain: element identity
 *   - positions: Field<vec2> - per-element positions
 *   - radius: Field<number> OR Signal<number> - per-element radii or broadcast radius (optional)
 *   - color: Field<color> - per-element colors (optional)
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
    { name: 'radius', type: { kind: 'Field:number' }, required: false },
    { name: 'color', type: { kind: 'Field:color' }, required: false },
  ],

  outputs: [
    { name: 'render', type: { kind: 'RenderTree' } },
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
          message: 'RenderInstances2D requires a Field<vec2> positions input',
        },
      };
    }

    const domain = domainArtifact.value;
    const positionField = positionsArtifact.value;

    // Radius input: accept EITHER Field<number> OR Signal<number>
    // - Field<number>: per-element radii (static or varied)
    // - Signal<number>: broadcast same animated value to all elements
    const radiusArtifact = inputs.radius;
    let radiusMode: 'field' | 'signal' | 'default' = 'default';
    let radiusField: Field<number> | undefined;
    let radiusSignal: ((t: number, ctx: RuntimeCtx) => number) | undefined;

    if (isDefined(radiusArtifact) && radiusArtifact.kind === 'Field:number') {
      radiusMode = 'field';
      radiusField = radiusArtifact.value;
    } else if (isDefined(radiusArtifact) && radiusArtifact.kind === 'Signal:number') {
      radiusMode = 'signal';
      radiusSignal = radiusArtifact.value as (t: number, ctx: RuntimeCtx) => number;
    }
    // else: radiusMode === 'default', use constant 5

    // Optional color field - default to white if not provided
    const colorArtifact = inputs.color;
    const colorField: Field<unknown> = isDefined(colorArtifact) && colorArtifact.kind === 'Field:color'
      ? colorArtifact.value
      : (_seed, n) => Array<string>(n).fill('#ffffff');

    // Params
    const opacity = Number(params.opacity ?? 1.0);
    const glow = Boolean(params.glow ?? false);
    const glowIntensity = Number(params.glowIntensity ?? 2.0);

    // Create the render function - evaluates fields at render time
    const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
      const n = domain.elements.length;
      const seed = 0; // Fixed seed for consistent rendering

      // Evaluate fields
      const positions = positionField(seed, n, DEFAULT_CTX);
      const colors = colorField(seed, n, DEFAULT_CTX);

      // Radius: evaluate based on mode
      let radii: readonly number[];
      if (radiusMode === 'field' && isDefined(radiusField)) {
        radii = radiusField(seed, n, DEFAULT_CTX);
      } else if (radiusMode === 'signal' && isDefined(radiusSignal)) {
        // Sample signal once and broadcast to all elements
        const broadcastRadius = radiusSignal(tMs, ctx);
        radii = new Array(n).fill(broadcastRadius);
      } else {
        // Default: constant radius of 5
        radii = new Array(n).fill(5);
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
};
