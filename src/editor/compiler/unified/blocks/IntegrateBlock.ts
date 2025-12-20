/**
 * @file IntegrateBlock - Accumulator state block
 * @description Integrates (accumulates) a signal over time.
 *
 * Mathematical model:
 *   out(t) = out(t-1) + input(t) * dt
 *
 * Use cases:
 * - Physics: velocity → position
 * - Rotation: angular velocity → angle
 * - Opacity: fade rate → opacity value
 * - Phase: frequency → phase angle
 *
 * Scrub policy: 'hold' - accumulator freezes during scrubbing
 */

import type { TimeCtx } from '../TimeCtx';
import type { StateBlock, StateShape, StateMemory, ScrubPolicy } from '../StateBlock';
import { stateBlockRegistry } from '../StateBlock';

/**
 * Integrate block parameters.
 */
export interface IntegrateBlockParams {
  /** Initial accumulator value */
  initialValue?: number;
}

/**
 * Integrate block state.
 */
interface IntegrateState {
  /** Current accumulated value */
  accumulator: number;
}

/**
 * IntegrateBlock - accumulates input * dt over time.
 *
 * Architecture:
 * - Explicit state (accumulator value)
 * - Scrub policy: 'hold' (freeze during scrub)
 * - Pure accumulation in performance mode
 * - Deterministic (no hidden state)
 */
export class IntegrateBlock implements StateBlock {
  readonly type = 'Integrate';
  readonly scrubPolicy: ScrubPolicy = 'hold';

  private params: Required<IntegrateBlockParams>;

  constructor(params: IntegrateBlockParams = {}) {
    this.params = {
      initialValue: params.initialValue ?? 0,
    };
  }

  get stateShape(): StateShape {
    return {
      type: 'Integrate',
      fields: {
        accumulator: {
          type: 'number',
          defaultValue: this.params.initialValue,
        },
      },
      sizeHint: 8, // One double
    };
  }

  initState(frame: number): StateMemory {
    const state: IntegrateState = {
      accumulator: this.params.initialValue,
    };

    return {
      shape: this.stateShape,
      values: state as unknown as Record<string, unknown>,
      initFrame: frame,
    };
  }

  updateState(state: StateMemory, inputs: Record<string, unknown>, ctx: TimeCtx): void {
    // Only accumulate in performance mode
    if (ctx.mode !== 'performance') return;

    const integrateState = state.values as unknown as IntegrateState;
    const input = (inputs.input as number) ?? 0;

    // Accumulate: out = out + input * dt
    integrateState.accumulator += input * ctx.dt;
  }

  computeOutputs(
    state: StateMemory,
    _inputs: Record<string, unknown>,
    _ctx: TimeCtx
  ): Record<string, unknown> {
    const integrateState = state.values as unknown as IntegrateState;

    return {
      output: integrateState.accumulator,
    };
  }

  reconstructState(_state: StateMemory, _targetTime: number, _ctx: TimeCtx): void {
    // For 'hold' policy, we don't reconstruct
    // The accumulator remains at its current value during scrubbing
  }
}

/**
 * Factory function for creating Integrate blocks from patch data.
 */
export function createIntegrateBlock(params: Record<string, unknown>): IntegrateBlock {
  return new IntegrateBlock({
    initialValue: (params.initialValue as number) ?? 0,
  });
}

// Register Integrate block in the state block registry
stateBlockRegistry.register('Integrate', new IntegrateBlock());
