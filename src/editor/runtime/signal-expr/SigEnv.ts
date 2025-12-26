/**
 * Signal Evaluation Environment
 *
 * Provides context for signal expression evaluation:
 * - Time values (tAbsMs)
 * - Const pool access
 * - Per-frame cache
 * - Slot values (external inputs)
 *
 * The environment is created once per frame and passed to all signal evaluations.
 *
 * Future sprints will add:
 * - tModelMs, phase01 (time model values)
 * - state (stateful operations)
 * - runtimeCtx (player, debug, etc.)
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P0 "Implement SigEnv"
 * - .agent_planning/signalexpr-runtime/HANDOFF.md §1 "The Evaluation Environment"
 * - .agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md §P1 "Extend SigEnv with SlotValues"
 */

import type { SigFrameCache } from "./SigFrameCache";
import type { SlotValueReader } from "./SlotValueReader";
import { createEmptySlotReader } from "./SlotValueReader";

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

  // Future expansion:
  // readonly tModelMs: number;
  // readonly phase01: number;
  // readonly state: StateBuffer;
  // readonly runtimeCtx: RuntimeContext;
}

/**
 * Parameters for creating a signal evaluation environment.
 */
export interface CreateSigEnvParams {
  tAbsMs: number;
  constPool: ConstPool;
  cache: SigFrameCache;
  slotValues?: SlotValueReader; // Optional - defaults to empty reader
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
 *
 * const cache = createSigFrameCache(1024);
 * const constPool = { numbers: [1, 2, 3.14] };
 * const slots = createArraySlotReader(new Map([[0, 42]]));
 * const env = createSigEnv({ tAbsMs: 1000, constPool, cache, slotValues: slots });
 * console.log(env.tAbsMs); // 1000
 * ```
 */
export function createSigEnv(params: CreateSigEnvParams): SigEnv {
  return {
    tAbsMs: params.tAbsMs,
    constPool: params.constPool,
    cache: params.cache,
    slotValues: params.slotValues ?? createEmptySlotReader(),
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
