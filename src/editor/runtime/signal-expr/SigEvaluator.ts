/**
 * Signal Expression Evaluator
 *
 * Core runtime for evaluating SignalExpr IR DAGs.
 * Implements cache-first evaluation with per-frame memoization.
 *
 * Algorithm:
 * 1. Check cache: if stamp[sigId] === frameId, return cached value
 * 2. Get node from IR table
 * 3. Evaluate based on node kind (const, timeAbsMs, map, zip, select, inputSlot, busCombine, etc.)
 * 4. Write result to cache with current frameId stamp
 * 5. Return result
 *
 * Performance characteristics:
 * - Cache hit: O(1) array lookup
 * - Cache miss: O(1) + recursive evaluation of dependencies
 * - Shared subexpressions evaluated once per frame (diamond dependencies)
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P0 "Implement Core Evaluator"
 * - .agent_planning/signalexpr-runtime/HANDOFF.md §1 "Core Evaluation Algorithm"
 * - .agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md §P0 "Implement Select and InputSlot"
 * - .agent_planning/signalexpr-runtime/SPRINT-03-busCombine.md §P0 "Implement BusCombine Evaluation"
 * - src/editor/compiler/ir/signalExpr.ts (SignalExprIR types)
 */

import type { SignalExprIR, SigCombineMode } from "../../compiler/ir/signalExpr";
import type { SigExprId } from "../../compiler/ir/types";
import type { SigEnv } from "./SigEnv";
import { getConstNumber } from "./SigEnv";
import { applyPureFn, applyBinaryFn } from "./OpCodeRegistry";

/**
 * Evaluate a signal expression node.
 *
 * Cache-first algorithm:
 * - If cached for current frame, return cached value (O(1))
 * - Otherwise, evaluate node based on kind and cache result
 *
 * Recursive evaluation:
 * - Map, zip, select, and busCombine nodes recursively evaluate their inputs
 * - Shared subexpressions are cached (diamond dependencies evaluated once)
 *
 * @param sigId - Signal expression ID (index into nodes array)
 * @param env - Evaluation environment (time, const pool, cache, slot values, debug)
 * @param nodes - IR node array
 * @returns Evaluated signal value
 * @throws Error if node kind is unknown or unsupported
 *
 * @example
 * ```typescript
 * import { createSigEnv, createConstPool } from "./SigEnv";
 * import { createSigFrameCache } from "./SigFrameCache";
 * import { OpCode } from "../../compiler/ir/opcodes";
 *
 * const cache = createSigFrameCache(10);
 * const constPool = createConstPool([42]);
 * const env = createSigEnv({ tAbsMs: 1000, constPool, cache });
 *
 * const nodes: SignalExprIR[] = [
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 0 }
 * ];
 *
 * console.log(evalSig(0, env, nodes)); // 42
 * ```
 */
export function evalSig(
  sigId: SigExprId,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // 1. Check cache
  if (env.cache.stamp[sigId] === env.cache.frameId) {
    return env.cache.value[sigId];
  }

  // 2. Get node
  const node = nodes[sigId];
  if (node === undefined) {
    throw new Error(`Invalid sigId: ${sigId} (nodes length: ${nodes.length})`);
  }

  // 3. Evaluate based on kind
  let result: number;

  switch (node.kind) {
    case "const":
      result = getConstNumber(env.constPool, node.constId);
      break;

    case "timeAbsMs":
      result = env.tAbsMs;
      break;

    case "map":
      result = evalMap(node, env, nodes);
      break;

    case "zip":
      result = evalZip(node, env, nodes);
      break;

    case "select":
      result = evalSelect(node, env, nodes);
      break;

    case "inputSlot":
      result = evalInputSlot(node, env);
      break;

    case "busCombine":
      result = evalBusCombine(node, env, nodes);
      break;

    // Future sprints:
    case "timeModelMs":
    case "phase01":
    case "wrapEvent":
    case "transform":
    case "stateful":
      throw new Error(
        `Signal node kind '${node.kind}' not yet implemented (future sprint)`
      );

    default: {
      // Use type assertion to extract kind for error message
      const unknownNode = node as { kind: string };
      throw new Error(`Unknown signal node kind: ${unknownNode.kind}`);
    }
  }

  // 4. Write cache
  env.cache.value[sigId] = result;
  env.cache.stamp[sigId] = env.cache.frameId;

  // 5. Return result
  return result;
}

