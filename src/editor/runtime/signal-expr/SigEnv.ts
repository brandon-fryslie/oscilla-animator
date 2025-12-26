/**
 * Signal Evaluation Environment
 *
 * Provides context for signal expression evaluation:
 * - Time values (tAbsMs)
 * - Const pool access
 * - Per-frame cache
 * - Slot values (external inputs)
 * - Debug sink (optional tracing)
 * - Transform table (Sprint 4)
 * - Easing curves (Sprint 4)
 * - State buffer (Sprint 5)
 * - Runtime context (Sprint 5)
 * - Closure registry (Sprint 6 - TEMPORARY for migration)
 *
 * The environment is created once per frame and passed to all signal evaluations.
 *
 * Future sprints will add:
 * - tModelMs, phase01 (time model values)
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P0 "Implement SigEnv"
 * - .agent_planning/signalexpr-runtime/HANDOFF.md §1 "The Evaluation Environment"
 * - .agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md §P1 "Extend SigEnv with SlotValues"
 * - .agent_planning/signalexpr-runtime/SPRINT-03-busCombine.md §P1 "Extend SigEnv with Debug Sink"
 * - .agent_planning/signalexpr-runtime/SPRINT-04-transform.md §P0 "Extend SigEnv with Transform Infrastructure"
 * - .agent_planning/signalexpr-runtime/SPRINT-05-stateful.md §P0 "Extend SigEnv with State and RuntimeCtx"
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P0 "Extend SigEnv with Closure Registry"
 */

import type { SigFrameCache } from "./SigFrameCache";
import type { SlotValueReader } from "./SlotValueReader";
import type { DebugSink } from "./DebugSink";
import type { TransformTable } from "../../compiler/ir/transforms";
import type { EasingCurveTable } from "./EasingCurves";
import type { StateBuffer } from "./StateBuffer";
import type { RuntimeCtx } from "./RuntimeCtx";
import type { ClosureRegistry } from "./ClosureRegistry";
import { createEmptySlotReader } from "./SlotValueReader";
import { createBuiltinCurves } from "./EasingCurves";
import { createEmptyStateBuffer } from "./StateBuffer";
import { createDefaultRuntimeCtx } from "./RuntimeCtx";
import { createClosureRegistry } from "./ClosureRegistry";

/**
 * Const pool - storage for compile-time constant values.
 *
 * Currently supports only numbers.
 * Future: vec2, color, strings, etc.
 */
export interface ConstPool {
  /** Number constants (indexed by constId) */
  numbers: number[];

  // Future expansion:
  // vec2s: Vec2[];
  // colors: Color[];
  // strings: string[];
}

/**
 * Signal evaluation environment.
 *
 * Immutable during frame evaluation - readonly fields where applicable.
 */
export interface SigEnv {
  /** Absolute time in milliseconds (monotonic player time) */
  readonly tAbsMs: number;

  /** Const pool for compile-time constants */
  readonly constPool: ConstPool;

  /** Per-frame cache for memoization */
  readonly cache: SigFrameCache;

  /** Slot value reader for external inputs (wired connections, bus subscriptions) */
  readonly slotValues: SlotValueReader;

  /**
   * Transform table - pre-compiled transform chains.
   *
   * Transform nodes reference chains by index for O(1) lookup.
   * Populated by compiler, immutable at runtime.
   */
  readonly transformTable: TransformTable;

  /**
   * Optional easing curve table.
   *
   * If not provided, defaults to built-in curves (linear, easeIn/Out/InOut quad/cubic, smoothstep).
   * Custom curves can be provided for specialized easing.
   */
  readonly easingCurves?: EasingCurveTable;

  /**
   * State buffer - persistent state for stateful operations.
   *
   * Pre-allocated typed arrays (f64, f32, i32) for:
   * - integrate (accumulator)
   * - delay (ring buffers)
   * - sampleHold (held value, trigger state)
   * - slew (current smoothed value)
   *
   * State persists across frames - reset on demand via resetStateBuffer().
   */
  readonly state: StateBuffer;

  /**
   * Runtime context - frame timing information.
   *
   * Provides deltaSec, deltaMs, frameIndex for:
   * - Time-based operations (integrate, delayMs)
   * - Frame-based operations (delayFrames)
   * - Smooth interpolation (slew)
   *
   * Created fresh each frame with current timing.
   */
  readonly runtimeCtx: RuntimeCtx;

