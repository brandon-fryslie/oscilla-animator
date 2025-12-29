/**
 * Golden Patch Composites - Pre-built compound blocks for the "Breathing Constellation" patch.
 *
 * These composites implement the patterns defined in design-docs/3-Synthesized/10-Golden-Patch.md
 * and validate that all primitives from Slices 1-8 work together correctly.
 */

import { registerComposite } from './composites';

/**
 * BreathEnergy - Oscillator + Shaper publishing to energy bus.
 *
 * Creates a smooth "breathing" intensity signal from phase.
 * Formula: breath = 0.5 - 0.5*cos(2π*phase), then smoothstep shaped.
 * Publishes to energy bus with sum combine mode.
 */
export const BreathEnergy = registerComposite({
  id: 'BreathEnergy',
  label: 'Breath Energy',
  description: 'Smooth breathing intensity from phase, publishes to energy bus',
  color: '#3B82F6',
  subcategory: 'Time',
  tags: {
    origin: 'golden-patch-composites',
    form: 'composite',
    busPublish: 'energy',
  },
  graph: {
    nodes: {
      osc: {
        type: 'Oscillator',
        params: {
          shape: 'cosine',
          amplitude: { __fromParam: 'amount' },
          bias: 0.5,
        },
      },
      shaper: {
        type: 'Shaper',
        params: {
          kind: 'smoothstep',
          amount: 1,
        },
      },
    },
    edges: [
      { from: 'osc.out', to: 'shaper.in' },
    ],
    inputMap: {
      phase: 'osc.phase',
    },
    outputMap: {
      energy: 'shaper.out',
    },
  },
  exposedInputs: [
    {
      id: 'phase',
      label: 'Phase',
      direction: 'input',
      slotType: 'Signal<phase>',
      nodeId: 'osc',
      nodePort: 'phase',
    },
  ],
  exposedOutputs: [
    {
      id: 'energy',
      label: 'Energy',
      direction: 'output',
      slotType: 'Signal<float>',
      nodeId: 'shaper',
      nodePort: 'out',
    },
  ],
});

/**
 * PulseAccentEnergy - PulseDivider + EnvelopeAD for rhythmic accents.
 *
 * Creates rhythmic "pop" accents synced to phase subdivisions.
 * PulseDivider triggers EnvelopeAD at each subdivision.
 * Publishes to energy bus with sum combine mode.
 */
export const PulseAccentEnergy = registerComposite({
  id: 'PulseAccentEnergy',
  label: 'Pulse Accent Energy',
  description: 'Rhythmic accent envelope from pulse subdivisions',
  color: '#F59E0B',
  subcategory: 'Time',
  tags: {
    origin: 'golden-patch-composites',
    form: 'composite',
    busPublish: 'energy',
  },
  graph: {
    nodes: {
      divider: {
        type: 'PulseDivider',
        params: {
          divisions: { __fromParam: 'divisions' },
        },
      },
      envelope: {
        type: 'EnvelopeAD',
        params: {
          attack: 0.01,
          decay: { __fromParam: 'decay' },
          peak: { __fromParam: 'amount' },
        },
      },
    },
    edges: [
      { from: 'divider.tick', to: 'envelope.trigger' },
    ],
    inputMap: {
      phase: 'divider.phase',
    },
    outputMap: {
      energy: 'envelope.env',
    },
  },
  exposedInputs: [
    {
      id: 'phase',
      label: 'Phase',
      direction: 'input',
      slotType: 'Signal<phase>',
      nodeId: 'divider',
      nodePort: 'phase',
    },
  ],
  exposedOutputs: [
    {
      id: 'energy',
      label: 'Energy',
      direction: 'output',
      slotType: 'Signal<float>',
      nodeId: 'envelope',
      nodePort: 'env',
    },
  ],
});

/**
 * SlowPaletteDrift - ColorLFO publishing to palette bus.
 *
 * Creates slow hue cycling color from a slow phase input.
 * Designed to work with phaseB (32s phrase) for long-term color evolution.
 */
