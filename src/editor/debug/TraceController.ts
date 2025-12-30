/**
 * TraceController - Debug Trace Mode Control
 *
 * Provides global control over debug instrumentation overhead.
 * Three modes:
 * - 'off': Zero overhead, all wrappers skip instrumentation
 * - 'timing': Emit spans only, no value samples
 * - 'full': Emit spans + value samples (FieldStats, scalar samples)
 *
 * Mode persists across hot reloads via localStorage.
 *
 * Also manages ring buffers for value and span storage.
 */

import { ValueRing, DEFAULT_VALUE_CAPACITY } from './ValueRing';
import { SpanRing, DEFAULT_SPAN_CAPACITY } from './SpanRing';
import type { ValueRecord32 } from './ValueRecord';
import type { SpanData } from './SpanTypes';

export type TraceMode = 'off' | 'timing' | 'full';

const STORAGE_KEY = 'oscilla.debug.traceMode';

/**
 * TraceController manages the debug instrumentation mode.
 *
 * Use the global singleton: TraceController.instance
 *
 * Example usage:
 * ```ts
 * // In wrapper function:
 * if (!TraceController.instance.shouldEmitSpans()) {
 *   return original(tMs, ctx); // Fast path, zero overhead
 * }
 * ```
 */
export class TraceController {
  private static _instance: TraceController | undefined;

  static get instance(): TraceController {
    if (!this._instance) {
      this._instance = new TraceController();
    }
    return this._instance;
  }

  private mode: TraceMode;

  /** Ring buffer for value samples (used in 'full' mode) */
  readonly valueRing: ValueRing;

  /** Ring buffer for span records (used in 'timing' and 'full' modes) */
  readonly spanRing: SpanRing;

  /** Mapping from probe ID to most recent value ring index */
  private probeValueIndex: Map<string, number> = new Map();

  /** Last time we emitted UI update events (for throttling) */
  private lastUIEmitMs = 0;

  /** Throttle UI updates to ~10Hz (100ms interval) */
  private static readonly UI_EMIT_INTERVAL_MS = 100;

  private constructor() {
    // Restore mode from localStorage (default: 'off')
    this.mode = this.loadModeFromStorage();

    // Initialize ring buffers (always allocated, but only used when mode !== 'off')
    this.valueRing = new ValueRing(DEFAULT_VALUE_CAPACITY);
    this.spanRing = new SpanRing(DEFAULT_SPAN_CAPACITY);

    console.log(`[TraceController] initialized with mode: ${this.mode}`);
  }

  /**
   * Get current trace mode.
   */
  getMode(): TraceMode {
    return this.mode;
  }

  /**
   * Set trace mode and persist to localStorage.
   */
  setMode(mode: TraceMode): void {
    this.mode = mode;
    this.saveModeToStorage(mode);
    console.log(`[TraceController] mode set to: ${mode}`);
  }

  /**
   * Check if instrumentation should emit spans.
   * Returns false in 'off' mode (zero overhead path).
   */
  shouldEmitSpans(): boolean {
    return this.mode !== 'off';
  }

  /**
   * Check if instrumentation should capture value samples.
   * Returns true only in 'full' mode.
   */
  shouldCaptureValues(): boolean {
    return this.mode === 'full';
  }

  // ===========================================================================
  // Ring Buffer Operations
  // ===========================================================================

  /**
   * Write a value record to the value ring buffer.
   * Only writes if mode is 'full'.
   *
   * @param value - Value record to write
   * @param probeId - Optional probe ID to associate with this value
   * @returns Index where value was written, or -1 if skipped
   */
  writeValue(value: ValueRecord32, probeId?: string): number {
    if (this.mode !== 'full') {
      return -1;
    }
    const idx = this.valueRing.writeValue(value);

    // Update probe index mapping if probe ID provided
    if (probeId !== undefined) {
      this.probeValueIndex.set(probeId, idx);
    }

    return idx;
  }

  /**
   * Get the most recent value for a specific probe.
   *
   * @param probeId - Probe identifier (e.g., "blockId:signal")
   * @returns ValueRecord32 if available, undefined otherwise
   */
  getProbeValue(probeId: string): ValueRecord32 | undefined {
    const idx = this.probeValueIndex.get(probeId);
    if (idx === undefined) {
      return undefined;
    }
    return this.valueRing.getValue(idx);
  }

  /**
   * Get all active probe IDs.
   *
   * @returns Array of probe IDs that have recorded values
   */
  getActiveProbeIds(): string[] {
    return Array.from(this.probeValueIndex.keys());
  }

  /**
   * Write a span record to the span ring buffer.
   * Only writes if mode is 'timing' or 'full'.
   *
   * @param span - Span data to write
   * @returns Index where span was written, or -1 if skipped
   */
  writeSpan(span: SpanData): number {
    if (this.mode === 'off') {
      return -1;
    }
    return this.spanRing.writeSpan(span);
  }

  /**
   * Check if it's time to emit UI update events (throttled to ~10Hz).
   * Returns true and updates last emit time if interval has passed.
   *
   * @param nowMs - Current time in milliseconds
   * @returns True if UI should be updated
   */
  shouldEmitUIUpdate(nowMs: number): boolean {
    if (nowMs - this.lastUIEmitMs >= TraceController.UI_EMIT_INTERVAL_MS) {
      this.lastUIEmitMs = nowMs;
      return true;
    }
    return false;
  }

  /**
   * Clear all ring buffers and probe mappings.
   * Called when switching modes or resetting debug state.
   */
  clearBuffers(): void {
    this.valueRing.clear();
    this.spanRing.clear();
    this.probeValueIndex.clear();
  }

  // ===========================================================================
  // Persistence (localStorage)
  // ===========================================================================

  private loadModeFromStorage(): TraceMode {
    if (window == null) {
      return 'off'; // Default for SSR/non-browser
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'off' || stored === 'timing' || stored === 'full') {
        return stored;
      }
    } catch (err) {
      console.warn('[TraceController] Failed to load mode from localStorage:', err);
    }

    return 'off'; // Default
  }

  private saveModeToStorage(mode: TraceMode): void {
    if (window == null) {
      return; // No-op for SSR/non-browser
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (err) {
      console.warn('[TraceController] Failed to save mode to localStorage:', err);
    }
  }

  // ===========================================================================
  // Testing Utilities
  // ===========================================================================

  /**
   * Reset instance (for testing only).
   * @internal
   */
  static _resetForTesting(): void {
    this._instance = undefined;
  }
}