  /**
   * TEMPORARY: Closure registry for migration period.
   *
   * Registry of legacy closures by ID for closure bridge nodes.
   * Populated by compiler before evaluation.
   * Persists across frames (closures don't change).
   *
   * Will be REMOVED once all blocks are migrated to IR (Sprint 7+).
   *
   * References:
   * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md
   */
  readonly closureRegistry: ClosureRegistry;

  /**
   * Optional debug sink for tracing signal evaluation.
   *
   * When defined, allows instrumentation of signal operations for:
   * - Debug visualization
   * - Time-travel debugging
   * - Performance profiling
   * - Value tracing
   *
   * CRITICAL: Always check `if (env.debug?.traceFoo)` before creating trace objects
   * to ensure zero overhead when disabled.
   */
  readonly debug?: DebugSink;

  // Future expansion:
  // readonly tModelMs: number;
  // readonly phase01: number;
}

/**
 * Parameters for creating a signal evaluation environment.
 */
export interface CreateSigEnvParams {
  tAbsMs: number;
  constPool: ConstPool;
  cache: SigFrameCache;
  slotValues?: SlotValueReader; // Optional - defaults to empty reader
  transformTable?: TransformTable; // Optional - defaults to empty table
  easingCurves?: EasingCurveTable; // Optional - defaults to built-in curves
  state?: StateBuffer; // Optional - defaults to empty buffer
  runtimeCtx?: RuntimeCtx; // Optional - defaults to 60fps, frame 0
  closureRegistry?: ClosureRegistry; // Optional - defaults to empty registry
  debug?: DebugSink; // Optional - defaults to undefined (no tracing)
}

/**
 * Create a signal evaluation environment.
 *
 * @param params - Environment parameters
 * @returns Initialized environment
 *
 * @example
 * ```typescript
 * import { createSigFrameCache } from "./SigFrameCache";
 * import { createArraySlotReader } from "./SlotValueReader";
 * import { createStateBuffer } from "./StateBuffer";
 * import { createRuntimeCtx } from "./RuntimeCtx";
 * import { createClosureRegistry } from "./ClosureRegistry";
 *
 * const cache = createSigFrameCache(1024);
 * const constPool = { numbers: [1, 2, 3.14] };
 * const slots = createArraySlotReader(new Map([[0, 42]]));
 * const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 2 });
 * const runtimeCtx = createRuntimeCtx(0.016, 0);
 * const closureRegistry = createClosureRegistry();
 *
 * const env = createSigEnv({
 *   tAbsMs: 1000,
 *   constPool,
 *   cache,
 *   slotValues: slots,
 *   state,
 *   runtimeCtx,
 *   closureRegistry
 * });
 * console.log(env.tAbsMs); // 1000
 * ```
 */
export function createSigEnv(params: CreateSigEnvParams): SigEnv {
  return {
    tAbsMs: params.tAbsMs,
    constPool: params.constPool,
    cache: params.cache,
    slotValues: params.slotValues ?? createEmptySlotReader(),
    transformTable: params.transformTable ?? { chains: [] },
    easingCurves: params.easingCurves ?? createBuiltinCurves(),
    state: params.state ?? createEmptyStateBuffer(),
    runtimeCtx: params.runtimeCtx ?? createDefaultRuntimeCtx(),
    closureRegistry: params.closureRegistry ?? createClosureRegistry(),
    debug: params.debug,
  };
}

/**
 * Read a number constant from the const pool.
 *
 * @param pool - Const pool
 * @param constId - Index into const pool
 * @returns Constant value
 * @throws Error if constId is out of bounds
 *
 * @example
 * ```typescript
 * const pool = { numbers: [1, 2, 3.14] };
 * console.log(getConstNumber(pool, 2)); // 3.14
 * // getConstNumber(pool, 99); // throws Error
 * ```
 */
export function getConstNumber(pool: ConstPool, constId: number): number {
  if (constId < 0 || constId >= pool.numbers.length) {
    throw new Error(
      `Invalid constId: ${constId} (pool has ${pool.numbers.length} numbers)`
    );
  }
  return pool.numbers[constId];
}

/**
 * Create a const pool from a list of numbers.
 *
 * Convenience factory for tests and simple cases.
 *
 * @param numbers - Array of number constants
 * @returns Const pool
 *
 * @example
 * ```typescript
 * const pool = createConstPool([1, 2, 3.14]);
 * console.log(pool.numbers.length); // 3
 * ```
 */
export function createConstPool(numbers: number[]): ConstPool {
  return { numbers };
}
