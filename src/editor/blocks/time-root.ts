/**
 * @file TimeRoot blocks - Define the time topology for a patch.
 *
 * Every patch MUST have exactly one TimeRoot block that defines:
 * - How time flows (finite, cyclic, or infinite)
 * - The primary time signal available to all time-derived blocks
 *
 * TimeRoot blocks are the foundation of the time model system.
 * They produce the TimeModel that the Player uses to configure playback.
 */
import { createBlock } from './factory';
import { output } from './utils';

/**
 * FiniteTimeRoot - Finite performance with known duration.
 *
 * Use for animations that have a clear beginning and end.
 * Progress signal clamps to 1.0 after duration.
 *
 * Produces TimeModel: { kind: 'finite', durationMs }
 */
export const FiniteTimeRoot = createBlock({
  type: 'FiniteTimeRoot',
  label: 'Finite Time',
  form: 'primitive',
  subcategory: 'TimeRoot',
  category: 'TimeRoot',
  description: 'Finite performance with known duration',
  inputs: [],
  outputs: [
    output('systemTime', 'System Time', 'Signal<time>'),
    output('progress', 'Progress', 'Signal<number>'),
  ],
  paramSchema: [
    {
      key: 'durationMs',
      label: 'Duration (ms)',
      type: 'number',
      min: 100,
      max: 30000,
      step: 100,
      defaultValue: 5000,
    },
  ],
  color: '#ef4444', // Red for finite
  laneKind: 'Phase',
  priority: -10, // High priority to appear first
});

/**
 * CycleTimeRoot - Looping primary cycle.
 *
 * Use for animations that loop indefinitely.
 * Phase signal wraps at period boundary (0..1).
 *
 * Produces TimeModel: { kind: 'cyclic', periodMs, mode }
 */
export const CycleTimeRoot = createBlock({
  type: 'CycleTimeRoot',
  label: 'Cycle Time',
  form: 'primitive',
  subcategory: 'TimeRoot',
  category: 'TimeRoot',
  description: 'Looping primary cycle',
  inputs: [],
  outputs: [
    output('systemTime', 'System Time', 'Signal<time>'),
    output('phaseA', 'Phase A', 'Signal<phase>'),
  ],
  paramSchema: [
    {
      key: 'periodMs',
      label: 'Period (ms)',
      type: 'number',
      min: 100,
      max: 10000,
      step: 100,
      defaultValue: 3000,
    },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'loop', label: 'Loop' },
        { value: 'pingpong', label: 'Ping-Pong' },
      ],
      defaultValue: 'loop',
    },
  ],
  color: '#3b82f6', // Blue for cyclic
  laneKind: 'Phase',
  priority: -9,
});

/**
 * InfiniteTimeRoot - Ambient, unbounded time (no primary cycle).
 *
 * Use for generative/ambient animations that run indefinitely.
 * Time advances unbounded without wrapping.
 *
 * Produces TimeModel: { kind: 'infinite', windowMs }
 */
export const InfiniteTimeRoot = createBlock({
  type: 'InfiniteTimeRoot',
  label: 'Infinite Time',
  form: 'primitive',
  subcategory: 'TimeRoot',
  category: 'TimeRoot',
  description: 'Ambient, unbounded time (no primary cycle)',
  inputs: [],
  outputs: [
    output('systemTime', 'System Time', 'Signal<time>'),
  ],
  paramSchema: [
    {
      key: 'windowMs',
      label: 'Preview Window (ms)',
      type: 'number',
      min: 1000,
      max: 60000,
      step: 1000,
      defaultValue: 10000,
    },
  ],
  color: '#8b5cf6', // Purple for infinite
  laneKind: 'Phase',
  priority: -8,
});

/**
 * All TimeRoot block definitions for registration.
 */
export const TIME_ROOT_BLOCKS = [
  FiniteTimeRoot,
  CycleTimeRoot,
  InfiniteTimeRoot,
];
