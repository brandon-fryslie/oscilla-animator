/**
 * Signal Expression Evaluator
 *
 * Core runtime for evaluating SignalExpr IR DAGs.
 * Implements cache-first evaluation with per-frame memoization.
 *
 * Algorithm:
 * 1. Check cache: if stamp[sigId] === frameId, return cached value
 * 2. Get node from IR table
 * 3. Evaluate based on node kind (const, timeAbsMs, timeModelMs, phase01, wrapEvent, map, zip, select, inputSlot, busCombine, transform, stateful, closureBridge, closure)
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
 * - .agent_planning/signalexpr-runtime/SPRINT-04-transform.md §P0 "Implement Transform Node Evaluation"
 * - .agent_planning/signalexpr-runtime/SPRINT-05-stateful.md §P0-P1 "Implement Stateful Operations"
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P0 "Implement ClosureBridge Evaluation"
 * - .agent_planning/signalexpr-runtime/PLAN-2025-12-26-031245.md §Workstream A "Complete SigEvaluator"
 * - src/editor/compiler/ir/signalExpr.ts (SignalExprIR types)
 */

import type { SignalExprIR, SigCombineMode } from "../../compiler/ir/signalExpr";
import type { SigExprId } from "../../compiler/ir/types";
import type { TransformStepIR } from "../../compiler/ir/transforms";
import type { SigEnv } from "./SigEnv";
import type { TransformStepTrace } from "./DebugSink";
import { getConstNumber } from "./SigEnv";
import { applyPureFn, applyBinaryFn } from "./OpCodeRegistry";
import { applyEasing } from "./EasingCurves";
import { createLegacyContext } from "./LegacyClosure";

/**
 * Evaluate a signal expression node.
 *
 * Cache-first algorithm:
 * - If cached for current frame, return cached value (O(1))
 * - Otherwise, evaluate node based on kind and cache result
 *
 * Recursive evaluation:
 * - Map, zip, select, busCombine, transform, and stateful nodes recursively evaluate their inputs
 * - Shared subexpressions are cached (diamond dependencies evaluated once)
 *
 * @param sigId - Signal expression ID (index into nodes array)
 * @param env - Evaluation environment (time, const pool, cache, slot values, state, runtimeCtx, closureRegistry, debug)
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
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }
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

    case "timeModelMs":
      result = env.tModelMs ?? env.tAbsMs;
      break;

    case "phase01":
      result = env.phase01 ?? 0;
      break;

    case "wrapEvent":
      result = (env.wrapOccurred ?? false) ? 1.0 : 0.0;
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

    case "transform":
      result = evalTransform(node, env, nodes);
      break;

    case "stateful":
      result = evalStateful(node, env, nodes);
      break;

    case "closureBridge":
      result = evalClosureBridge(node, env, nodes);
      break;

    case "closure":
      // V2 adapter: invoke embedded V1 closure
      result = node.closureFn(env.tAbsMs, createLegacyContext(env));
      break;

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
 *   { kind: "map", type: { world: "signal", domain: "float" }, src: 0, fn: { kind: "opcode", opcode: OpCode.Sin } } // id: 1
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
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 10
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 1 }, // 20
 *   { kind: "zip", type: { world: "signal", domain: "float" }, a: 0, b: 1, fn: { kind: "opcode", opcode: OpCode.Add } }
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
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 0: cond = 1.0
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 1 }, // 1: t = 100
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 2 }, // 2: f = 200
 *   { kind: "select", type: { world: "signal", domain: "float" }, cond: 0, t: 1, f: 2 }
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
 *   { kind: "inputSlot", type: { world: "signal", domain: "float" }, slot: 0 }
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
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 10
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 1 }, // 20
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 2 }, // 30
 *   {
 *     kind: "busCombine",
 *     type: { world: "signal", domain: "float" },
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
  if (env.debug?.traceBusCombine !== null && env.debug?.traceBusCombine !== undefined) {
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
 * Evaluate a transform node: apply transform chain to source signal.
 *
 * Algorithm:
 * 1. Evaluate source signal
 * 2. Get transform chain from table
 * 3. Apply steps in order (pipeline)
 * 4. Return final transformed value
 * 5. Optionally trace to debug sink
 *
 * CRITICAL:
 * - Steps apply in pipeline order (each step's output is next step's input)
 * - Empty chain is valid (returns source unchanged)
 * - Debug tracing has zero overhead when disabled
 *
 * @param node - Transform node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Transformed value
 * @throws Error if chain index is out of bounds
 *
 * @example
 * ```typescript
 * // scaleBias: 5 * 2 + 10 = 20
 * const chain: TransformChainIR = {
 *   steps: [{ kind: "scaleBias", scale: 2, bias: 10 }],
 *   fromType: { world: "signal", domain: "float" },
 *   toType: { world: "signal", domain: "float" },
 *   cost: "cheap"
 * };
 * const nodes: SignalExprIR[] = [
 *   { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 5
 *   { kind: "transform", type: { world: "signal", domain: "float" }, src: 0, chain: 0 }
 * ];
 * const env = createSigEnv({
 *   tAbsMs: 0,
 *   constPool: { numbers: [5] },
 *   cache: createSigFrameCache(10),
 *   transformTable: { chains: [chain] }
 * });
 * // evalSig(1, env, nodes) → 20
 * ```
 */
