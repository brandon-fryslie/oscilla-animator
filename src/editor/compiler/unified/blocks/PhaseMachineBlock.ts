/**
 * @file PhaseMachineBlock - Animation phase lifecycle
 * @description Outputs Signal<PhaseSample> with entrance/hold/exit lifecycle.
 *
 * Architecture:
 * - Uses TimeCtx for absolute time-based phase calculation (stateless)
 * - Scrub-perfect: deterministic phase at any time t (no state required)
 * - Phase calculation: entrance [0, ed], hold (ed, ed+hd], exit (ed+hd, ed+hd+exd]
 * - Pure function: phase(t) depends only on t and durations
 */

import type { TimeCtx } from '../TimeCtx';

/**
 * Animation phase type.
 */
export type PhaseType = 'entrance' | 'hold' | 'exit';

/**
 * Phase sample - current phase state at time t.
 */
export interface PhaseSample {
  /** Current phase */
  phase: PhaseType;

  /** Eased progress in current phase [0, 1] */
  u: number;

  /** Raw (linear) progress in current phase [0, 1] */
  uRaw: number;

  /** Local time within current phase (seconds) */
  tLocal: number;
}

/**
 * PhaseMachine block parameters.
 */
export interface PhaseMachineParams {
  entranceDuration: number;
  holdDuration: number;
  exitDuration: number;
}

/**
 * Default parameters (in seconds).
 */
const DEFAULT_PARAMS: PhaseMachineParams = {
  entranceDuration: 2.5,
  holdDuration: 2.0,
  exitDuration: 0.5,
};

/**
 * Easing functions.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return Math.pow(t, 3);
}

/**
 * Calculate phase sample at given time.
 *
 * @param t - Absolute time in seconds
 * @param params - Phase machine parameters
 * @returns Phase sample at time t
 */
export function calculatePhaseSample(
  t: number,
  params: PhaseMachineParams
): PhaseSample {
  const { entranceDuration, holdDuration, exitDuration } = params;

  const totalDuration = entranceDuration + holdDuration + exitDuration;

  // Clamp time to valid range
  const tClamped = Math.max(0, Math.min(t, totalDuration));

  // Handle edge case: all durations are 0
  if (totalDuration === 0) {
    return {
      phase: 'exit',
      u: 1,
      uRaw: 1,
      tLocal: 0,
    };
  }

  // Determine which phase we're in
  // Use < for boundaries, but include endpoints in the appropriate phase

  const entranceEnd = entranceDuration;
  const holdEnd = entranceDuration + holdDuration;

  if (tClamped < entranceEnd) {
    // Entrance phase (strictly before entrance end)
    const tLocal = tClamped;
    const uRaw = entranceDuration > 0 ? tLocal / entranceDuration : 1;
    const u = easeOutCubic(uRaw);

    return {
      phase: 'entrance',
      u,
      uRaw,
      tLocal,
    };
  }

  if (tClamped === entranceEnd && entranceDuration > 0) {
    // At entrance/hold boundary
    if (holdDuration === 0) {
      // Skip hold, go to exit
      return {
        phase: 'exit',
        u: 0,
        uRaw: 0,
        tLocal: 0,
      };
    } else {
      // At end of entrance (entrance includes its endpoint)
      return {
        phase: 'entrance',
        u: 1,
        uRaw: 1,
        tLocal: entranceDuration,
      };
    }
  }

  if (tClamped < holdEnd) {
    // Hold phase (strictly before hold end)
    const tLocal = tClamped - entranceDuration;
    const uRaw = holdDuration > 0 ? tLocal / holdDuration : 1;

    return {
      phase: 'hold',
      u: uRaw,
      uRaw,
      tLocal,
    };
  }

  if (tClamped === holdEnd && holdDuration > 0) {
    // At hold/exit boundary (hold includes its endpoint when exit has duration)
    if (exitDuration === 0) {
      return {
        phase: 'exit',
        u: 1,
        uRaw: 1,
        tLocal: exitDuration,
      };
    } else {
      return {
        phase: 'exit',
        u: 0,
        uRaw: 0,
        tLocal: 0,
      };
    }
  }

  // Exit phase
  const tLocal = tClamped - entranceDuration - holdDuration;
  const uRaw = exitDuration > 0 ? tLocal / exitDuration : 1;
  const u = easeInCubic(uRaw);

  return {
    phase: 'exit',
    u,
    uRaw,
    tLocal,
  };
}

/**
 * Create PhaseMachine Signal evaluator.
 *
 * @param params - Block parameters
 * @returns Signal evaluator function
 */
export function createPhaseMachineSignal(
  params: Partial<PhaseMachineParams> = {}
): (ctx: TimeCtx) => PhaseSample {
  const fullParams: PhaseMachineParams = {
    ...DEFAULT_PARAMS,
    ...params,
  };

  // Return signal evaluator that reads from TimeCtx
  return (ctx: TimeCtx): PhaseSample => {
    return calculatePhaseSample(ctx.t, fullParams);
  };
}

/**
 * PhaseMachineBlock - generates animation phase lifecycle.
 *
 * Example usage:
 * ```typescript
 * const signal = createPhaseMachineSignal({
 *   entranceDuration: 1.0,
 *   holdDuration: 2.0,
 *   exitDuration: 0.5
 * });
 *
 * const sample = signal(timeCtx);
 * console.log(sample.phase, sample.u);
 * ```
 */
export const PhaseMachineBlock = {
  type: 'PhaseMachine',

  /**
   * Create Signal for this block.
   */
  createSignal: createPhaseMachineSignal,

  /**
   * Calculate phase sample (stateless function).
   */
  calculateSample: calculatePhaseSample,
} as const;
