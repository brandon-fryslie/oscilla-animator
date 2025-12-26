/**
 * @file HistoryBlock - Circular buffer state block
 * @description Maintains a fixed-size buffer of past signal values.
 *
 * Use cases:
 * - Motion trails: record path of moving object
 * - Echo effects: access values from T frames ago
 * - Smoothing filters: average over recent history
 * - Pattern detection: analyze trends in recent values
 *
 * Implementation:
 * - Fixed-size circular buffer
 * - Oldest values overwritten when full
 * - Returns chronologically ordered array (oldest to newest)
 *
 * Scrub policy: 'hold' - buffer freezes during scrubbing
 */

import type { TimeCtx } from '../TimeCtx';
import type { StateBlock, StateShape, StateMemory, ScrubPolicy } from '../StateBlock';
import { stateBlockRegistry } from '../StateBlock';

/**
 * History block parameters.
 */
export interface HistoryBlockParams {
  /** Buffer depth (number of samples to keep) */
  depth?: number;
}

/**
 * History block state.
 */
interface HistoryState {
  /** Circular buffer of values */
  buffer: number[];

  /** Write index (next position to write) */
  writeIndex: number;

  /** Total frames written (saturates at buffer size) */
  frameCounter: number;
}

/**
 * HistoryBlock - maintains a circular buffer of past values.
 *
 * Architecture:
 * - Explicit state (circular buffer + indices)
 * - Fixed-size allocation (no growth)
 * - Scrub policy: 'hold' (freeze during scrub)
 * - Deterministic ordering
 */
export class HistoryBlock implements StateBlock {
  readonly type = 'History';
  readonly scrubPolicy: ScrubPolicy = 'hold';

  private readonly params: Required<HistoryBlockParams>;

  constructor(params: HistoryBlockParams = {}) {
    // Clamp depth to reasonable range
    const depth = params.depth ?? 10;
    this.params = {
      depth: Math.max(1, Math.min(100, depth)),
    };
  }

  get stateShape(): StateShape {
    return {
      type: 'History',
      fields: {
        buffer: {
          type: 'buffer',
          defaultValue: [],
          size: this.params.depth,
        },
        writeIndex: {
          type: 'number',
          defaultValue: 0,
        },
        frameCounter: {
          type: 'number',
          defaultValue: 0,
        },
      },
      sizeHint: this.params.depth * 8, // depth * sizeof(double)
    };
  }

  initState(frame: number): StateMemory {
    const state: HistoryState = {
      buffer: new Array(this.params.depth).fill(0),
      writeIndex: 0,
      frameCounter: 0,
    };

    return {
      shape: this.stateShape,
      values: state as unknown as Record<string, unknown>,
      initFrame: frame,
    };
  }

  updateState(state: StateMemory, inputs: Record<string, unknown>, ctx: TimeCtx): void {
    // Only update buffer in performance mode
    if (ctx.mode !== 'performance') return;

    const historyState = state.values as unknown as HistoryState;
    const input = (inputs.input as number) ?? 0;

    // Write new value to circular buffer
    historyState.buffer[historyState.writeIndex] = input;

    // Advance write index (circular wrap)
    historyState.writeIndex = (historyState.writeIndex + 1) % this.params.depth;

    // Increment frame counter (saturates at buffer size)
    historyState.frameCounter = Math.min(
      historyState.frameCounter + 1,
      this.params.depth
    );
  }

  computeOutputs(
    state: StateMemory,
    _inputs: Record<string, unknown>,
    _ctx: TimeCtx
  ): Record<string, unknown> {
    const historyState = state.values as unknown as HistoryState;

    // Return buffer in chronological order (oldest to newest)
    const ordered = this.getOrderedBuffer(historyState);

    // Latest value is the most recently written
    const latest =
      historyState.frameCounter > 0
        ? historyState.buffer[
            (historyState.writeIndex - 1 + this.params.depth) % this.params.depth
          ]
        : 0;

    return {
      output: ordered,
      latest,
    };
  }

  reconstructState(_state: StateMemory, _targetTime: number, _ctx: TimeCtx): void {
    // For 'hold' policy, we don't reconstruct
    // The buffer remains frozen during scrubbing
  }

  /**
   * Get buffer contents in chronological order (oldest to newest).
   */
  private getOrderedBuffer(state: HistoryState): number[] {
    const { buffer, writeIndex, frameCounter } = state;

    // If buffer not full yet, return only filled portion
    if (frameCounter < this.params.depth) {
      return buffer.slice(0, frameCounter);
    }

    // Buffer is full - reorder from writeIndex (oldest) to writeIndex-1 (newest)
    return [
      ...buffer.slice(writeIndex),
      ...buffer.slice(0, writeIndex),
    ];
  }
}

/**
 * Factory function for creating History blocks from patch data.
 */
export function createHistoryBlock(params: Record<string, unknown>): HistoryBlock {
  return new HistoryBlock({
    depth: (params.depth as number) ?? 10,
  });
}

// Register History block in the state block registry
stateBlockRegistry.register('History', new HistoryBlock());
