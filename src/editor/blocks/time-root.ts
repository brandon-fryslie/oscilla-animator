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
import { parseTypeDesc } from '../ir/types/TypeDesc';

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
    input('durationMs', 'Duration (ms)', parseTypeDesc('Signal:float'), {
      tier: 'primary',
      defaultSource: {
        value: 5000,
        world: 'config', // Topology change triggers hot-swap
        uiHint: { kind: 'slider', min: 100, max: 30000, step: 100 },
      },
    }),
  ],
  outputs: [
    output('systemTime', 'System Time', parseTypeDesc('Signal:time')),
    output('progress', 'Progress', parseTypeDesc('Signal:float')),
    output('phase', 'Phase', parseTypeDesc('Signal:float')),
    output('end', 'End Event', parseTypeDesc('Event:trigger')),
    output('energy', 'Energy', parseTypeDesc('Signal:float')),
  ],
  color: '#ef4444', // Red for finite
  subcategory: 'TimeRoot',
  priority: -10, // High priority to appear first
  // Auto-publish TimeRoot outputs to canonical buses (per design-docs/3-Synthesized/03-Buses.md)
  autoBusPublications: {
    phase: ['phaseA', 'phaseB'],
    progress: 'progress',
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
  // TimeRoot has NO inputs - it's the source of time. Config (periodMs) comes from block.params.
  inputs: [],
  outputs: [
    output('systemTime', 'System Time', parseTypeDesc('Signal:time')),
    output('phase', 'Ambient Phase', parseTypeDesc('Signal:float')),
    output('pulse', 'Ambient Pulse', parseTypeDesc('Event:trigger')),
    output('energy', 'Energy', parseTypeDesc('Signal:float')),
  ],
  color: '#8b5cf6', // Purple for infinite
  subcategory: 'TimeRoot',
  priority: -8,
  // Auto-publish TimeRoot outputs to canonical buses (per design-docs/3-Synthesized/03-Buses.md)
  autoBusPublications: {
    phase: ['phaseA', 'phaseB'],
    pulse: 'pulse',
    energy: 'energy',
  },
}) as KernelBlockDefinition;

/**
 * All TimeRoot block definitions for registration.
 */
export const TIME_ROOT_BLOCKS = [
  FiniteTimeRoot,
  InfiniteTimeRoot,
];
