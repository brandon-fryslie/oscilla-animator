/**
 * @file Signal blocks - Signal processing primitives
 *
 * These blocks process time-indexed Signal values.
 * They can subscribe from buses (like phaseA) and publish to buses (like energy).
 */
import { createBlock } from './factory';
import { input, output } from './utils';
import { Oscillator } from './oscillatorSpec';

/**
 * Oscillator - Generate waveforms from phase
 *
 * Core signal generator that converts phase [0,1] into oscillating waveforms.
 * Can subscribe from phaseA bus or receive explicit phase input.
 *
 * Inputs with defaultSource (Remove Parameters refactor):
 * - shape: Config world - changing triggers hot-swap (crossfade)
 * - amplitude/bias: Signal world - can be animated via bus/wire
 */
export { Oscillator };

/**
 * Shaper - Apply waveshaping to signals
 *
 * Transforms signal values using various shaping functions.
 * Useful for softening oscillators, creating breathing curves, etc.
 *
 * Inputs with defaultSource:
 * - kind: Config world (triggers hot-swap)
 * - amount: Signal world (can be modulated)
 */
export const Shaper = createBlock({

  type: 'Shaper',
  label: 'Shaper',
  description: 'Shape signals with tanh, sigmoid, smoothstep, etc.',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('in', 'Input', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
    }),
    input('kind', 'Shape', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'smoothstep',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'tanh', label: 'Tanh' },
            { value: 'softclip', label: 'Soft Clip' },
            { value: 'sigmoid', label: 'Sigmoid' },
            { value: 'smoothstep', label: 'Smoothstep' },
            { value: 'pow', label: 'Power' },
          ],
        },
      },
    }),
    input('amount', 'Amount', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0.1, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Output', 'Signal<float>'),
  ],
  color: '#3B82F6',
  priority: 11,});

/**
 * ColorLFO - Generate color from phase
 *
 * Converts phase [0,1] into animated color via hue rotation.
 * Useful for palette animation and color cycling effects.
 *
 * All inputs are Signal world - colors can be animated.
 */
export const ColorLFO = createBlock({

  type: 'ColorLFO',
  label: 'Color LFO',
  description: 'Generate color from phase (hue rotation)',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('phase', 'Phase', 'Signal<phase>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
    input('base', 'Base Color', 'Signal<color>', {
      tier: 'primary',
      defaultSource: {
        value: '#3B82F6',
        world: 'signal',
        uiHint: { kind: 'color' },
      },
    }),
    input('hueSpan', 'Hue Span', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 180,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 360, step: 1 },
      },
    }),
    input('sat', 'Saturation', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: {
        value: 0.8,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
    input('light', 'Lightness', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: {
        value: 0.5,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
  ],
  outputs: [
    output('color', 'Color', 'Signal<color>'),
  ],
  color: '#F59E0B',
  priority: 12,
  // Auto-subscribe phase to phaseA bus when no explicit connection
  autoBusSubscriptions: {
    phase: 'phaseA',
  },});

/**
 * AddSignal - Add two signals
 *
 * Combines signals by addition. Useful for energy summation, modulation, etc.
 */
export const AddSignal = createBlock({

  type: 'AddSignal',
  label: 'Add',
  description: 'Add two signals element-wise',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('a', 'A', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
    input('b', 'B', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Sum', 'Signal<float>'),
  ],
  color: '#8B5CF6',
  priority: 20,});

/**
 * MulSignal - Multiply two signals
 *
 * Combines signals by multiplication. Useful for amplitude modulation, gating, etc.
 */
export const MulSignal = createBlock({

  type: 'MulSignal',
  label: 'Multiply',
  description: 'Multiply two signals element-wise',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('a', 'A', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    }),
    input('b', 'B', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Product', 'Signal<float>'),
  ],
  color: '#8B5CF6',
  priority: 21,});

/**
 * MinSignal - Component-wise minimum of two signals
 */
export const MinSignal = createBlock({

  type: 'MinSignal',
  label: 'Min',
  description: 'Component-wise minimum of two signals',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('a', 'A', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: Infinity, // Identity: min(x, ∞) = x
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
    input('b', 'B', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: Infinity, // Identity: min(x, ∞) = x
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Min', 'Signal<float>'),
  ],
  color: '#8B5CF6',
  priority: 22,});

/**
 * MaxSignal - Component-wise maximum of two signals
 */
export const MaxSignal = createBlock({

  type: 'MaxSignal',
  label: 'Max',
  description: 'Component-wise maximum of two signals',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('a', 'A', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: -Infinity, // Identity: max(x, -∞) = x
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
    input('b', 'B', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: -Infinity, // Identity: max(x, -∞) = x
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Max', 'Signal<float>'),
  ],
  color: '#8B5CF6',
  priority: 23,});

/**
 * ClampSignal - Clamp signal to range
 *
 * Both min/max are Signal world - ranges can be animated.
 */
export const ClampSignal = createBlock({

  type: 'ClampSignal',
  label: 'Clamp',
  description: 'Clamp signal values to a range',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('in', 'Input', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
    }),
    input('min', 'Min', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
    input('max', 'Max', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Output', 'Signal<float>'),
  ],
  color: '#8B5CF6',
  priority: 24,});
