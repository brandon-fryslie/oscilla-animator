/**
 * @file DelayBlock - Time delay state block
 * @description Delays a signal by a specified duration.
 *
 * This is a proof-of-concept state block demonstrating:
 * - Explicit state declaration
 * - Scrub policy handling
 * - Ring buffer for history
 * - Deterministic behavior
 */

import type { TimeCtx } from '../TimeCtx';
import type { StateBlock, StateShape, StateMemory, ScrubPolicy } from '../StateBlock';

/**
 * Delay block configuration.
 */
export interface DelayBlockParams {
  /** Delay duration in seconds */
  delay: number;

  /** Buffer size (number of samples to keep) */
  bufferSize?: number;
}

/**
 * Delay block state.
 */
interface DelayState {
  /** Ring buffer of (time, value) pairs */
  buffer: Array<{ t: number; value: unknown }>;

  /** Ring buffer write position */
  writePos: number;

  /** Number of samples in buffer */
  count: number;

  /** Last output value (for hold) */
  lastOutput: unknown;
}

/**
 * DelayBlock - delays an input signal by a specified duration.
 *
 * Architecture notes:
 * - Uses ring buffer to store past values
 * - Buffer size determines maximum delay
 * - Scrub policy: 'hold' (freeze at current value during scrubbing)
 * - Reconstruction: linear search through buffer
 */
export class DelayBlock implements StateBlock {
  readonly type = 'Delay';
  readonly scrubPolicy: ScrubPolicy = 'hold';

  private readonly params: DelayBlockParams;

  constructor(params: DelayBlockParams) {
    this.params = {
      delay: params.delay,
      bufferSize: params.bufferSize ?? 60, // Default 60 samples (~1 second at 60fps)
    };
  }

  get stateShape(): StateShape {
    return {
      type: 'Delay',
      fields: {
        buffer: {
          type: 'buffer',
          defaultValue: [],
          size: this.params.bufferSize,
        },
        writePos: {
          type: 'number',
          defaultValue: 0,
        },
        count: {
          type: 'number',
          defaultValue: 0,
        },
        lastOutput: {
          type: 'number',
          defaultValue: 0,
        },
      },
      sizeHint: this.params.bufferSize! * 16, // ~16 bytes per entry
    };
  }

  initState(frame: number): StateMemory {
    const state: DelayState = {
      buffer: new Array(this.params.bufferSize).fill(null).map(() => ({ t: 0, value: 0 })),
      writePos: 0,
      count: 0,
      lastOutput: 0,
    };

    return {
      shape: this.stateShape,
      values: state as unknown as Record<string, unknown>,
      initFrame: frame,
    };
  }

  updateState(state: StateMemory, _inputs: Record<string, unknown>, ctx: TimeCtx): void {
    const delayState = state.values as unknown as DelayState;
    const inputValue = _inputs.input ?? 0;

    // Only update buffer in performance mode
    if (ctx.mode === 'performance') {
      // Write new sample to buffer
      delayState.buffer[delayState.writePos] = { t: ctx.t, value: inputValue };
      delayState.writePos = (delayState.writePos + 1) % this.params.bufferSize!;
      delayState.count = Math.min(delayState.count + 1, this.params.bufferSize!);
    }
  }

  computeOutputs(
    state: StateMemory,
    _inputs: Record<string, unknown>,
    ctx: TimeCtx
  ): Record<string, unknown> {
    const delayState = state.values as unknown as DelayState;
    const targetTime = ctx.t - this.params.delay;

    // If no samples yet, return default
    if (delayState.count === 0) {
      return { output: 0 };
    }

    // Find the sample closest to target time
    let bestSample = delayState.buffer[0];
    let bestDiff = Math.abs(bestSample.t - targetTime);

    for (let i = 1; i < delayState.count; i++) {
      const sample = delayState.buffer[i];
      const diff = Math.abs(sample.t - targetTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSample = sample;
      }
    }

    const output = bestSample.value;
    delayState.lastOutput = output;

    return { output };
  }

  reconstructState(_state: StateMemory, _targetTime: number, _ctx: TimeCtx): void {
    // For hold policy, we don't need to reconstruct
    // Just maintain the last output value
    // In a more sophisticated implementation, we could:
    // 1. Clear the buffer
    // 2. Replay from t=0 to targetTime
    // 3. Rebuild the buffer
    // But that's expensive and not needed for 'hold' policy
  }
}

/**
 * Factory function for creating Delay blocks from patch data.
 */
export function createDelayBlock(params: Record<string, unknown>): DelayBlock {
  return new DelayBlock({
    delay: (params.delay as number) ?? 0.5,
    bufferSize: (params.bufferSize as number) ?? 60,
  });
}
