/**
 * TimeRoot Block Compilers
 *
 * Define the time topology for a patch. Every patch needs exactly one TimeRoot.
 * These blocks produce the primary time signals that other blocks consume.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

/**
 * FiniteTimeRoot - Finite performance with known duration.
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - progress: 0..1 clamped (reaches 1 at durationMs and stays there)
 */
export const FiniteTimeRootBlock: BlockCompiler = {
  type: 'FiniteTimeRoot',

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'progress', type: { kind: 'Signal:number' } },
  ],

  compile({ params }) {
    const durationMs = Number(params.durationMs ?? 5000);

    // System time is identity (tMs passed in is the raw time)
    const systemTime: SignalNumber = (tMs) => tMs;

    // Progress clamps at 1 after duration
    const progress: SignalNumber = (tMs) => {
      if (tMs <= 0) return 0;
      if (tMs >= durationMs) return 1;
      return tMs / durationMs;
    };

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      progress: { kind: 'Signal:number', value: progress },
    };
  },
};

/**
 * CycleTimeRoot - Looping primary cycle.
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - phaseA: 0..1 wrapped at period (sawtooth or triangle wave)
 */
export const CycleTimeRootBlock: BlockCompiler = {
  type: 'CycleTimeRoot',

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'phaseA', type: { kind: 'Signal:phase' } },
  ],

  compile({ params }) {
    const periodMs = Number(params.periodMs ?? 3000);
    const mode = String(params.mode ?? 'loop');

    // System time is identity
    const systemTime: SignalNumber = (tMs) => tMs;

    // Phase wraps at period
    const phaseA: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;

      const cycles = tMs / periodMs;
      const phase = cycles - Math.floor(cycles); // 0..1

      if (mode === 'pingpong') {
        // Triangle wave: 0→1→0→1...
        const cycleNum = Math.floor(cycles);
        return (cycleNum % 2 === 0) ? phase : (1 - phase);
      }

      // Default loop: sawtooth wave
      return phase;
    };

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      phaseA: { kind: 'Signal:phase', value: phaseA },
    };
  },
};

/**
 * InfiniteTimeRoot - Ambient, unbounded time (no primary cycle).
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 */
export const InfiniteTimeRootBlock: BlockCompiler = {
  type: 'InfiniteTimeRoot',

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
  ],

  compile({ params: _params }) {
    // System time is identity - just passes through the raw time
    const systemTime: SignalNumber = (tMs) => tMs;

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
    };
  },
};
