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
 */
export const Oscillator = createBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  form: 'primitive',
  subcategory: 'Time',
  category: 'Time',
  description: 'Generate waveforms (sine, cosine, triangle, saw) from phase',
  inputs: [
    input('phase', 'Phase', 'Signal<phase>'),
  ],
  outputs: [
    output('out', 'Output', 'Signal<number>'),
  ],
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
 */
export const Shaper = createBlock({
  type: 'Shaper',
  label: 'Shaper',
  form: 'primitive',
  subcategory: 'Time',
  category: 'Time',
  description: 'Shape signals with tanh, sigmoid, smoothstep, etc.',
  inputs: [
    input('in', 'Input', 'Signal<number>'),
  ],
  outputs: [
    output('out', 'Output', 'Signal<number>'),
  ],
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
 */
export const ColorLFO = createBlock({
  type: 'ColorLFO',
  label: 'Color LFO',
  form: 'primitive',
  subcategory: 'Time',
  category: 'Time',
  description: 'Generate color from phase (hue rotation)',
  inputs: [
    input('phase', 'Phase', 'Signal<phase>'),
  ],
  outputs: [
    output('color', 'Color', 'Signal<color>'),
  ],
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
  form: 'primitive',
  subcategory: 'Math',
  category: 'Math',
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
  form: 'primitive',
  subcategory: 'Math',
  category: 'Math',
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
  form: 'primitive',
  subcategory: 'Math',
  category: 'Math',
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
  form: 'primitive',
  subcategory: 'Math',
  category: 'Math',
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
 */
export const ClampSignal = createBlock({
  type: 'ClampSignal',
  label: 'Clamp',
  form: 'primitive',
  subcategory: 'Math',
  category: 'Math',
  description: 'Clamp signal values to a range',
  inputs: [
    input('in', 'Input', 'Signal<number>'),
  ],
  outputs: [
    output('out', 'Output', 'Signal<number>'),
  ],
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

/**
 * PhaseClockLegacy - Legacy time-based phase progression.
 *
 * @deprecated Use CycleTimeRoot or PhaseClock with TimeRoot input instead.
 *
 * This block owns its own time and produces a phase signal that cycles 0->1.
 * Kept for backwards compatibility with existing patches.
 */
export const PhaseClockLegacy = createBlock({
  type: 'PhaseClockLegacy',
  label: 'Phase Clock (Legacy)',
  form: 'primitive',
  subcategory: 'Time',
  category: 'Time',
  description: '[Deprecated] Legacy phase clock that owns its own time. Use CycleTimeRoot instead.',
  inputs: [],
  outputs: [
    output('phase', 'Phase', 'Signal<number>'),
  ],
  paramSchema: [
    {
      key: 'duration',
      label: 'Duration (s)',
      type: 'number',
      min: 0.1,
      max: 60,
      step: 0.1,
      defaultValue: 3,
    },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'loop', label: 'Loop (0→1→0→1...)' },
        { value: 'pingpong', label: 'Ping-Pong (0→1→0→1...)' },
        { value: 'once', label: 'Once (0→1, then hold)' },
      ],
      defaultValue: 'loop',
    },
    {
      key: 'offset',
      label: 'Offset (s)',
      type: 'number',
      min: -10,
      max: 10,
      step: 0.1,
      defaultValue: 0,
    },
  ],
  color: '#F59E0B',
  laneKind: 'Phase',
  priority: 5,
});
