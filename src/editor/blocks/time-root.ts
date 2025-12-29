/**
 * @file TimeRoot blocks - Define the time topology for a patch.
 *
 * Every patch MUST have exactly one TimeRoot block that defines:
 * - How time flows (finite, cyclic, or infinite)
 * - The primary time signal available to all time-derived blocks
 *
 * TimeRoot blocks are the foundation of the time model system.
 * They produce the TimeModel that the Player uses to configure playback.
 *
 * All TimeRoot params are Config world - changing them triggers TimeModel
 * rebuild and hot-swap (crossfade/freeze-fade).
 */
import { createBlock } from './factory';
import { input, output } from './utils';
import type { KernelBlockDefinition } from './types';

/**
 * FiniteTimeRoot - Finite performance with known duration.
 *
 * Use for animations that have a clear beginning and end.
 * Progress signal clamps to 1.0 after duration.
 *
 * Produces TimeModel: { kind: 'finite', durationMs }
 */
export const FiniteTimeRoot: KernelBlockDefinition = createBlock({
  type: 'FiniteTimeRoot',
  label: 'Finite Time',
  description: 'Finite performance with known duration',
  capability: 'time',
  kernelId: 'FiniteTimeRoot',
  inputs: [
    input('durationMs', 'Duration (ms)', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 5000,
        world: 'config', // Topology change triggers hot-swap
        uiHint: { kind: 'slider', min: 100, max: 30000, step: 100 },
      },
    }),
  ],
  outputs: [
    output('systemTime', 'System Time', 'Signal<time>'),
    output('progress', 'Progress', 'Signal<float>'),
    output('phase', 'Phase', 'Signal<phase>'),
    output('end', 'End Event', 'Event<any>'),
    output('energy', 'Energy', 'Signal<float>'),
  ],
  color: '#ef4444', // Red for finite
  subcategory: 'TimeRoot',
  priority: -10, // High priority to appear first
  // Auto-publish TimeRoot outputs to canonical buses (per design-docs/3-Synthesized/03-Buses.md)
  autoBusPublications: {
    phase: 'phaseA',
    progress: 'progress',
    energy: 'energy',
  },
}) as KernelBlockDefinition;

/**
 * CycleTimeRoot - Looping primary cycle.
 *
 * Use for animations that loop indefinitely.
 * Phase signal wraps at period boundary (0..1).
 *
 * Produces TimeModel: { kind: 'cyclic', periodMs, mode }
 */
export const CycleTimeRoot: KernelBlockDefinition = createBlock({
  type: 'CycleTimeRoot',
  label: 'Cycle Time',
  description: 'Looping primary cycle',
  capability: 'time',
  kernelId: 'CycleTimeRoot',
  inputs: [
    input('periodMs', 'Period (ms)', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 3000,
        world: 'config', // Period changes should snap to pulse boundary
        uiHint: { kind: 'slider', min: 100, max: 10000, step: 100 },
      },
    }),
    input('mode', 'Mode', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'loop',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'loop', label: 'Loop' },
            { value: 'pingpong', label: 'Ping-Pong' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('systemTime', 'System Time', 'Signal<time>'),
    output('cycleT', 'Cycle Time', 'Signal<time>'),
    output('phase', 'Phase', 'Signal<phase>'),
    output('wrap', 'Wrap Event', 'Event<any>'),
    output('cycleIndex', 'Cycle Index', 'Signal<int>'),
    output('energy', 'Energy', 'Signal<float>'),
  ],
  color: '#3b82f6', // Blue for cyclic
  subcategory: 'TimeRoot',
  priority: -9,
  // Auto-publish TimeRoot outputs to canonical buses (per design-docs/3-Synthesized/03-Buses.md)
  autoBusPublications: {
    phase: 'phaseA',
    wrap: 'pulse',
    energy: 'energy',
  },
}) as KernelBlockDefinition;

/**
 * InfiniteTimeRoot - Ambient, unbounded time (no primary cycle).
 *
 * Use for generative/ambient animations that run indefinitely.
 * Time advances unbounded without wrapping.
 *
 * Produces TimeModel: { kind: 'infinite', windowMs }
 */
export const InfiniteTimeRoot: KernelBlockDefinition = createBlock({
  type: 'InfiniteTimeRoot',
  label: 'Infinite Time',
  description: 'Ambient, unbounded time (no primary cycle)',
  capability: 'time',
  kernelId: 'InfiniteTimeRoot',
  inputs: [
    input('windowMs', 'Preview Window (ms)', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 10000,
        world: 'config', // UI-only, but still config for consistency
        uiHint: { kind: 'slider', min: 1000, max: 60000, step: 1000 },
      },
    }),
    input('periodMs', 'Ambient Period (ms)', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: {
        value: 10000,
        world: 'config',
        uiHint: { kind: 'slider', min: 1000, max: 60000, step: 1000 },
      },
    }),
  ],
  outputs: [
    output('systemTime', 'System Time', 'Signal<time>'),
    output('phase', 'Ambient Phase', 'Signal<phase>'),
    output('pulse', 'Ambient Pulse', 'Event<any>'),
    output('energy', 'Energy', 'Signal<float>'),
  ],
  color: '#8b5cf6', // Purple for infinite
  subcategory: 'TimeRoot',
  priority: -8,
  // Auto-publish TimeRoot outputs to canonical buses (per design-docs/3-Synthesized/03-Buses.md)
  autoBusPublications: {
    phase: 'phaseA',
    pulse: 'pulse',
    energy: 'energy',
  },
}) as KernelBlockDefinition;

/**
 * All TimeRoot block definitions for registration.
 */
export const TIME_ROOT_BLOCKS = [
  FiniteTimeRoot,
  CycleTimeRoot,
  InfiniteTimeRoot,
];
