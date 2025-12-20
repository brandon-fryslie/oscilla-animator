/**
 * @file TimeCtx - Single source of time truth
 * @description Immutable time context propagated through all evaluators.
 *
 * Architecture principle:
 * The system is a pure function of (TimeCtx, Patch Definition, Explicit State).
 * Nothing else is allowed to influence evaluation.
 */

/**
 * Evaluation mode affects state block behavior.
 */
export type TimeMode = 'scrub' | 'performance';

/**
 * TimeCtx is the single source of time for all temporal behavior.
 *
 * Immutable structure passed through evaluation pipeline.
 * All temporal behavior emerges from reading this structure.
 *
 * No hidden clocks. No timers. No engine loops.
 */
export interface TimeCtx {
  /** Absolute time in seconds (always monotonic increasing) */
  readonly t: number;

  /** Delta time since last frame (seconds) */
  readonly dt: number;

  /** Monotonic frame counter (never decreases, resets on recompile) */
  readonly frame: number;

  /** Evaluation mode (affects state block reconstruction) */
  readonly mode: TimeMode;
}

/**
 * TimeCtxManager - single time source for the runtime.
 *
 * Responsibilities:
 * - Produce TimeCtx for each frame
 * - Manage frame counter
 * - Track mode transitions
 * - Handle time resets
 *
 * Does NOT:
 * - Store application state
 * - Know about blocks or signals
 * - Manage playback control
 */
export class TimeCtxManager {
  private currentTime: number = 0;
  private frameCounter: number = 0;
  private lastFrameTime: number | null = null;
  private currentMode: TimeMode = 'performance';

  /**
   * Create a TimeCtx for the current frame.
   *
   * @param t - Absolute time in seconds
   * @param mode - Evaluation mode
   * @returns Immutable TimeCtx for this frame
   */
  createContext(t: number, mode: TimeMode = this.currentMode): TimeCtx {
    // Calculate dt
    const dt = this.lastFrameTime !== null ? t - this.lastFrameTime : 0;

    // Detect mode change
    const modeChanged = mode !== this.currentMode;

    // Reset frame counter on mode change
    if (modeChanged) {
      this.frameCounter = 0;
      this.currentMode = mode;
    }

    // Create context with current frame
    const ctx: TimeCtx = {
      t,
      dt,
      frame: this.frameCounter,
      mode,
    };

    // Increment frame counter for next call
    this.frameCounter++;

    // Update state
    this.currentTime = t;
    this.lastFrameTime = t;

    return ctx;
  }

  /**
   * Reset time state (e.g., on playback restart or patch recompile).
   */
  reset(): void {
    this.currentTime = 0;
    this.frameCounter = 0;
    this.lastFrameTime = null;
  }

  /**
   * Get current frame counter.
   */
  getCurrentFrame(): number {
    return this.frameCounter;
  }

  /**
   * Get current time.
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Get current mode.
   */
  getCurrentMode(): TimeMode {
    return this.currentMode;
  }
}

/**
 * Factory for creating TimeCtx in different scenarios.
 */
export class TimeCtxFactory {
  /**
   * Create a performance-mode context.
   */
  static forPerformance(t: number, dt: number, frame: number): TimeCtx {
    return { t, dt, frame, mode: 'performance' };
  }

  /**
   * Create a scrub-mode context (dt = 0 for scrubbing).
   */
  static forScrub(t: number, frame: number): TimeCtx {
    return { t, dt: 0, frame, mode: 'scrub' };
  }

  /**
   * Create an initial context at t=0.
   */
  static initial(): TimeCtx {
    return { t: 0, dt: 0, frame: 0, mode: 'performance' };
  }
}
