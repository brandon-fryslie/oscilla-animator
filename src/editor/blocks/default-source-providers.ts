/**
 * @file Default Source Provider Blocks
 * @description Hidden blocks that provide default values for undriven inputs.
 *
 * These blocks are:
 * - Tagged as hidden (never shown in palette or PatchBay)
 * - Injected at compile-time by the compiler for undriven inputs
 * - Simple pass-throughs with editable 'value' input
 *
 * Sprint 4: Implements DSConstSignalFloat as reference implementation.
 * Sprint 5: Adds remaining 8 const provider blocks.
 */

import { createBlock } from './factory';
import { input, output } from './utils';

/**
 * DSConstSignalFloat - Constant provider for Signal<float> inputs
 *
 * This block:
 * - Has one input: 'value' (Signal<float>, with defaultSource for editability)
 * - Has one output: 'out' (Signal<float>)
 * - Acts as pure pass-through: out = value
 * - Tagged as hidden: never appears in UI palette
 * - Tagged with role: 'defaultSourceProvider' for filtering
 *
 * Example usage (automatic at compile-time):
 * - Circle block has 'radius' input with Signal<float> type
 * - User doesn't wire anything to radius
 * - Compiler injects DSConstSignalFloat provider
 * - Provider 'value' input gets default value from Circle's defaultSource metadata
 * - Provider 'out' feeds Circle's 'radius' input
 */
export const DSConstSignalFloat = createBlock({
  type: 'DSConstSignalFloat',
  label: 'Constant (Signal<float>)',
  description: 'Hidden provider block for Signal<float> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Signal<float>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  // Visual appearance (not used since hidden, but required by schema)
  color: '#6B7280', // Gray - indicates system/internal block
  priority: 1000, // Low priority - should never appear in normal lists
});

/**
 * DSConstSignalInt - Constant provider for Signal<int> inputs
 */
export const DSConstSignalInt = createBlock({
  type: 'DSConstSignalInt',
  label: 'Constant (Signal<int>)',
  description: 'Hidden provider block for Signal<int> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Signal<int>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 1 },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Signal<int>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalColor - Constant provider for Signal<color> inputs
 */
export const DSConstSignalColor = createBlock({
  type: 'DSConstSignalColor',
  label: 'Constant (Signal<color>)',
  description: 'Hidden provider block for Signal<color> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Signal<color>', {
      tier: 'primary',
      defaultSource: {
        value: '#ffffff',
        world: 'signal',
        uiHint: { kind: 'color' },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Signal<color>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalPoint - Constant provider for Signal<Point> inputs
 */
export const DSConstSignalPoint = createBlock({
  type: 'DSConstSignalPoint',
  label: 'Constant (Signal<Point>)',
  description: 'Hidden provider block for Signal<Point> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Signal<Point>', {
      tier: 'primary',
      defaultSource: {
        value: { x: 0, y: 0 },
        world: 'signal',
        uiHint: { kind: 'xy' },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Signal<Point>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstFieldFloat - Constant provider for Field<float> inputs
 */
export const DSConstFieldFloat = createBlock({
  type: 'DSConstFieldFloat',
  label: 'Constant (Field<float>)',
  description: 'Hidden provider block for Field<float> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Field<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'field',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Field<float>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstFieldVec2 - Constant provider for Field<vec2> inputs
 */
export const DSConstFieldVec2 = createBlock({
  type: 'DSConstFieldVec2',
  label: 'Constant (Field<vec2>)',
  description: 'Hidden provider block for Field<vec2> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Field<vec2>', {
      tier: 'primary',
      defaultSource: {
        value: { x: 0, y: 0 },
        world: 'field',
        uiHint: { kind: 'xy' },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Field<vec2>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstFieldColor - Constant provider for Field<color> inputs
 */
export const DSConstFieldColor = createBlock({
  type: 'DSConstFieldColor',
  label: 'Constant (Field<color>)',
  description: 'Hidden provider block for Field<color> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Field<color>', {
      tier: 'primary',
      defaultSource: {
        value: '#ffffff',
        world: 'field',
        uiHint: { kind: 'color' },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Field<color>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstScalarString - Constant provider for Scalar:string inputs
 */
export const DSConstScalarString = createBlock({
  type: 'DSConstScalarString',
  label: 'Constant (Scalar:string)',
  description: 'Hidden provider block for Scalar:string default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Scalar:string', {
      tier: 'primary',
      defaultSource: {
        value: '',
        world: 'scalar',
        uiHint: { kind: 'text' },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Scalar:string'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstScalarWaveform - Constant provider for Scalar:waveform inputs
 */
export const DSConstScalarWaveform = createBlock({
  type: 'DSConstScalarWaveform',
  label: 'Constant (Scalar:waveform)',
  description: 'Hidden provider block for Scalar:waveform default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Scalar:waveform', {
      tier: 'primary',
      defaultSource: {
        value: 'sine',
        world: 'scalar',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'sine', label: 'Sine' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'square', label: 'Square' },
            { value: 'sawtooth', label: 'Sawtooth' },
          ],
        },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Scalar:waveform'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  color: '#6B7280',
  priority: 1000,
});
