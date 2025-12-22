/**
 * @file Signal blocks - Signal processing primitives
 *
 * These blocks process time-indexed Signal values.
 * They can subscribe from buses (like phaseA) and publish to buses (like energy).
 */
import { createBlock } from './factory';
import { input, output } from './utils';

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
export const Oscillator = createBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  description: 'Generate waveforms (sine, cosine, triangle, saw) from phase',
  inputs: [
    input('phase', 'Phase', 'Signal<phase>'),
    // Former params - now inputs with default sources
    input('shape', 'Waveform', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'sine',
        world: 'config', // Enum selection triggers hot-swap, not per-frame eval
        uiHint: {
          kind: 'select',
          options: [
            { value: 'sine', label: 'Sine' },
            { value: 'cosine', label: 'Cosine' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'saw', label: 'Sawtooth' },
          ],
        },
      },
    }),
    input('amplitude', 'Amplitude', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal', // Continuous modulation allowed
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    }),
    input('bias', 'Bias', 'Signal<number>', {
      tier: 'secondary', // Less commonly tweaked
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Output', 'Signal<number>'),
  ],
  // TODO: Remove paramSchema after compiler updated to use defaultSource (Phase 4)
  paramSchema: [
    {
      key: 'shape',
      label: 'Waveform',
      type: 'select',
      options: [
        { value: 'sine', label: 'Sine' },
        { value: 'cosine', label: 'Cosine' },
        { value: 'triangle', label: 'Triangle' },
        { value: 'saw', label: 'Sawtooth' },
      ],
      defaultValue: 'sine',
    },
    {
      key: 'amplitude',
      label: 'Amplitude',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.1,
      defaultValue: 1,
    },
    {
      key: 'bias',
      label: 'Bias',
      type: 'number',
      min: -10,
      max: 10,
      step: 0.1,
      defaultValue: 0,
    },
  ],
  color: '#3B82F6',
  laneKind: 'Phase',
  priority: 10,
});

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
  inputs: [
    input('in', 'Input', 'Signal<number>'),
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
    input('amount', 'Amount', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0.1, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Output', 'Signal<number>'),
  ],
  // TODO: Remove paramSchema after compiler updated (Phase 4)
  paramSchema: [
    {
      key: 'kind',
      label: 'Shape',
      type: 'select',
      options: [
        { value: 'tanh', label: 'Tanh' },
        { value: 'softclip', label: 'Soft Clip' },
        { value: 'sigmoid', label: 'Sigmoid' },
        { value: 'smoothstep', label: 'Smoothstep' },
        { value: 'pow', label: 'Power' },
      ],
      defaultValue: 'smoothstep',
    },
    {
      key: 'amount',
      label: 'Amount',
      type: 'number',
      min: 0.1,
      max: 10,
      step: 0.1,
      defaultValue: 1,
    },
  ],
  color: '#3B82F6',
  laneKind: 'Phase',
  priority: 11,
});

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
  inputs: [
    input('phase', 'Phase', 'Signal<phase>'),
    input('base', 'Base Color', 'Signal<color>', {
      tier: 'primary',
      defaultSource: {
        value: '#3B82F6',
        world: 'signal',
        uiHint: { kind: 'color' },
      },
    }),
    input('hueSpan', 'Hue Span', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 180,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 360, step: 1 },
      },
    }),
    input('sat', 'Saturation', 'Signal<number>', {
      tier: 'secondary',
      defaultSource: {
        value: 0.8,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
    input('light', 'Lightness', 'Signal<number>', {
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
  // TODO: Remove paramSchema after compiler updated (Phase 4)
  paramSchema: [
    {
      key: 'base',
      label: 'Base Color',
      type: 'color',
      defaultValue: '#3B82F6',
    },
    {
      key: 'hueSpan',
      label: 'Hue Span',
      type: 'number',
      min: 0,
      max: 360,
      step: 1,
      defaultValue: 180,
    },
    {
      key: 'sat',
      label: 'Saturation',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.8,
    },
    {
      key: 'light',
      label: 'Lightness',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
    },
  ],
  color: '#F59E0B',
  laneKind: 'Phase',
  priority: 12,
});

/**
 * AddSignal - Add two signals
 *
 * Combines signals by addition. Useful for energy summation, modulation, etc.
 */
export const AddSignal = createBlock({
  type: 'AddSignal',
  label: 'Add',
  description: 'Add two signals element-wise',
  inputs: [
    input('a', 'A', 'Signal<number>'),
    input('b', 'B', 'Signal<number>'),
  ],
  outputs: [
    output('out', 'Sum', 'Signal<number>'),
  ],
  paramSchema: [],
  color: '#8B5CF6',
  laneKind: 'Phase',
  priority: 20,
});

/**
 * MulSignal - Multiply two signals
 *
 * Combines signals by multiplication. Useful for amplitude modulation, gating, etc.
 */
export const MulSignal = createBlock({
  type: 'MulSignal',
  label: 'Multiply',
  description: 'Multiply two signals element-wise',
  inputs: [
    input('a', 'A', 'Signal<number>'),
    input('b', 'B', 'Signal<number>'),
  ],
  outputs: [
    output('out', 'Product', 'Signal<number>'),
  ],
  paramSchema: [],
  color: '#8B5CF6',
  laneKind: 'Phase',
  priority: 21,
});

/**
 * MinSignal - Component-wise minimum of two signals
 */
export const MinSignal = createBlock({
  type: 'MinSignal',
  label: 'Min',
  description: 'Component-wise minimum of two signals',
  inputs: [
    input('a', 'A', 'Signal<number>'),
    input('b', 'B', 'Signal<number>'),
  ],
  outputs: [
    output('out', 'Min', 'Signal<number>'),
  ],
  paramSchema: [],
  color: '#8B5CF6',
  laneKind: 'Phase',
  priority: 22,
});

/**
 * MaxSignal - Component-wise maximum of two signals
 */
export const MaxSignal = createBlock({
  type: 'MaxSignal',
  label: 'Max',
  description: 'Component-wise maximum of two signals',
  inputs: [
    input('a', 'A', 'Signal<number>'),
    input('b', 'B', 'Signal<number>'),
  ],
  outputs: [
    output('out', 'Max', 'Signal<number>'),
  ],
  paramSchema: [],
  color: '#8B5CF6',
  laneKind: 'Phase',
  priority: 23,
});

/**
 * ClampSignal - Clamp signal to range
 *
 * Both min/max are Signal world - ranges can be animated.
 */
export const ClampSignal = createBlock({
  type: 'ClampSignal',
  label: 'Clamp',
  description: 'Clamp signal values to a range',
  inputs: [
    input('in', 'Input', 'Signal<number>'),
    input('min', 'Min', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
    input('max', 'Max', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('out', 'Output', 'Signal<number>'),
  ],
  // TODO: Remove paramSchema after compiler updated (Phase 4)
  paramSchema: [
    {
      key: 'min',
      label: 'Min',
      type: 'number',
      min: -100,
      max: 100,
      step: 0.1,
      defaultValue: 0,
    },
    {
      key: 'max',
      label: 'Max',
      type: 'number',
      min: -100,
      max: 100,
      step: 0.1,
      defaultValue: 1,
    },
  ],
  color: '#8B5CF6',
  laneKind: 'Phase',
  priority: 24,
});
