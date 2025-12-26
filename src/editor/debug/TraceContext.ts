/**
 * TraceContext - Global Debug Trace Buffer Holder
 *
 * Provides singleton access to the trace buffers (SpanRing, ValueRing)
 * and the current DebugIndex. Used by the debug UI to inspect traces.
 *
 * Usage:
 * ```ts
 * // Get the singleton
 * const ctx = TraceContext.instance;
 *
 * // Get recent spans
 * const spans = ctx.spanRing.getSpansInRange(0, 100);
 *
 * // Set the active DebugIndex (when a new program compiles)
 * ctx.setDebugIndex(compileResult.debugIndex);
 *
 * // Clear buffers
 * ctx.clear();
 * ```
 */

import type { DebugIndex } from './DebugIndex';
import { SpanRing, DEFAULT_SPAN_CAPACITY } from './SpanRing';
import { ValueRing, DEFAULT_VALUE_CAPACITY } from './ValueRing';

/**
 * TraceContext holds all trace buffers and the current DebugIndex.
 *
 * This is a singleton to allow global access from:
 * - Instrumented closures (to write spans)
 * - Debug UI (to read spans and values)
 * - ScheduleExecutor (to write IR-based spans)
 */
export class TraceContext {
  private static _instance: TraceContext | undefined;

  static get instance(): TraceContext {
    if (!this._instance) {
      this._instance = new TraceContext();
    }
    return this._instance;
  }

  /** Span buffer for timing records */
  readonly spanRing: SpanRing;

  /** Value buffer for value samples */
  readonly valueRing: ValueRing;

  /** Current DebugIndex from most recent compilation */
  private _debugIndex: DebugIndex | null = null;

  private constructor() {
    this.spanRing = new SpanRing(DEFAULT_SPAN_CAPACITY);
    this.valueRing = new ValueRing(DEFAULT_VALUE_CAPACITY);
    console.log('[TraceContext] Initialized with span capacity:', DEFAULT_SPAN_CAPACITY);
  }

  /**
   * Get the current DebugIndex.
   * Returns null if no program has been compiled yet.
   */
  get debugIndex(): DebugIndex | null {
    return this._debugIndex;
  }

  /**
   * Set the active DebugIndex.
   * Called when a new program compiles successfully.
   *
   * @param index - New DebugIndex from CompileResult
   */
  setDebugIndex(index: DebugIndex | null): void {
    this._debugIndex = index;
    if (index) {
      console.log(
        `[TraceContext] DebugIndex set: ${index.blockCount()} blocks, ` +
          `${index.busCount()} buses, ${index.portCount()} ports`
      );
    }
  }

  /**
   * Clear all trace buffers.
   * Call when starting a new trace session.
   */
  clear(): void {
    this.spanRing.clear();
    this.valueRing.clear();
    console.log('[TraceContext] Buffers cleared');
  }

  /**
   * Get statistics about current buffer usage.
   */
  getStats(): {
    spanCount: number;
    spanCapacity: number;
    valueCount: number;
    valueCapacity: number;
    hasDebugIndex: boolean;
  } {
    return {
      spanCount: this.spanRing.size(),
      spanCapacity: this.spanRing.getCapacity(),
      valueCount: this.valueRing.size(),
      valueCapacity: this.valueRing.getCapacity(),
      hasDebugIndex: this._debugIndex !== null,
    };
  }

  /**
   * Reset instance (for testing only).
   * @internal
   */
  static _resetForTesting(): void {
    this._instance = undefined;
  }
}