function evalTransform(
  node: Extract<SignalExprIR, { kind: "transform" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // Evaluate source signal
  const srcValue = evalSig(node.src, env, nodes);

  // Get transform chain
  const chain = env.transformTable.chains[node.chain];
  if (chain === undefined) {
    throw new Error(
      `Invalid transform chain ID: ${node.chain} (table has ${env.transformTable.chains.length} chains)`
    );
  }

  // Apply steps in order (pipeline)
  let value = srcValue;
  const stepTraces: TransformStepTrace[] = [];

  for (const step of chain.steps) {
    const inputValue = value;
    value = applyTransformStep(step, value, env);

    // Collect trace if debugging
    if (env.debug?.traceTransform !== null && env.debug?.traceTransform !== undefined) {
      stepTraces.push({
        kind: step.kind,
        inputValue,
        outputValue: value,
      });
    }
  }

  // Optional debug tracing (zero overhead when disabled)
  if (env.debug?.traceTransform !== null && env.debug?.traceTransform !== undefined) {
    env.debug.traceTransform({
      srcValue,
      chainId: node.chain,
      steps: stepTraces,
      finalValue: value,
    });
  }

  return value;
}

/**
 * Evaluate a stateful node: apply stateful operation with persistent state.
 *
 * Algorithm:
 * 1. Dispatch to operation-specific handler based on op field
 * 2. Handler reads/writes state via env.state (persistent across frames)
 * 3. Handler uses env.runtimeCtx for timing information
 * 4. Return computed value
 *
 * CRITICAL:
 * - State persists across frames (not reset automatically)
 * - stateId is used to look up numeric offset in params (compiler-provided mapping)
 * - All stateful ops use deltaSec for frame-rate independence
 *
 * @param node - Stateful node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Result of stateful operation
 * @throws Error if operation is unknown
 */
function evalStateful(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // Get state offset from params (compiler maps stateId -> numeric offset)
  const stateOffset = node.params?.stateOffset ?? 0;

  switch (node.op) {
    case "integrate":
      return evalIntegrate(node, stateOffset, env, nodes);

    case "sampleHold":
      return evalSampleHold(node, stateOffset, env, nodes);

    case "slew":
      return evalSlew(node, stateOffset, env, nodes);

    case "delayMs":
      return evalDelayMs(node, stateOffset, env, nodes);

    case "delayFrames":
      return evalDelayFrames(node, stateOffset, env, nodes);

    case "edgeDetectWrap":
      return evalEdgeDetectWrap(node, stateOffset, env, nodes);

    case "pulseDivider":
      return evalPulseDivider(node, stateOffset, env, nodes);

    case "envelopeAD":
      return evalEnvelopeAD(node, stateOffset, env, nodes);

    default: {
      // Exhaustiveness check - extract op as string to avoid 'never' type in template
      const exhaustiveCheck: never = node.op;
      const opStr = String(exhaustiveCheck);
      throw new Error(`Unknown stateful op: ${opStr}`);
    }
  }
}

/**
 * TEMPORARY: Evaluate a closureBridge node - call legacy closure (Sprint 6).
 *
 * Algorithm:
 * 1. Get closure from registry by ID
 * 2. Throw error if closure not found
 * 3. Evaluate input slots (if any) - currently unused, reserved for future
 * 4. Create legacy context from environment
 * 5. Call closure with time and context
 * 6. Optionally trace to debug sink
 * 7. Return result (which is then cached by evalSig)
 *
 * CRITICAL:
 * - This is TEMPORARY infrastructure for migration period
 * - Will be REMOVED once all blocks are migrated to IR (Sprint 7+)
 * - Closure must be registered before evaluation
 * - Result is cached like any other node
 *
 * @param node - ClosureBridge node from IR
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Result from legacy closure
 * @throws Error if closure not found in registry
 *
 * @example
 * ```typescript
 * import { createClosureRegistry } from "./ClosureRegistry";
 *
 * const registry = createClosureRegistry();
 * registry.register('testClosure', (t, ctx) => t * 2);
 *
 * const nodes: SignalExprIR[] = [
 *   {
 *     kind: "closureBridge",
 *     type: { world: "signal", domain: "float" },
 *     closureId: "testClosure",
 *     inputSlots: []
 *   }
 * ];
 *
 * const env = createSigEnv({
 *   tAbsMs: 100,
 *   constPool: { numbers: [] },
 *   cache: createSigFrameCache(10),
 *   closureRegistry: registry
 * });
 *
 * // evalSig(0, env, nodes) → 200
 * ```
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P0 "Implement ClosureBridge Evaluation"
 * - design-docs/12-Compiler-Final/01.1-CompilerMigration-Roadmap.md
 */
function evalClosureBridge(
  node: Extract<SignalExprIR, { kind: "closureBridge" }>,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // Track execution time if debug tracing enabled
  const startTime = (env.debug?.traceClosureBridge !== null && env.debug?.traceClosureBridge !== undefined) ? performance.now() : 0;

  // Get closure from registry
  const closure = env.closureRegistry.get(node.closureId);
  if (closure === null || closure === undefined) {
    throw new Error(
      `Missing closure: ${node.closureId}. Closure must be registered before evaluation.`
    );
  }

  // Evaluate input slots (reserved for future - currently unused)
  // In future, these evaluated values could be passed to closure
  // For now, legacy closures only use (t, ctx)
  if (node.inputSlots.length > 0) {
    // Pre-evaluate for cache correctness (even if unused)
    node.inputSlots.forEach((slotId) => evalSig(slotId, env, nodes));
  }

  // Create legacy context from environment
  const ctx = createLegacyContext(env);

  // Call legacy closure
  const result = closure(env.tAbsMs, ctx);

  // Optional debug tracing (zero overhead when disabled)
  if (env.debug?.traceClosureBridge !== null && env.debug?.traceClosureBridge !== undefined) {
    const endTime = performance.now();
    env.debug.traceClosureBridge({
      closureId: node.closureId,
      tAbsMs: env.tAbsMs,
      result,
      executionTimeMs: endTime - startTime,
    });
  }

  return result;
}

/**
 * Evaluate integrate operation: Euler integration (accumulation over time).
 *
 * Algorithm:
 * 1. Evaluate input signal (defaults to 0 if not provided)
 * 2. Read current accumulator from state[offset]
 * 3. Add input * deltaSec to accumulator (Euler step)
 * 4. Write new accumulator to state
 * 5. Return new value
 *
 * State layout:
 * - f64[stateOffset]: accumulator value
 *
 * @param node - Stateful node (op = "integrate")
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns New accumulated value
 */
function evalIntegrate(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;

  const current = env.state.f64[stateOffset];
  const dt = env.runtimeCtx.deltaSec;

  // Euler integration: accumulator += input * dt
  const next = current + input * dt;

  // Update state
  env.state.f64[stateOffset] = next;

  return next;
}

/**
 * Evaluate sampleHold operation: sample input on rising edge of trigger.
 *
 * Algorithm:
 * 1. Evaluate input and trigger signals
 * 2. Read held value and last trigger state
 * 3. Detect rising edge (trigger crosses 0.5 threshold from below)
 * 4. If rising edge, sample input and update held value
 * 5. Update trigger state
 * 6. Return held value
 *
 * State layout:
 * - f64[stateOffset]: held value
 * - f64[stateOffset + 1]: last trigger value
 *
 * Trigger threshold: 0.5 (consistent with select node)
 * Rising edge: was <= 0.5, now > 0.5
 *
 * @param node - Stateful node (op = "sampleHold")
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Held value (sampled on rising edge)
 */
function evalSampleHold(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;

  // Trigger signal must be provided in params
  const triggerSigId = node.params?.trigger;
  if (triggerSigId === undefined) {
    throw new Error("sampleHold requires trigger signal in params.trigger");
  }
  const trigger = evalSig(triggerSigId, env, nodes);

  const heldValue = env.state.f64[stateOffset];
  const lastTrigger = env.state.f64[stateOffset + 1];

  // Detect rising edge (trigger crosses 0.5 threshold)
  if (trigger > 0.5 && lastTrigger <= 0.5) {
    // Sample the input
    env.state.f64[stateOffset] = input;
    env.state.f64[stateOffset + 1] = trigger;
    return input;
  }

  // Update trigger state
  env.state.f64[stateOffset + 1] = trigger;

  // Return held value
  return heldValue;
}

/**
 * Evaluate slew operation: exponential smoothing towards target.
 *
 * Algorithm:
 * 1. Evaluate target signal
 * 2. Read current smoothed value from state
 * 3. Apply exponential smoothing: alpha = 1 - e^(-rate * dt)
 * 4. Update: current += (target - current) * alpha
 * 5. Write new value to state
 * 6. Return smoothed value
 *
 * State layout:
 * - f64[stateOffset]: current smoothed value
 *
 * Rate parameter:
 * - Higher rate = faster approach to target
 * - rate=10 means ~99% approach in 0.5 seconds
 * - Exponential approach never exactly reaches target
 *
 * @param node - Stateful node (op = "slew")
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Smoothed value
 */
function evalSlew(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const target = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;
  const rate = node.params?.rate ?? 1;

  return applySlewCore(target, rate, stateOffset, env);
}

/**
 * Core slew implementation (shared between stateful node and transform step).
 *
 * Applies exponential smoothing with configurable rate.
 * Used by both evalSlew and applyTransformStep (slew step).
 *
 * @param target - Target value to approach
 * @param rate - Slew rate (higher = faster)
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @returns Smoothed value
 */
function applySlewCore(
  target: number,
  rate: number,
  stateOffset: number,
  env: SigEnv
): number {
  const current = env.state.f64[stateOffset];
  const dt = env.runtimeCtx.deltaSec;

  // Exponential approach: alpha = 1 - e^(-rate * dt)
  const alpha = 1 - Math.exp(-rate * dt);
  const next = current + (target - current) * alpha;

  // Update state
  env.state.f64[stateOffset] = next;

  return next;
}

/**
 * Evaluate delayMs operation: time-based delay using ring buffer.
 *
 * Algorithm:
 * 1. Evaluate input signal
 * 2. Calculate delay in samples based on delayMs and deltaMs
 * 3. Read from ring buffer at delayed position
 * 4. Write current input to ring buffer
 * 5. Advance write index
 * 6. Return delayed value
 *
 * State layout:
 * - i32[stateOffset]: write index (ring buffer pointer)
 * - f64[stateOffset + 1 ... stateOffset + bufferSize]: ring buffer
 *
 * CRITICAL:
 * - Buffer size limits maximum delay
 * - Delay clamped to buffer size - 1
 * - Ring buffer wraps using modulo arithmetic
 *
 * @param node - Stateful node (op = "delayMs")
 * @param stateOffset - Offset into state (i32 for index, f64 for buffer)
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Delayed value
 */
function evalDelayMs(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;

  const delayMs = node.params?.delayMs ?? 100;
  const bufferSize = node.params?.bufferSize ?? 64;

  // State layout:
  // i32[stateOffset]: write index
  // f64[stateOffset + 1 ... stateOffset + bufferSize]: ring buffer

  const i32Offset = stateOffset;
  const f64Offset = stateOffset;

  // Calculate read offset based on delay
  const samplesDelay = Math.floor(delayMs / env.runtimeCtx.deltaMs);
  const readOffset = Math.min(samplesDelay, bufferSize - 1);

  // Read from delay buffer
  const writeIdx = env.state.i32[i32Offset];
  const readIdx = (writeIdx + bufferSize - readOffset) % bufferSize;
  const result = env.state.f64[f64Offset + 1 + readIdx];

  // Write current value to buffer
  env.state.f64[f64Offset + 1 + writeIdx] = input;
  env.state.i32[i32Offset] = (writeIdx + 1) % bufferSize;

  return result;
}

/**
 * Evaluate delayFrames operation: frame-based delay using ring buffer.
 *
 * Algorithm:
 * 1. Evaluate input signal
 * 2. Read from ring buffer at oldest position (delayFrames ago)
 * 3. Write current input to ring buffer
 * 4. Advance write index
 * 5. Return delayed value
 *
 * State layout:
 * - i32[stateOffset]: write index (ring buffer pointer)
 * - f64[stateOffset + 1 ... stateOffset + delayFrames]: ring buffer
 *
 * CRITICAL:
 * - Buffer size is delayFrames + 1 (need extra slot for current frame)
 * - Simpler than delayMs (fixed sample count, no dynamic calculation)
 *
 * @param node - Stateful node (op = "delayFrames")
 * @param stateOffset - Offset into state (i32 for index, f64 for buffer)
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Value from N frames ago
 */
function evalDelayFrames(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;

  const delayFrames = node.params?.delayFrames ?? 1;
  const bufferSize = delayFrames + 1;

  const i32Offset = stateOffset;
  const f64Offset = stateOffset;

  const writeIdx = env.state.i32[i32Offset];
  const readIdx = (writeIdx + 1) % bufferSize; // Oldest value
  const result = env.state.f64[f64Offset + 1 + readIdx];

  env.state.f64[f64Offset + 1 + writeIdx] = input;
  env.state.i32[i32Offset] = (writeIdx + 1) % bufferSize;

  return result;
}

/**
 * Evaluate edgeDetectWrap operation: detect phase wrap discontinuity (0.999 -> 0.0).
 *
 * Algorithm:
 * 1. Evaluate input signal (phase value)
 * 2. Read previous phase from state
 * 3. Detect wrap: phase dropped significantly (prevPhase > 0.8 && phase < 0.2)
 * 4. Store current phase for next frame
 * 5. Return 1.0 if wrapped, 0.0 otherwise
 *
 * State layout:
 * - f64[stateOffset]: previous phase value
 *
 * Wrap detection heuristic:
 * - prevPhase > 0.8 AND phase < 0.2
 * - Handles typical phase wrap from 0.95+ to 0.0-0.1
 * - Avoids false positives from normal phase increase
 *
 * @param node - Stateful node (op = "edgeDetectWrap")
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns 1.0 on wrap edge, 0.0 otherwise
 */
function evalEdgeDetectWrap(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const phase = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;
  const prevPhase = env.state.f64[stateOffset];

  // Detect wrap: phase dropped significantly (e.g., 0.95 -> 0.05)
  const wrapped = prevPhase > 0.8 && phase < 0.2;

  // Store current phase for next frame
  env.state.f64[stateOffset] = phase;

  return wrapped ? 1.0 : 0.0;
}

/**
 * Evaluate pulseDivider operation: subdivide phase into discrete tick events.
 *
 * Algorithm:
 * 1. Evaluate input signal (phase value)
 * 2. Calculate subPhase = floor(phase * divisions)
 * 3. Read previous subPhase from state
 * 4. Detect crossing: subPhase !== prevSubPhase
 * 5. Store current subPhase for next frame
 * 6. Return 1.0 if crossing occurred, 0.0 otherwise
 *
 * State layout:
 * - f64[stateOffset]: previous subPhase value (initialized to -1)
 *
 * Logic:
 * - When phase=0.0, subPhase=0 (first tick)
 * - When phase=0.25, subPhase=1 (second tick for divisions=4)
 * - When phase=0.5, subPhase=2 (third tick)
 * - When phase=0.75, subPhase=3 (fourth tick)
 * - Initialization with -1 ensures first evaluation triggers
 *
 * @param node - Stateful node (op = "pulseDivider")
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns 1.0 on tick event, 0.0 otherwise
 */
function evalPulseDivider(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const phase = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;
  const divisions = node.params?.divisions ?? 4;

  // Calculate current subPhase
  const subPhase = Math.floor(phase * divisions);

  // Read previous subPhase
  const prevSubPhase = env.state.f64[stateOffset];

  // Detect crossing (different subPhase)
  const crossed = subPhase !== prevSubPhase;

  // Store current subPhase for next frame
  env.state.f64[stateOffset] = subPhase;

  return crossed ? 1.0 : 0.0;
}

/**
 * Evaluate envelopeAD operation: Attack/Decay envelope generator.
 *
 * Algorithm:
 * 1. Evaluate trigger signal
 * 2. Read trigger time and wasTriggered state
 * 3. Detect rising edge (trigger > 0.5 && !wasTriggered)
 * 4. If triggered, store current time as trigger time
 * 5. Update wasTriggered flag
 * 6. Calculate envelope value based on elapsed time:
 *    - elapsed < 0: return 0 (before first trigger)
 *    - elapsed < attack: return (elapsed / attack) * peak (attack phase)
 *    - elapsed < attack + decay: return peak * (1 - (elapsed - attack) / decay) (decay phase)
 *    - else: return 0 (envelope complete)
 *
 * State layout:
 * - f64[stateOffset]: triggerTime (timestamp of last trigger, initialized to -Infinity)
 * - f64[stateOffset + 1]: wasTriggered (boolean flag, 0 or 1, initialized to 0)
 *
 * Parameters (from node.params):
 * - attack: attack time in milliseconds
 * - decay: decay time in milliseconds
 * - peak: peak amplitude (default 1.0)
 *
 * @param node - Stateful node (op = "envelopeAD")
 * @param stateOffset - Offset into state.f64
 * @param env - Evaluation environment
 * @param nodes - IR node array
 * @returns Envelope value (0..peak)
 */
function evalEnvelopeAD(
  node: Extract<SignalExprIR, { kind: "stateful" }>,
  stateOffset: number,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const trigger = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;

  // Read parameters (times are in milliseconds)
  const attack = node.params?.attack ?? 50; // Default 50ms
  const decay = node.params?.decay ?? 500; // Default 500ms
  const peak = node.params?.peak ?? 1.0;

  // Read state
  const triggerTime = env.state.f64[stateOffset];
  const wasTriggered = env.state.f64[stateOffset + 1] > 0.5;

  // Detect rising edge (trigger fires)
  if (trigger > 0.5 && !wasTriggered) {
    // Store trigger time
    env.state.f64[stateOffset] = env.tAbsMs;
    env.state.f64[stateOffset + 1] = 1.0;
  } else if (trigger <= 0.5) {
    // Clear trigger flag when trigger goes low
    env.state.f64[stateOffset + 1] = 0.0;
  }

  // Calculate elapsed time since trigger
  const elapsed = env.tAbsMs - triggerTime;

  // Calculate envelope value
  if (elapsed < 0) {
    // Before first trigger
    return 0;
  } else if (elapsed < attack) {
    // Attack phase: linear ramp up
    return (elapsed / attack) * peak;
  } else if (elapsed < attack + decay) {
    // Decay phase: linear ramp down
    const decayProgress = (elapsed - attack) / decay;
    return peak * (1 - decayProgress);
  } else {
    // Envelope complete
    return 0;
  }
}

/**
 * Apply a single transform step to a value.
 *
 * Implements all transform step kinds:
 * - scaleBias: value * scale + bias (linear transform)
 * - normalize: clamp to 0..1 or -1..1
 * - quantize: round to nearest step size
 * - ease: apply easing curve
 * - map: apply pure function (reuse OpCode)
 * - slew: exponential smoothing (stateful - Sprint 5)
 * - cast: PLACEHOLDER - throws error (future)
 *
 * @param step - Transform step from chain
 * @param value - Input value
 * @param env - Evaluation environment (for easing curves and state)
 * @returns Transformed value
 * @throws Error if step kind is unknown or not yet implemented
 *
 * @example
 * ```typescript
 * const env = createSigEnv({ ... });
 * console.log(applyTransformStep({ kind: "scaleBias", scale: 2, bias: 10 }, 5, env)); // 20
 * console.log(applyTransformStep({ kind: "normalize", mode: "0..1" }, 1.5, env)); // 1.0
 * console.log(applyTransformStep({ kind: "quantize", step: 0.25 }, 0.3, env)); // 0.25
 * ```
 */
function applyTransformStep(
  step: TransformStepIR,
  value: number,
  env: SigEnv
): number {
  switch (step.kind) {
    case "scaleBias":
      // Linear transform: y = mx + b
      return value * step.scale + step.bias;

    case "normalize":
      // Clamp to range
      if (step.mode === "0..1") {
        return Math.max(0, Math.min(1, value));
      } else {
        // "-1..1"
        return Math.max(-1, Math.min(1, value));
      }

    case "quantize":
      // Round to nearest step
      return Math.round(value / step.step) * step.step;

    case "ease": {
      // Apply easing curve (input clamped to [0,1] by applyEasing)
      const curves = env.easingCurves;
      if (curves === null || curves === undefined) {
        throw new Error("Easing curves not available in environment");
      }
      return applyEasing(step.curveId, value, curves);
    }

    case "map":
      // Apply pure function (reuse OpCode registry)
      return applyPureFn(step.fn, value);

    case "slew":
      // Exponential smoothing (stateful - uses state buffer)
      return applySlewCore(value, step.rate, step.stateOffset, env);

    case "cast":
      // Placeholder - type casts not yet implemented
      throw new Error(
        `Cast operation '${step.op}' not yet implemented (future sprint)`
      );

    default: {
      // Exhaustiveness check
      const unknownStep = step as { kind: string };
      throw new Error(`Unknown transform step kind: ${unknownStep.kind}`);
    }
  }
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
      // Exhaustiveness check - extract mode as string to avoid 'never' type in template
      const exhaustiveCheck: never = mode;
      const modeStr = String(exhaustiveCheck);
      throw new Error(`Unknown combine mode: ${modeStr}`);
    }
  }
}
