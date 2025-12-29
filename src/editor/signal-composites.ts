/**
 * Signal Composites - Bus-aware signal processing composites
 *
 * These composites leverage the bus system for signal-based workflows,
 * including breathing scales, palette drift, rhythm, and motion patterns.
 */

import { registerComposite } from './composites';

/**
 * RotationScatter - Per-element rotation variation
 *
 * Creates stable per-element rotation values using hash-based randomness.
 * Similar to SizeScatter but for rotation angles.
 */
export const RotationScatter = registerComposite({
  id: 'RotationScatter',
  label: 'Rotation Scatter',
  description: 'Per-element rotation variation in [0, 2π]',
  color: '#EC4899',
  subcategory: 'Fields',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
      toRadians: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: 6.28318530718, // 2 * PI
        },
      },
      applyAmount: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: { __fromParam: 'amount' },
        },
      },
    },
    edges: [
      { from: 'hash.u', to: 'toRadians.x' },
      { from: 'toRadians.y', to: 'applyAmount.x' },
    ],
    inputMap: {
      domain: 'hash.domain',
    },
    outputMap: {
      rotation: 'applyAmount.y',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
  ],
  exposedOutputs: [
    {
      id: 'rotation',
      label: 'Rotation',
      direction: 'output',
      slotType: 'Field<float>',
      nodeId: 'applyAmount',
      nodePort: 'y',
    },
  ],
});

/**
 * BreathingScale - Global breathing pulse from phase
 *
 * Consumes phase from phaseA bus, generates breathing signal,
 * and publishes to energy bus. Core pattern for global pulse effects.
 */
export const BreathingScale = registerComposite({
  id: 'BreathingScale',
  label: 'Breathing Scale',
  description: 'Global pulse to size/opacity via bus',
  color: '#3B82F6',
  subcategory: 'Time',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      oscillator: {
        type: 'Oscillator',
        params: {
          shape: { __fromParam: 'curve' },
          amplitude: 0.5,
          bias: 0.5,
        },
      },
      scale: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: { __fromParam: 'range' }, // max - min
        },
      },
      offset: {
        type: 'FieldMapNumber',
        params: {
          fn: 'offset',
          k: { __fromParam: 'min' },
        },
      },
    },
    edges: [
      { from: 'oscillator.out', to: 'scale.x' },
      { from: 'scale.y', to: 'offset.x' },
    ],
    inputMap: {
      phase: 'oscillator.phase',
    },
    outputMap: {
      out: 'offset.y',
    },
    busSubscriptions: {
      phase: 'phaseA',
    },
    busPublications: {
      out: 'energy',
    },
  },
  exposedInputs: [],
  exposedOutputs: [],
});

/**
 * PaletteDrift - Slow color evolution via ColorLFO
 *
 * Consumes phase from phaseB (slow clock) and publishes
 * to palette bus for global color coherence.
 */
export const PaletteDrift = registerComposite({
  id: 'PaletteDrift',
  label: 'Palette Drift',
  description: 'Slow color evolution from phase',
  color: '#F59E0B',
  subcategory: 'Time',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      colorLfo: {
        type: 'ColorLFO',
        params: {
          base: { __fromParam: 'baseColor' },
          hueSpan: { __fromParam: 'hueSpan' },
          sat: { __fromParam: 'saturation' },
          light: { __fromParam: 'lightness' },
        },
      },
    },
    edges: [],
    inputMap: {
      phase: 'colorLfo.phase',
    },
    outputMap: {
      color: 'colorLfo.color',
    },
    busSubscriptions: {
      phase: 'phaseB',
    },
    busPublications: {
      color: 'palette',
    },
  },
  exposedInputs: [],
  exposedOutputs: [],
});

/**
 * PerElementColorScatter - Hue offset per element
 *
 * Takes base color and applies per-element hue shifts
 * using FieldHash01ById + FieldColorize.
 */
export const PerElementColorScatter = registerComposite({
  id: 'PerElementColorScatter',
  label: 'Per-Element Color Scatter',
  description: 'Apply per-element hue offsets to base color',
  color: '#F59E0B',
  subcategory: 'Style',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
      toHueOffset: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: { __fromParam: 'hueShiftAmount' }, // Max hue shift in degrees
        },
      },
      colorize: {
        type: 'FieldColorize',
        params: {
          // Base color comes from input
          mode: 'hue',
        },
      },
    },
    edges: [
      { from: 'hash.u', to: 'toHueOffset.x' },
      { from: 'toHueOffset.y', to: 'colorize.values' },
    ],
    inputMap: {
      domain: 'hash.domain',
    },
    outputMap: {
      fill: 'colorize.colors',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
  ],
  exposedOutputs: [
    {
      id: 'fill',
      label: 'Fill',
      direction: 'output',
      slotType: 'Field<color>',
      nodeId: 'colorize',
      nodePort: 'colors',
    },
  ],
});

/**
 * PulseToEnvelope - Trigger-driven envelope from pulse bus
 *
 * Subscribes to pulse bus, generates attack/decay envelope,
 * and optionally publishes to energy bus.
 */
