/**
 * TimeRoot Block Compilers
 *
 * Define the time topology for a patch. Every patch needs exactly one TimeRoot.
 * These blocks produce the primary time signals that other blocks consume.
 */

import type {
  BlockCompiler,
  RuntimeCtx,
  CompiledOutputs,
  AutoPublication
} from '../../types';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;
type Event = (tMs: number, lastTMs: number, ctx: RuntimeCtx) => boolean;

/**
 * Helper to extract auto-publications from a TimeRoot compilation.
 * This is used by the main compiler to inject system bus publishers.
 */
export function extractTimeRootAutoPublications(
  blockType: string,
  _artifacts: CompiledOutputs
): AutoPublication[] {
  switch (blockType) {
    case 'CycleTimeRoot':
      return [
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'wrap', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    case 'FiniteTimeRoot':
      return [
        { busName: 'progress', artifactKey: 'progress', sortKey: 0 },
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'end', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    case 'InfiniteTimeRoot':
      return [
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'pulse', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    default:
      return [];
  }
}

/**
 * FiniteTimeRoot - Finite performance with known duration.
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - progress: 0..1 clamped (reaches 1 at durationMs and stays there)
 * - end: Event that fires once when progress reaches 1
 * - energy: Constant 1.0 while animating, 0 when complete
 */
export const FiniteTimeRootBlock: BlockCompiler = {
  type: 'FiniteTimeRoot',

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'progress', type: { kind: 'Signal:number' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'end', type: { kind: 'Event' } },
    { name: 'energy', type: { kind: 'Signal:number' } },
  ],

  compile({ params }): CompiledOutputs {
    const durationMs = Number(params.durationMs ?? 5000);

    // System time is identity (tMs passed in is the raw time)
    const systemTime: SignalNumber = (tMs) => tMs;

    // Progress clamps at 1 after duration
    const progress: SignalNumber = (tMs) => {
      if (tMs <= 0) return 0;
      if (tMs >= durationMs) return 1;
      return tMs / durationMs;
    };

    // Phase is same as progress for FiniteTimeRoot (0..1 clamped)
    const phase: SignalNumber = (tMs) => {
      if (tMs <= 0) return 0;
      if (tMs >= durationMs) return 1;
      return tMs / durationMs;
    };

    // End event fires exactly once when progress reaches 1
    const end: Event = (tMs, lastTMs) => {
      const currProgress = Math.min(tMs / durationMs, 1);
      const lastProgress = Math.min(lastTMs / durationMs, 1);
      return currProgress >= 1 && lastProgress < 1;
    };

    // Energy is 1.0 while animating, 0 when complete
    const energy: SignalNumber = (tMs) => {
      return tMs < durationMs ? 1.0 : 0.0;
    };

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      progress: { kind: 'Signal:number', value: progress },
      phase: { kind: 'Signal:phase', value: phase },
      end: { kind: 'Event', value: end },
      energy: { kind: 'Signal:number', value: energy },
    };
  },
};

/**
 * CycleTimeRoot - Looping primary cycle.
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - cycleT: Time within current cycle (0..period or pingpong)
 * - phase: 0..1 wrapped at period (sawtooth or triangle wave)
 * - wrap: Event that fires on cycle boundary or direction change
 * - cycleIndex: Number of completed cycles
 * - energy: Constant 1.0 baseline
 */
export const CycleTimeRootBlock: BlockCompiler = {
  type: 'CycleTimeRoot',

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'cycleT', type: { kind: 'Signal:Time' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'wrap', type: { kind: 'Event' } },
    { name: 'cycleIndex', type: { kind: 'Signal:number' } },
    { name: 'energy', type: { kind: 'Signal:number' } },
  ],

  compile({ params }): CompiledOutputs {
    const periodMs = Number(params.periodMs ?? 3000);
    const mode = String(params.mode ?? 'loop');

    // System time is identity
    const systemTime: SignalNumber = (tMs) => tMs;

    // Phase wraps at period
    const phase: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;

      const cycles = tMs / periodMs;
      const phaseValue = cycles - Math.floor(cycles); // 0..1

      if (mode === 'pingpong') {
        // Triangle wave: 0→1→0→1...
        const cycleNum = Math.floor(cycles);
        return (cycleNum % 2 === 0) ? phaseValue : (1 - phaseValue);
      }

      // Default loop: sawtooth wave
      return phaseValue;
    };

    // Time within current cycle
    const cycleT: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;
      return tMs % periodMs;
    };

    // Cycle index: number of completed cycles
    const cycleIndex: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;
      return Math.floor(tMs / periodMs);
    };

    // Wrap event: fires on cycle boundary (loop) or direction change (pingpong)
    const wrap: Event = (tMs, lastTMs) => {
      if (tMs < 0 || lastTMs < 0) return false;

      const currCycle = Math.floor(tMs / periodMs);
      const lastCycle = Math.floor(lastTMs / periodMs);

      if (mode === 'pingpong') {
        // Wrap on direction change (even/odd cycle boundary)
        return currCycle !== lastCycle;
      }

      // Wrap on cycle boundary (sawtooth)
      return currCycle > lastCycle;
    };

    // Energy is constant 1.0 baseline (steady loops)
    const energy: SignalNumber = (_tMs) => 1.0;

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      cycleT: { kind: 'Signal:Time', value: cycleT },
      phase: { kind: 'Signal:phase', value: phase },
      wrap: { kind: 'Event', value: wrap },
      cycleIndex: { kind: 'Signal:number', value: cycleIndex },
      energy: { kind: 'Signal:number', value: energy },
    };
  },
};

/**
 * InfiniteTimeRoot - Ambient, unbounded time (no primary cycle).
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - energy: Constant 1.0 for ambient content
 */
export const InfiniteTimeRootBlock: BlockCompiler = {
  type: 'InfiniteTimeRoot',

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'pulse', type: { kind: 'Event' } },
    { name: 'energy', type: { kind: 'Signal:number' } },
  ],

  compile({ params }): CompiledOutputs {
    // System time is identity - just passes through the raw time
    const systemTime: SignalNumber = (tMs) => tMs;
    const periodMs = Number(params.periodMs ?? 10000);

    // Ambient phase: simple 0..1 loop based on periodMs
    const phase: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;
      const cycles = tMs / periodMs;
      return cycles - Math.floor(cycles);
    };

    // Ambient pulse: fires on cycle boundary
    const pulse: Event = (tMs, lastTMs) => {
      if (tMs < 0 || lastTMs < 0) return false;
      const currCycle = Math.floor(tMs / periodMs);
      const lastCycle = Math.floor(lastTMs / periodMs);
      return currCycle > lastCycle;
    };

    // Energy is constant 1.0 for ambient content
    const energy: SignalNumber = (_tMs) => 1.0;

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      phase: { kind: 'Signal:phase', value: phase },
      pulse: { kind: 'Event', value: pulse },
      energy: { kind: 'Signal:number', value: energy },
    };
  },
};