export const SlowPaletteDrift = registerComposite({
  id: 'SlowPaletteDrift',
  label: 'Slow Palette Drift',
  description: 'Slow color cycling from phrase phase, publishes to palette bus',
  color: '#F59E0B',
  subcategory: 'Time',
  tags: {
    origin: 'golden-patch-composites',
    form: 'composite',
    busPublish: 'palette',
  },
  graph: {
    nodes: {
      colorLfo: {
        type: 'ColorLFO',
        params: {
          base: { __fromParam: 'base' },
          hueSpan: { __fromParam: 'hueSpan' },
          sat: { __fromParam: 'sat' },
          light: { __fromParam: 'light' },
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
  },
  exposedInputs: [
    {
      id: 'phase',
      label: 'Phase',
      direction: 'input',
      slotType: 'Signal<phase>',
      nodeId: 'colorLfo',
      nodePort: 'phase',
    },
  ],
  exposedOutputs: [
    {
      id: 'color',
      label: 'Color',
      direction: 'output',
      slotType: 'Signal<color>',
      nodeId: 'colorLfo',
      nodePort: 'color',
    },
  ],
});

/**
 * BreathingDotsRenderer - Complete rendering composite for breathing dots.
 *
 * This is the capstone composite that validates all primitives work together:
 * - GridDomain for element identity and base positions
 * - StableIdHash for per-element determinism
 * - JitterFieldVec2 for position drift
 * - FieldAddVec2 for position combination
 * - FieldZipSignal for phase spread calculation
 * - RenderInstances2D for final visualization
 *
 * Uses buses:
 * - Subscribes to phaseA for animation timing
 * - Subscribes to phaseB for slow drift animation
 * - Subscribes to energy for radius modulation
 * - Subscribes to palette for color
 */
export const BreathingDotsRenderer = registerComposite({
  id: 'BreathingDotsRenderer',
  label: 'Breathing Dots',
  description: 'Complete breathing dots visualization from Golden Patch',
  color: '#EF4444',
  subcategory: 'Render',
  tags: {
    origin: 'golden-patch-composites',
    form: 'composite',
    goldenPatch: true,
  },
  graph: {
    nodes: {
      // Domain and positions
      grid: {
        type: 'GridDomain',
        params: {
          rows: { __fromParam: 'rows' },
          cols: { __fromParam: 'cols' },
          spacing: { __fromParam: 'spacing' },
          originX: { __fromParam: 'originX' },
          originY: { __fromParam: 'originY' },
        },
      },
      // Per-element randomization for phase offset
      idHash: {
        type: 'StableIdHash',
        params: {
          salt: { __fromParam: 'seed' },
        },
      },
      // Per-element randomization for jitter direction
      jitterHash: {
        type: 'StableIdHash',
        params: {
          salt: 12345, // Different salt for jitter vs phase offset
        },
      },
      // Position jitter/drift
      jitter: {
        type: 'JitterFieldVec2',
        params: {
          amount: { __fromParam: 'driftAmount' },
          frequency: { __fromParam: 'driftFrequency' },
        },
      },
      // Combine base positions with jitter
      posAdd: {
        type: 'FieldAddVec2',
        params: {},
      },
      // Constant radius field (to be modulated by energy via bus)
      radiusField: {
        type: 'FieldConstNumber',
        params: {
          value: { __fromParam: 'baseRadius' },
        },
      },
      // Render the dots
      render: {
        type: 'RenderInstances2D',
        params: {
          opacity: { __fromParam: 'opacity' },
        },
      },
    },
    edges: [
      // Domain flows
      { from: 'grid.domain', to: 'idHash.domain' },
      { from: 'grid.domain', to: 'jitterHash.domain' },
      { from: 'grid.domain', to: 'radiusField.domain' },
      { from: 'grid.domain', to: 'render.domain' },
      // Jitter setup
      { from: 'jitterHash.u01', to: 'jitter.idRand' },
      // Position combination
      { from: 'grid.pos0', to: 'posAdd.a' },
      { from: 'jitter.drift', to: 'posAdd.b' },
      { from: 'posAdd.out', to: 'render.positions' },
      // Radius
      { from: 'radiusField.out', to: 'render.radius' },
    ],
    inputMap: {
      phase: 'jitter.phase', // For position animation
    },
    outputMap: {
      render: 'render.render',
      domain: 'grid.domain',
      idRand: 'idHash.u01', // Expose for phase spread calculation
    },
  },
  exposedInputs: [
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
      id: 'render',
      label: 'Render',
      direction: 'output',
      slotType: 'Render',
      nodeId: 'render',
      nodePort: 'render',
    },
    {
      id: 'domain',
      label: 'Domain',
      direction: 'output',
      slotType: 'Domain',
      nodeId: 'grid',
      nodePort: 'domain',
    },
    {
      id: 'idRand',
      label: 'ID Random',
      direction: 'output',
      slotType: 'Field<float>',
      nodeId: 'idHash',
      nodePort: 'u01',
    },
  ],
});