/**
 * Evaluate a map node: apply unary function to single input.
 *
 * Algorithm:
 * 1. Recursively evaluate src signal
 * 2. Apply pure function to result
 *
 * @param node - Map node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Result of fn(src)
 *
 * @example
 * ```typescript
 * // sin(1000) where timeAbsMs = 1000
 * const nodes: SignalExprIR[] = [
 *   { kind: "timeAbsMs", type: { world: "signal", domain: "timeMs" } }, // id: 0
 *   { kind: "map", type: { world: "signal", domain: "number" }, src: 0, fn: { kind: "opcode", opcode: OpCode.Sin } } // id: 1
 * ];
 * // evalSig(1, env, nodes) → sin(1000)
 * ```
 */
function evalMap(
  node: Extract<SignalExprIR, { kind: "map" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const src = evalSig(node.src, env, nodes);
  return applyPureFn(node.fn, src);
}

/**
 * Evaluate a zip node: apply binary function to two inputs.
 *
 * Algorithm:
 * 1. Recursively evaluate both input signals (a and b)
 * 2. Apply pure binary function to results
 *
 * Evaluation order: depth-first, left-to-right (a before b).
 *
 * @param node - Zip node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Result of fn(a, b)
 *
 * @example
 * ```typescript
 * // 10 + 20
 * const nodes: SignalExprIR[] = [
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 0 }, // 10
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 1 }, // 20
 *   { kind: "zip", type: { world: "signal", domain: "number" }, a: 0, b: 1, fn: { kind: "opcode", opcode: OpCode.Add } }
 * ];
 * // evalSig(2, env, nodes) → 30
 * ```
 */
function evalZip(
  node: Extract<SignalExprIR, { kind: "zip" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const a = evalSig(node.a, env, nodes);
  const b = evalSig(node.b, env, nodes);
  return applyBinaryFn(node.fn, a, b);
}

/**
 * Evaluate a select node: conditional branching with short-circuit semantics.
 *
 * Algorithm:
 * 1. Evaluate condition signal
 * 2. If cond > 0.5, evaluate and return 't' branch
 * 3. Otherwise, evaluate and return 'f' branch
 *
 * CRITICAL: Short-circuit semantics - only the taken branch is evaluated.
 * This is essential for:
 * - Performance (avoid evaluating expensive untaken branches)
 * - Safety (e.g., select(x > 0, 1/x, 0) avoids div-by-zero)
 *
 * Boolean threshold: cond > 0.5 = true, cond <= 0.5 = false
 *
 * @param node - Select node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Result from taken branch (t or f)
 *
 * @example
 * ```typescript
 * // select(1.0, 100, 200) → 100 (true branch)
 * const nodes: SignalExprIR[] = [
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 0 }, // 0: cond = 1.0
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 1 }, // 1: t = 100
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 2 }, // 2: f = 200
 *   { kind: "select", type: { world: "signal", domain: "number" }, cond: 0, t: 1, f: 2 }
 * ];
 * // evalSig(3, env, nodes) → 100
 * ```
 */
function evalSelect(
  node: Extract<SignalExprIR, { kind: "select" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const cond = evalSig(node.cond, env, nodes);

  // Short-circuit: only evaluate taken branch
  if (cond > 0.5) {
    return evalSig(node.t, env, nodes);
  } else {
    return evalSig(node.f, env, nodes);
  }
}

/**
 * Evaluate an inputSlot node: read external input value.
 *
 * Algorithm:
 * 1. Read value from slot using env.slotValues
 * 2. Return value (or NaN if slot is empty)
 *
 * InputSlot nodes reference external values from:
 * - Wired connections (another node's output)
 * - Bus subscriptions (aggregated bus values)
 *
 * Missing slots return NaN, which:
 * - Allows detection of unconnected inputs
 * - Propagates through downstream calculations
 * - Is distinguishable from 0 or other valid values
 *
 * @param node - InputSlot node from IR
 * @param env - Evaluation environment
 * @returns Slot value, or NaN if slot is empty
 *
 * @example
 * ```typescript
 * // Read slot 0 (which contains 42)
 * const slots = createArraySlotReader(new Map([[0, 42]]));
 * const env = createSigEnv({ tAbsMs: 0, constPool: { numbers: [] }, cache, slotValues: slots });
 * const nodes: SignalExprIR[] = [
 *   { kind: "inputSlot", type: { world: "signal", domain: "number" }, slot: 0 }
 * ];
 * // evalSig(0, env, nodes) → 42
 * ```
 */
function evalInputSlot(
  node: Extract<SignalExprIR, { kind: "inputSlot" }>,
  env: SigEnv
): number {
  return env.slotValues.readNumber(node.slot);
}

/**
 * Evaluate a busCombine node: combine multiple signal terms into one output.
 *
 * Algorithm:
 * 1. If no terms, return default value (combine.default ?? 0)
 * 2. If single term, return that term directly (no combine needed)
 * 3. Evaluate all terms (in order - pre-sorted by compiler)
 * 4. Apply combine function to produce final result
 * 5. Optionally trace to debug sink
 *
 * CRITICAL:
 * - All terms must be evaluated (no short-circuit) to ensure cache correctness
 * - Terms array is pre-sorted by compiler - runtime never re-sorts
 * - Debug tracing has zero overhead when disabled (check before creating trace info)
 *
 * @param node - BusCombine node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Combined result
 *
 * @example
 * ```typescript
 * // Sum of three signals: 10 + 20 + 30 = 60
 * const nodes: SignalExprIR[] = [
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 0 }, // 10
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 1 }, // 20
 *   { kind: "const", type: { world: "signal", domain: "number" }, constId: 2 }, // 30
 *   {
 *     kind: "busCombine",
 *     type: { world: "signal", domain: "number" },
 *     busIndex: 0,
 *     terms: [0, 1, 2],
 *     combine: { mode: "sum" }
 *   }
 * ];
 * // evalSig(3, env, nodes) → 60
 * ```
 */
function evalBusCombine(
  node: Extract<SignalExprIR, { kind: "busCombine" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const { terms, combine, busIndex } = node;

  // Empty bus: return default value
  if (terms.length === 0) {
    return combine.default ?? 0;
  }

  // Single term: no combine needed
  if (terms.length === 1) {
    return evalSig(terms[0], env, nodes);
  }

  // Evaluate all terms (order is deterministic from compiler)
  const values = terms.map((t) => evalSig(t, env, nodes));

  // Apply combine function
  const result = applyCombine(combine.mode, values);

  // Optional debug tracing (zero overhead when disabled)
  if (env.debug?.traceBusCombine) {
    env.debug.traceBusCombine({
      busIndex,
      termIds: terms,
      termValues: values,
      mode: combine.mode,
      result,
    });
  }

  return result;
}

/**
 * Apply combine function to array of values.
 *
 * Implements all combine modes:
 * - sum: Σ values
 * - average: (Σ values) / count
 * - min: minimum value
 * - max: maximum value
 * - first: values[0]
 * - last: values[values.length - 1]
 *
 * PRECONDITION: values.length > 0 (caller must handle empty array case)
 *
 * @param mode - Combine mode
 * @param values - Array of values to combine (length > 0)
 * @returns Combined result
 * @throws Error if mode is unknown
 *
 * @example
 * ```typescript
 * applyCombine("sum", [10, 20, 30]); // 60
 * applyCombine("average", [10, 20, 30]); // 20
 * applyCombine("min", [50, 10, 30]); // 10
 * applyCombine("max", [50, 10, 30]); // 50
 * applyCombine("first", [100, 200, 300]); // 100
 * applyCombine("last", [100, 200, 300]); // 300
 * ```
 */
function applyCombine(
  mode: SigCombineMode,
  values: number[]
): number {
  switch (mode) {
    case "sum":
      return values.reduce((acc, v) => acc + v, 0);

    case "average":
      return values.reduce((acc, v) => acc + v, 0) / values.length;

    case "min":
      return Math.min(...values);

    case "max":
      return Math.max(...values);

    case "first":
      return values[0];

    case "last":
      return values[values.length - 1];

    default: {
      // Exhaustiveness check
      const _exhaustiveCheck: never = mode;
      void _exhaustiveCheck;
      throw new Error(`Unknown combine mode: ${mode}`);
    }
  }
}