export const PulseToEnvelope = registerComposite({
  id: 'PulseToEnvelope',
  label: 'Pulse to Envelope',
  description: 'AD envelope triggered by pulse bus',
  color: '#F59E0B',
  subcategory: 'Time',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      envelope: {
        type: 'EnvelopeAD',
        params: {
          attack: { __fromParam: 'attack' },
          decay: { __fromParam: 'decay' },
          peak: { __fromParam: 'peak' },
        },
      },
    },
    edges: [],
    inputMap: {
      trigger: 'envelope.trigger',
    },
    outputMap: {
      env: 'envelope.env',
    },
    busSubscriptions: {
      trigger: 'pulse',
    },
    busPublications: {
      env: 'energy',
    },
  },
  exposedInputs: [],
  exposedOutputs: [],
});

/**
 * PhaseWrapPulse - Phase subdivisions to pulse events
 *
 * Subscribes to phaseA bus, generates subdivided pulse events,
 * and publishes to pulse bus.
 */
export const PhaseWrapPulse = registerComposite({
  id: 'PhaseWrapPulse',
  label: 'Phase Wrap Pulse',
  description: 'Subdivide phase into pulse events',
  color: '#F59E0B',
  subcategory: 'Time',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      divider: {
        type: 'PulseDivider',
        params: {
          divisions: { __fromParam: 'divisions' },
        },
      },
    },
    edges: [],
    inputMap: {
      phase: 'divider.phase',
    },
    outputMap: {
      tick: 'divider.tick',
    },
    busSubscriptions: {
      phase: 'phaseA',
    },
    busPublications: {
      tick: 'pulse',
    },
  },
  exposedInputs: [],
  exposedOutputs: [],
});

/**
 * GlyphRenderer - Instance renderer for paths/glyphs
 *
 * Similar to DotsRenderer but configured for path/glyph shapes.
 * Wraps RenderInstances2D with path-specific configuration.
 *
 * Note: This currently uses the same RenderInstances2D primitive.
 * Future enhancement: Add path shape support to RenderInstances2D.
 */
export const GlyphRenderer = registerComposite({
  id: 'GlyphRenderer',
  label: 'Glyph Renderer',
  description: 'Render paths/glyphs at each element',
  color: '#EF4444',
  subcategory: 'Render',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      render: {
        type: 'RenderInstances2D',
        params: {
          // Path asset support would go here when available
          opacity: { __fromParam: 'opacity' },
          glow: { __fromParam: 'glow' },
          glowIntensity: { __fromParam: 'glowIntensity' },
        },
      },
    },
    edges: [],
    inputMap: {
      domain: 'render.domain',
      positions: 'render.positions',
      radius: 'render.radius', // Used for base size
      rotation: 'render.rotation',
    },
    outputMap: {
      render: 'render.render',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'render',
      nodePort: 'domain',
    },
    {
      id: 'positions',
      label: 'Positions',
      direction: 'input',
      slotType: 'Field<vec2>',
      nodeId: 'render',
      nodePort: 'positions',
    },
    {
      id: 'radius',
      label: 'Size',
      direction: 'input',
      slotType: 'Field<float>',
      nodeId: 'render',
      nodePort: 'radius',
    },
    {
      id: 'rotation',
      label: 'Rotation',
      direction: 'input',
      slotType: 'Field<float>',
      nodeId: 'render',
      nodePort: 'rotation',
    },
  ],
  exposedOutputs: [
    {
      id: 'render',
      label: 'Render',
      direction: 'output',
      slotType: 'Render',
      nodeId: 'render',
      nodePort: 'render',
    },
  ],
});

/**
 * JitterMotion - Animated jitter/drift via phase
 *
 * Combines FieldHash01ById with JitterFieldVec2 to create
 * gentle organic motion driven by phase input.
 */
export const JitterMotion = registerComposite({
  id: 'JitterMotion',
  label: 'Jitter Motion',
  description: 'Phase-driven jitter/drift per element',
  color: '#A855F7',
  subcategory: 'Math',
  tags: {
    origin: 'signal-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
      jitter: {
        type: 'JitterFieldVec2',
        params: {
          amount: { __fromParam: 'amount' },
          frequency: { __fromParam: 'frequency' },
        },
      },
    },
    edges: [
      { from: 'hash.u', to: 'jitter.idRand' },
    ],
    inputMap: {
      domain: 'hash.domain',
      phase: 'jitter.phase',
    },
    outputMap: {
      drift: 'jitter.drift',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
    {
      id: 'phase',
      label: 'Phase',
      direction: 'input',
      slotType: 'Signal<phase>',
      nodeId: 'jitter',
      nodePort: 'phase',
    },
  ],
  exposedOutputs: [
    {
      id: 'drift',
      label: 'Drift',
      direction: 'output',
      slotType: 'Field<vec2>',
      nodeId: 'jitter',
      nodePort: 'drift',
    },
  ],
});

/**
 * Register all signal composites.
 * Called during editor initialization.
 */
export function registerSignalComposites(): void {
  // Composites are registered on module load via registerComposite() calls above
  // This function exists for explicit initialization if needed
}
