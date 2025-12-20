/**
 * @file LinearPhaseBlock - Simple linear phase progression
 * @description Outputs Signal<Phase> as simple linear progression.
 *
 * Architecture:
 * - Uses TimeCtx for time-based evaluation
 * - Stateless: phase(t) = fract((t + offset) / duration) when looping
 * - Non-looping: phase(t) = clamp((t + offset) / duration, 0, 1)
 * - Pure function: no hidden state, deterministic
 */

import type { TimeCtx } from '../TimeCtx';

/**
 * Phase value (normalized time [0, 1]).
 */
export type Phase = number;

/**
 * LinearPhase block parameters.
 */
export interface LinearPhaseParams {
  duration: number;
  looping: boolean;
  offset: number;
}

/**
 * Default parameters (in seconds).
 */
const DEFAULT_PARAMS: LinearPhaseParams = {
  duration: 1.0,
  looping: false,
  offset: 0,
};

/**
 * Calculate phase at given time.
 *
 * @param t - Absolute time in seconds
 * @param params - Linear phase parameters
 * @returns Phase value [0, 1]
 */
export function calculatePhase(
  t: number,
  params: LinearPhaseParams
): Phase {
  const { duration, looping, offset } = params;

  // Avoid division by zero
  if (duration === 0) {
    return 1;
  }

  const adjustedTime = t + offset;
  const rawPhase = adjustedTime / duration;

  if (looping) {
    // Looping: use fractional part
    const phase = rawPhase - Math.floor(rawPhase);
    return phase;
  } else {
    // Non-looping: clamp to [0, 1]
    return Math.max(0, Math.min(1, rawPhase));
  }
}

/**
 * Create LinearPhase Signal evaluator.
 *
 * @param params - Block parameters
 * @returns Signal evaluator function
 */
export function createLinearPhaseSignal(
  params: Partial<LinearPhaseParams> = {}
): (ctx: TimeCtx) => Phase {
  const fullParams: LinearPhaseParams = {
    ...DEFAULT_PARAMS,
    ...params,
  };

  // Return signal evaluator that reads from TimeCtx
  return (ctx: TimeCtx): Phase => {
    return calculatePhase(ctx.t, fullParams);
  };
}

/**
 * LinearPhaseBlock - generates simple linear phase progression.
 *
 * Example usage:
 * ```typescript
 * // Non-looping phase (0 → 1 over duration)
 * const signal = createLinearPhaseSignal({
 *   duration: 2.0,
 *   looping: false,
 *   offset: 0
 * });
 *
 * const phase = signal(timeCtx);
 * console.log(phase); // 0 at t=0, 0.5 at t=1, 1 at t=2
 *
 * // Looping phase (repeats every duration)
 * const loopingSignal = createLinearPhaseSignal({
 *   duration: 1.0,
 *   looping: true,
 *   offset: 0
 * });
 *
 * const loopPhase = loopingSignal(timeCtx);
 * console.log(loopPhase); // 0 at t=0, 0.5 at t=0.5, 0 at t=1, 0.5 at t=1.5
 * ```
 */
export const LinearPhaseBlock = {
  type: 'LinearPhase',

  /**
   * Create Signal for this block.
   */
  createSignal: createLinearPhaseSignal,

  /**
   * Calculate phase (stateless function).
   */
  calculatePhase,
} as const;
