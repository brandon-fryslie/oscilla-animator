/**
 * RenderInstances2D Block Compiler
 *
 * Materializes Domain + Fields into a renderable 2D circle output.
 * This is the sink that turns per-element data into visual output.
 *
 * Takes:
 *   - Domain: element identity (required)
 *   - positions: Field<vec2> - per-element positions (required)
 *   - radius: Field<float> OR Signal<float> - per-element radii or broadcast radius (required)
 *   - color: Field<color> - per-element colors (required)
 *
 * Produces:
 *   - render: RenderTree - SVG-compatible render tree with circles
 */

import type { BlockCompiler, Field, RuntimeCtx, DrawNode, Artifact } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

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

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Lower RenderInstances2D block to IR.
 *
 * This is a RENDER block that materializes domain + fields into visual output.
 * It takes:
 * - Domain (special handle)
 * - positions: Field<vec2>
 * - radius: Field<float> OR Signal<float>
 * - color: Field<color>
 *
 * And registers a render sink with these inputs.
 */
const lowerRenderInstances2D: BlockLowerFn = ({ ctx, inputs }) => {
  const [domain, positions, radius, color, opacity] = inputs;

  // Validate inputs
  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('RenderInstances2D requires a Domain input');
  }

  if (positions.k !== 'field') {
    throw new Error(`RenderInstances2D requires Field<vec2> positions, got ${positions.k}`);
  }

  if (radius.k !== 'field' && radius.k !== 'sig') {
    throw new Error(`RenderInstances2D requires Field<float> or Signal<float> radius, got ${radius.k}`);
  }

  if (color.k !== 'field') {
    throw new Error(`RenderInstances2D requires Field<color> color, got ${color.k}`);
  }

  if (opacity.k !== 'sig') {
    throw new Error(`RenderInstances2D requires Signal<float> opacity, got ${opacity.k}`);
  }

  // Register render sink
  // The runtime will handle materializing these fields at render time
  // Note: renderSink expects Record<string, ValueSlot>
  // - domain.id IS the ValueSlot (special types use id as slot)
  // - field/signal inputs have separate .slot property
  const sinkInputs = {
    domain: domain.id,  // Domain special type: id IS the slot
    positions: positions.slot,  // Field: use .slot
    radius: radius.slot,  // Field/Signal: use .slot
    color: color.slot,  // Field: use .slot
    opacity: opacity.slot,
  };

  ctx.b.renderSink('instances2d', sinkInputs);

  return {
    outputs: [],
    declares: {
      renderSink: { sinkId: 0 }, // Placeholder - runtime assigns real IDs
    },
  };
};

// Register block type
registerBlockType({
  type: 'RenderInstances2D',
  capability: 'render',
  inputs: [
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: "config", domain: "domain", category: "internal", busEligible: false },
      defaultSource: { value: 100 },
    },
    {
      portId: 'positions',
      label: 'Positions',
      dir: 'in',
      type: { world: "field", domain: "vec2", category: "core", busEligible: true },
      defaultSource: { value: [0, 0] },
    },
    {
      portId: 'radius',
      label: 'Radius',
      dir: 'in',
      type: { world: "field", domain: "float", category: "core", busEligible: true }, // Can also accept signal
      defaultSource: { value: 5 },
    },
    {
      portId: 'color',
      label: 'Color',
      dir: 'in',
      type: { world: "field", domain: "color", category: "core", busEligible: true },
      defaultSource: { value: '#ffffff' },
    },
    {
      portId: 'opacity',
      label: 'Opacity',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 1.0 },
    },
    {
      portId: 'glow',
      label: 'Glow',
      dir: 'in',
      type: { world: "scalar", domain: "boolean", category: "core", busEligible: true },
      defaultSource: { value: false },
    },
    {
      portId: 'glowIntensity',
      label: 'Glow Intensity',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0.5 },
    },
  ],
  outputs: [
    // In IR mode, render sinks don't produce signal outputs
    // In legacy mode, this has a 'render' output
  ],
  lower: lowerRenderInstances2D,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const RenderInstances2DBlock: BlockCompiler = {
  type: 'RenderInstances2D',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'positions', type: { kind: 'Field:vec2' }, required: true },
    { name: 'radius', type: { kind: 'Field:float' }, required: true },
    { name: 'color', type: { kind: 'Field:color' }, required: true },
    { name: 'opacity', type: { kind: 'Signal:float' }, required: false },
    { name: 'glow', type: { kind: 'Scalar:boolean' }, required: false },
    { name: 'glowIntensity', type: { kind: 'Signal:float' }, required: false },
  ],

  compile({ inputs, params }) {
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

    // Radius input: accept EITHER Field<float> OR Signal<float>
    // - Field<float>: per-element radii (static or varied)
    // - Signal<float>: broadcast same animated value to all elements
    const radiusArtifact = inputs.radius;
    if (!isDefined(radiusArtifact)) {
      return {
        render: {
          kind: 'Error',
          message: 'RenderInstances2D requires a radius input',
        },
      };
    }
    if (radiusArtifact.kind !== 'Field:float' && radiusArtifact.kind !== 'Signal:float') {
      return {
        render: {
          kind: 'Error',
          message: `RenderInstances2D requires a Field<float> or Signal<float> radius input. Got ${radiusArtifact.kind}`,
        },
      };
    }

    let radiusMode: 'field' | 'signal';
    let radiusField: Field<float> | undefined;
    let radiusSignal: ((t: number, ctx: RuntimeCtx) => number) | undefined;

    if (radiusArtifact.kind === 'Field:float') {
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

    // Default runtime context for compile-time signal evaluation
    const defaultCtx: RuntimeCtx = { viewport: { w: 1920, h: 1080, dpr: 1 } };

    // Helper to extract numeric value from Scalar or Signal artifacts
    // Signal artifacts have .value as a function, Scalar artifacts have .value as a number
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:float') return Number(artifact.value);
      if (artifact.kind === 'Signal:float') {
        // Signal artifacts have .value as a function - call with t=0 for compile-time value
        return Number(artifact.value(0, defaultCtx));
      }
      // Generic fallback for other artifact types that might have callable or direct values
      return typeof artifact.value === 'function' ? Number((artifact.value as (t: number, ctx: RuntimeCtx) => unknown)(0, defaultCtx)) : Number(artifact.value);
    };

    // Helper to extract boolean from Scalar or Signal artifacts
    const extractBoolean = (artifact: Artifact | undefined, defaultValue: boolean): boolean => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:boolean') return Boolean(artifact.value);
      // Config values come as strings like 'true'/'false'
      if (typeof artifact.value === 'string') return artifact.value === 'true';
      return Boolean(artifact.value);
    };

    // Read from inputs - values come from defaultSource or explicit connections
    const opacity = extractNumber(inputs.opacity, (params as Record<string, unknown> | undefined)?.opacity as number | undefined ?? 1.0);
    const glow = extractBoolean(inputs.glow, (params as Record<string, unknown> | undefined)?.glow as boolean | undefined ?? false);
    const glowIntensity = extractNumber(inputs.glowIntensity, (params as Record<string, unknown> | undefined)?.glowIntensity as number | undefined ?? 0.5);

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
      let radii: readonly float[];
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
