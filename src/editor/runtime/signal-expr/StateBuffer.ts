/**
 * State Buffer - Typed array storage for stateful signal operations.
 *
 * Philosophy:
 * - State is explicit, not hidden in closures
 * - Pre-allocated typed arrays for performance
 * - Persistence across frames (reset on demand)
 *
 * Layout:
 * - StateLayout describes allocation needs (determined at compile time)
 * - StateBuffer holds actual typed arrays
 * - State offsets are dense numeric indices (not stateId strings)
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-05-stateful.md §P0 "Define StateBuffer Types"
 * - design-docs/12-Compiler-Final/13-SignalExpr-Evaluator.md §5 "Stateful Operations"
 */

/**
 * State buffer - typed arrays for persistent state storage.
 *
 * Pre-allocated based on StateLayout, persists across frames.
 * Different operations use different array types:
 * - f64: Most signals (high precision needed)
 * - f32: Low-precision signals (when precision not critical)
 * - i32: Counters, indices, ring buffer pointers
 */
export interface StateBuffer {
  /** 64-bit floats (most signals) */
  f64: Float64Array;

  /** 32-bit floats (when precision not critical) */
  f32: Float32Array;

  /** 32-bit integers (counters, indices) */
  i32: Int32Array;
}

/**
 * State layout - describes allocation needs for state buffer.
 *
 * Computed at compile time by analyzing stateful operations.
 * Each stateful op declares how much state it needs:
 * - integrate: 1 f64 (accumulator)
 * - delayMs: 1 i32 (write index) + N f64 (ring buffer)
 * - delayFrames: 1 i32 (write index) + N f64 (ring buffer)
 * - sampleHold: 2 f64 (held value, last trigger)
 * - slew: 1 f64 (current smoothed value)
 */
export interface StateLayout {
  /** Number of f64 slots needed */
  f64Count: number;

  /** Number of f32 slots needed */
  f32Count: number;

  /** Number of i32 slots needed */
  i32Count: number;
}

/**
 * Create a state buffer from a layout specification.
 *
 * Allocates typed arrays with the specified sizes.
 * All values are initialized to zero.
 *
 * @param layout - State layout specification
 * @returns Initialized state buffer
 *
 * @example
 * ```typescript
 * // Allocate state for: 1 integrate (1 f64) + 1 sampleHold (2 f64) = 3 f64 total
 * const layout: StateLayout = { f64Count: 3, f32Count: 0, i32Count: 0 };
 * const state = createStateBuffer(layout);
 * console.log(state.f64.length); // 3
 * ```
 */
export function createStateBuffer(layout: StateLayout): StateBuffer {
  return {
    f64: new Float64Array(layout.f64Count),
    f32: new Float32Array(layout.f32Count),
    i32: new Int32Array(layout.i32Count),
  };
}

/**
 * Reset state buffer to initial state (all zeros).
 *
 * Used when:
 * - Restarting animation from beginning
 * - Resetting patch after code change
 * - Clearing state on demand
 *
 * CRITICAL: Does NOT resize arrays - only zeros existing values.
 * If layout changes, create a new buffer with createStateBuffer().
 *
 * @param buffer - State buffer to reset
 *
 * @example
 * ```typescript
 * const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 5 });
 * state.f64[0] = 42;
 * state.i32[0] = 100;
 *
 * resetStateBuffer(state);
 * console.log(state.f64[0]); // 0
 * console.log(state.i32[0]); // 0
 * ```
 */
export function resetStateBuffer(buffer: StateBuffer): void {
  buffer.f64.fill(0);
  buffer.f32.fill(0);
  buffer.i32.fill(0);
}

/**
 * Create an empty state buffer (for tests with no stateful ops).
 *
 * @returns Empty state buffer (all arrays have length 0)
 *
 * @example
 * ```typescript
 * const state = createEmptyStateBuffer();
 * console.log(state.f64.length); // 0
 * ```
 */
export function createEmptyStateBuffer(): StateBuffer {
  return createStateBuffer({ f64Count: 0, f32Count: 0, i32Count: 0 });
}
