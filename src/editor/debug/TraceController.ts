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
 */

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

  private constructor() {
    // Restore mode from localStorage (default: 'off')
    this.mode = this.loadModeFromStorage();
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
  // Persistence (localStorage)
  // ===========================================================================

  private loadModeFromStorage(): TraceMode {
    if (typeof window === 'undefined' || !window.localStorage) {
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
    if (typeof window === 'undefined' || !window.localStorage) {
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
