/**
 * Runtime Context - Frame timing information for signal evaluation.
 *
 * Provides time deltas and frame counting for:
 * - Time-based stateful operations (integrate, delayMs)
 * - Frame-based operations (delayFrames)
 * - Smooth interpolation (slew)
 *
 * Philosophy:
 * - Immutable per frame (readonly fields)
 * - Created fresh each frame with current timing
 * - No global state - passed explicitly in environment
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-05-stateful.md §P0 "Define RuntimeCtx Interface"
 * - design-docs/12-Compiler-Final/13-SignalExpr-Evaluator.md §5 "Stateful Operations"
 */

/**
 * Runtime context - frame timing information.
 *
 * Created fresh for each frame with current timing data.
 * Immutable during frame evaluation.
 */
export interface RuntimeCtx {
  /** Time since last frame (seconds) */
  readonly deltaSec: number;

  /** Time since last frame (milliseconds) */
  readonly deltaMs: number;

  /** Monotonic frame counter (increments each frame) */
  readonly frameIndex: number;
}

/**
 * Create a runtime context for a frame.
 *
 * @param deltaSec - Time since last frame in seconds (e.g., 0.016 for 60fps)
 * @param frameIndex - Monotonic frame counter
 * @returns Runtime context
 *
 * @example
 * ```typescript
 * // 60fps frame (16.67ms)
 * const ctx = createRuntimeCtx(1/60, 42);
 * console.log(ctx.deltaSec);   // 0.01666...
 * console.log(ctx.deltaMs);    // 16.666...
 * console.log(ctx.frameIndex); // 42
 * ```
 */
export function createRuntimeCtx(deltaSec: number, frameIndex: number): RuntimeCtx {
  return {
    deltaSec,
    deltaMs: deltaSec * 1000,
    frameIndex,
  };
}

/**
 * Create a default runtime context for tests.
 *
 * Uses 60fps timing (16.67ms) and frame index 0.
 *
 * @returns Default runtime context
 *
 * @example
 * ```typescript
 * const ctx = createDefaultRuntimeCtx();
 * console.log(ctx.deltaSec); // 0.016666...
 * ```
 */
export function createDefaultRuntimeCtx(): RuntimeCtx {
  return createRuntimeCtx(1 / 60, 0);
}
