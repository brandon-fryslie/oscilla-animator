/**
 * Signal Expression Evaluator
 *
 * Core runtime for evaluating SignalExpr IR DAGs.
 * Implements cache-first evaluation with per-frame memoization.
 *
 * Algorithm:
 * 1. Check cache: if stamp[sigId] === frameId, return cached value
 * 2. Get node from IR table
 * 3. Evaluate based on node kind (const, timeAbsMs, map, zip, etc.)
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
 * - src/editor/compiler/ir/signalExpr.ts (SignalExprIR types)
 */

import type { SignalExprIR } from "../../compiler/ir/signalExpr";
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
 * - Map and zip nodes recursively evaluate their inputs
 * - Shared subexpressions are cached (diamond dependencies evaluated once)
 *
 * @param sigId - Signal expression ID (index into nodes array)
 * @param env - Evaluation environment (time, const pool, cache)
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

    // Future sprints:
    case "timeModelMs":
    case "phase01":
    case "wrapEvent":
    case "inputSlot":
    case "select":
    case "transform":
    case "busCombine":
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
