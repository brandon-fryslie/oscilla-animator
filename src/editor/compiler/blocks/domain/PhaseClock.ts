/**
 * PhaseClock Block Compiler
 *
 * Derived clock that transforms upstream time into phase [0,1].
 * Unlike the legacy PhaseClock, this block requires a time input from a TimeRoot.
 *
 * Outputs:
 * - phase: Signal<phase> in [0,1] based on mode (loop/once/pingpong)
 * - u: Signal<unit> clamped [0,1] progress for envelopes
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

export const PhaseClockBlock: BlockCompiler = {
  type: 'PhaseClock',

  inputs: [
    { name: 'tIn', type: { kind: 'Signal:Time' }, required: true },
  ],

  outputs: [
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'u', type: { kind: 'Signal:Unit' } },
  ],

  compile({ params, inputs }) {
    // Validate required input
    if (!inputs.tIn) {
      throw new Error('PhaseClock: tIn input required');
    }
    if (inputs.tIn.kind !== 'Signal:Time') {
      throw new Error(`PhaseClock: tIn must be Signal<time>, got ${inputs.tIn.kind}`);
    }

    const periodSec = Number(params.period ?? 3.0);
    const mode = String(params.mode ?? 'loop');

    if (periodSec <= 0) {
      throw new Error('PhaseClock: period must be > 0');
    }

    const periodMs = periodSec * 1000;
    const tInSignal = inputs.tIn.value as SignalNumber;

    // Compute phase from upstream time
    const phaseSignal: SignalNumber = (tMs, ctx) => {
      const t = tInSignal(tMs, ctx); // get unbounded time from upstream
      const raw = t / periodMs; // raw phase (unbounded)

      switch (mode) {
        case 'once':
          return Math.max(0, Math.min(1, raw));

        case 'pingpong': {
          const p = raw;
          const q = ((p % 2) + 2) % 2; // handle negatives correctly
          return q < 1 ? q : 2 - q;
        }

        case 'loop':
        default:
          return ((raw % 1) + 1) % 1; // handle negatives correctly
      }
    };

    // u output: clamped [0,1] for all modes
    // For loop mode: same as phase
    // For once mode: same as phase (already clamped)
    // For pingpong: we track absolute progress, clamped
    const uSignal: SignalNumber = (tMs, ctx) => {
      const t = tInSignal(tMs, ctx);
      const raw = t / periodMs;

      switch (mode) {
        case 'once':
          // u is clamped linear progress
          return Math.max(0, Math.min(1, raw));

        case 'pingpong': {
          // u tracks the absolute position within one forward-back cycle
          // A full pingpong cycle is 2 periods
          const fullCycleProgress = raw / 2; // [0,0.5,1] for a complete forward-back
          const clamped = Math.max(0, Math.min(1, fullCycleProgress));
          // Wrap to [0,1] range
          return ((clamped % 1) + 1) % 1;
        }

        case 'loop':
        default:
          // u equals phase for loop mode
          return ((raw % 1) + 1) % 1;
      }
    };

    return {
      phase: { kind: 'Signal:phase', value: phaseSignal },
      u: { kind: 'Signal:Unit', value: uSignal },
    };
  },
};
