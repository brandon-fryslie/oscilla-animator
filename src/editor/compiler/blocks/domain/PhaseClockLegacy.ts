/**
 * PhaseClockLegacy Block Compiler
 *
 * @deprecated Use the new PhaseClock with TimeRoot input instead.
 *
 * Legacy time-based phase progression that owns its own time.
 * Produces a Signal<number> that cycles from 0 to 1 based on duration and mode.
 *
 * This block is deprecated because it competes with the player for time topology control.
 * New patches should use PhaseClock with a TimeRoot input for explicit time management.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

export const PhaseClockLegacyBlock: BlockCompiler = {
  type: 'PhaseClockLegacy',

  inputs: [],

  outputs: [
    { name: 'phase', type: { kind: 'Signal:number' } },
  ],

  compile({ params }) {
    const durationSec = Number(params.duration ?? 3.0);
    const mode = String(params.mode ?? 'loop');
    const offsetSec = Number(params.offset ?? 0.0);

    const durationMs = durationSec * 1000;
    const offsetMs = offsetSec * 1000;

    const signal: SignalNumber = (tMs) => {
      const t = tMs + offsetMs;

      if (t < 0) return 0;

      switch (mode) {
        case 'once': {
          // Clamp at 1 after duration
          const progress = t / durationMs;
          return Math.min(1, Math.max(0, progress));
        }
        case 'pingpong': {
          // Oscillate between 0 and 1
          const cycle = t / durationMs;
          const phase = cycle % 2;
          return phase < 1 ? phase : 2 - phase;
        }
        case 'loop':
        default: {
          // Loop 0 to 1
          return (t % durationMs) / durationMs;
        }
      }
    };

    return {
      phase: { kind: 'Signal:number', value: signal },
    };
  },
};
