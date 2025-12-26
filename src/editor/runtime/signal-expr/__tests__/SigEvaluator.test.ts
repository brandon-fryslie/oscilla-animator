/**
 * Signal Evaluator Test Suite
 *
 * Comprehensive tests for the SignalExpr evaluator.
 * Covers: cache behavior, node evaluation, DAG composition, shared subexpressions,
 * conditional evaluation (select), external inputs (inputSlot), bus combine.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P1 "Create Test Suite"
 * - .agent_planning/signalexpr-runtime/DOD-20251225-190000.md §P1 "Create Test Suite for Core Evaluator"
 * - .agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md §P1 "Test Suite for Select and InputSlot"
 * - .agent_planning/signalexpr-runtime/SPRINT-03-busCombine.md §P1 "Comprehensive Test Suite for BusCombine"
 */

import { describe, it, expect } from "vitest";
import { evalSig } from "../SigEvaluator";
import { createSigFrameCache, newFrame } from "../SigFrameCache";
import {
  createSigEnv,
  createConstPool,
  type SigEnv,
  type ConstPool,
} from "../SigEnv";
import {
  createArraySlotReader,
  createEmptySlotReader,
} from "../SlotValueReader";
import type { SignalExprIR } from "../../../compiler/ir/signalExpr";
import type { SigFrameCache } from "../SigFrameCache";
import type { DebugSink, BusCombineTraceInfo } from "../DebugSink";
import type { TransformTraceInfo } from "../DebugSink";
import type { TransformChainIR } from "../../../compiler/ir/transforms";
import type { TransformTable } from "../../../compiler/ir/transforms";
import type { SigCombineSpec } from "../../../compiler/ir/signalExpr";
import { OpCode } from "../../../compiler/ir/opcodes";
import type { TypeDesc } from "../../../compiler/ir/types";

// Test helpers

const numberType: TypeDesc = { world: "signal", domain: "number" };
const timeType: TypeDesc = { world: "signal", domain: "timeMs" };

interface CreateTestEnvOptions {
  tAbsMs?: number;
  consts?: number[];
  constPool?: ConstPool;
  cache?: SigFrameCache;
  transformTable?: TransformTable;
  debug?: DebugSink;
}

function createTestEnv(params?: CreateTestEnvOptions): SigEnv {
  const constPool = params?.constPool ?? createConstPool(params?.consts ?? []);
  return createSigEnv({
    tAbsMs: params?.tAbsMs ?? 0,
    constPool,
    cache: params?.cache ?? createSigFrameCache(1024),
    transformTable: params?.transformTable,
    debug: params?.debug,
  });
}


// =============================================================================
// Cache Infrastructure Tests
// =============================================================================

describe("SigFrameCache", () => {
  it("creates cache with correct capacity", () => {
    const cache = createSigFrameCache(1024);
    expect(cache.frameId).toBe(1);
    expect(cache.value.length).toBe(1024);
    expect(cache.stamp.length).toBe(1024);
    expect(cache.validMask.length).toBe(1024);
  });

  it("advances frame without clearing arrays", () => {
    const cache = createSigFrameCache(10);
    cache.value[5] = 42;
    cache.stamp[5] = 0;

    newFrame(cache, 2);

    expect(cache.frameId).toBe(2);
    expect(cache.value[5]).toBe(42); // Value persists (not cleared)
    expect(cache.stamp[5]).toBe(0); // Stamp persists (now stale)
  });

  it("detects cache hits correctly", () => {
    const cache = createSigFrameCache(10);

    // Write to cache
    cache.value[5] = 42;
    cache.stamp[5] = cache.frameId;

    // Same frame - should hit cache
    expect(cache.stamp[5]).toBe(cache.frameId);
    expect(cache.value[5]).toBe(42);
  });

  it("detects cache misses correctly", () => {
    const cache = createSigFrameCache(10);
    cache.value[5] = 42;
    cache.stamp[5] = 0;

    newFrame(cache, 2);

    // Different frame - cache miss
    expect(cache.stamp[5]).not.toBe(cache.frameId);
  });
});

describe("SigEnv", () => {
  it("creates environment with correct fields", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([1, 2, 3]);
    const slots = createEmptySlotReader();
    const env = createSigEnv({
      tAbsMs: 1000,
      constPool,
      cache,
      slotValues: slots,
    });

    expect(env.tAbsMs).toBe(1000);
    expect(env.constPool).toBe(constPool);
    expect(env.cache).toBe(cache);
    expect(env.slotValues).toBe(slots);
  });

  it("creates environment with default empty slot reader", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([1, 2, 3]);
    const env = createSigEnv({ tAbsMs: 1000, constPool, cache });

    // Should have a slot reader (default empty one)
    expect(env.slotValues).toBeDefined();
    expect(env.slotValues.readNumber(0)).toBeNaN();
  });

  it("reads constants from pool", () => {
    const pool = createConstPool([10, 20, 3.14]);
    const env = createTestEnv({ constPool: pool });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      { kind: "const", type: numberType, constId: 2 },
    ];

    expect(evalSig(0, env, nodes)).toBe(10);
    expect(evalSig(1, env, nodes)).toBe(20);
    expect(evalSig(2, env, nodes)).toBeCloseTo(3.14, 5);
  });

  it("throws error for invalid constId", () => {
    const pool = createConstPool([1, 2, 3]);
    const env = createTestEnv({ constPool: pool });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 99 }, // Out of bounds
    ];

    expect(() => evalSig(0, env, nodes)).toThrow("Invalid constId");
  });
});

// =============================================================================
// Core Evaluator Tests
// =============================================================================

describe("evalSig - const nodes", () => {
  it("evaluates const nodes correctly", () => {
    const constPool = createConstPool([42, 3.14, -10]);
    const env = createTestEnv({ constPool });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      { kind: "const", type: numberType, constId: 2 },
    ];

    expect(evalSig(0, env, nodes)).toBe(42);
    expect(evalSig(1, env, nodes)).toBeCloseTo(3.14, 5);
    expect(evalSig(2, env, nodes)).toBe(-10);
  });

  it("caches const node results", () => {
    const constPool = createConstPool([42]);
    const cache = createSigFrameCache(10);
    const env = createTestEnv({ constPool, cache });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
    ];

    // First evaluation
    evalSig(0, env, nodes);
    expect(cache.stamp[0]).toBe(cache.frameId);
    expect(cache.value[0]).toBe(42);

    // Second evaluation - should hit cache
    const result = evalSig(0, env, nodes);
    expect(result).toBe(42);
  });
});

describe("evalSig - timeAbsMs nodes", () => {
  it("evaluates timeAbsMs nodes correctly", () => {
    const env = createTestEnv({ tAbsMs: 1234 });
    const nodes: SignalExprIR[] = [{ kind: "timeAbsMs", type: timeType }];

    expect(evalSig(0, env, nodes)).toBe(1234);
  });

  it("returns same time value for all nodes in frame", () => {
    const cache = createSigFrameCache(10);
    const env = createTestEnv({ tAbsMs: 1000, cache });

    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType }, // id: 0
      { kind: "timeAbsMs", type: timeType }, // id: 1
    ];

    expect(evalSig(0, env, nodes)).toBe(1000);
    expect(evalSig(1, env, nodes)).toBe(1000);
  });

  it("caches timeAbsMs results", () => {
    const cache = createSigFrameCache(10);
    const env = createTestEnv({ tAbsMs: 1000, cache });

    const nodes: SignalExprIR[] = [{ kind: "timeAbsMs", type: timeType }];

    // First evaluation
    evalSig(0, env, nodes);
    expect(cache.stamp[0]).toBe(cache.frameId);
    expect(cache.value[0]).toBe(1000);

    // Second evaluation - should hit cache
    const result = evalSig(0, env, nodes);
    expect(result).toBe(1000);
  });
});

// =============================================================================
// Cache Behavior Tests
// =============================================================================

describe("evalSig - cache behavior", () => {
  it("caches results within frame", () => {
    const cache = createSigFrameCache(10);

    // Create env with mutable tAbsMs (for testing)
    const env = createTestEnv({ tAbsMs: 1000, cache });
    const nodes: SignalExprIR[] = [{ kind: "timeAbsMs", type: timeType }];

    // First evaluation
    const result1 = evalSig(0, env, nodes);
    expect(result1).toBe(1000);

    // Verify cache hit by checking stamp
    expect(cache.stamp[0]).toBe(cache.frameId);

    // Second evaluation should hit cache (same frame)
    const result2 = evalSig(0, env, nodes);
    expect(result2).toBe(1000);
  });

  it("invalidates cache on new frame", () => {
    const cache = createSigFrameCache(10);
    const nodes: SignalExprIR[] = [{ kind: "timeAbsMs", type: timeType }];

    // Frame 0
    const env1 = createTestEnv({ tAbsMs: 1000, cache });
    evalSig(0, env1, nodes);
    expect(cache.value[0]).toBe(1000);
    expect(cache.stamp[0]).toBe(1);

    // Frame 1 (new frame)
    newFrame(cache, 2);
    const env2 = createTestEnv({ tAbsMs: 2000, cache });
    const result = evalSig(0, env2, nodes);

    expect(result).toBe(2000); // New value
    expect(cache.stamp[0]).toBe(2); // Updated stamp
  });
});

// =============================================================================
// Map Node Tests
// =============================================================================

describe("evalSig - map nodes", () => {
  it("evaluates sin(t) correctly", () => {
    const env = createTestEnv({ tAbsMs: Math.PI / 2 });
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType }, // id: 0
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Sin },
      }, // id: 1
    ];

    expect(evalSig(1, env, nodes)).toBeCloseTo(1, 5);
  });

  it("evaluates cos(t) correctly", () => {
    const env = createTestEnv({ tAbsMs: 0 });
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType },
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Cos },
      },
    ];

    expect(evalSig(1, env, nodes)).toBeCloseTo(1, 5);
  });

  it("evaluates abs(-42) correctly", () => {
    const constPool = createConstPool([-42]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Abs },
      },
    ];

    expect(evalSig(1, env, nodes)).toBe(42);
  });

  it("evaluates floor(3.14) correctly", () => {
    const constPool = createConstPool([3.14]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Floor },
      },
    ];

    expect(evalSig(1, env, nodes)).toBe(3);
  });

  it("caches map node results", () => {
    const cache = createSigFrameCache(10);
    const env = createTestEnv({ tAbsMs: Math.PI, cache });
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType },
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Sin },
      },
    ];

    // First evaluation
    const result1 = evalSig(1, env, nodes);

    // Verify cache
    expect(cache.stamp[1]).toBe(cache.frameId);
    expect(cache.value[1]).toBeCloseTo(result1, 10);

    // Second evaluation - should hit cache
    const result2 = evalSig(1, env, nodes);
    expect(result2).toBeCloseTo(result1, 10);
  });
});

// =============================================================================
// Zip Node Tests
// =============================================================================

describe("evalSig - zip nodes", () => {
  it("evaluates a + b correctly", () => {
    const constPool = createConstPool([10, 20]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 10
      { kind: "const", type: numberType, constId: 1 }, // 20
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Add },
      },
    ];

    expect(evalSig(2, env, nodes)).toBe(30);
  });

  it("evaluates a * b correctly", () => {
    const constPool = createConstPool([5, 7]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Mul },
      },
    ];

    expect(evalSig(2, env, nodes)).toBe(35);
  });

  it("evaluates min(a, b) correctly", () => {
    const constPool = createConstPool([10, 5]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Min },
      },
    ];

    expect(evalSig(2, env, nodes)).toBe(5);
  });

  it("evaluates max(a, b) correctly", () => {
    const constPool = createConstPool([10, 5]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Max },
      },
    ];

    expect(evalSig(2, env, nodes)).toBe(10);
  });

  it("handles division by zero safely", () => {
    const constPool = createConstPool([10, 0]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Div },
      },
    ];

    expect(evalSig(2, env, nodes)).toBe(0); // Safe default
  });

  it("caches zip node results", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([10, 20]);
    const env = createTestEnv({ constPool, cache });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Add },
      },
    ];

    // First evaluation
    const result1 = evalSig(2, env, nodes);
    expect(result1).toBe(30);

    // Verify cache
    expect(cache.stamp[2]).toBe(cache.frameId);
    expect(cache.value[2]).toBe(30);

    // Second evaluation - should hit cache
    const result2 = evalSig(2, env, nodes);
    expect(result2).toBe(30);
  });
});

// =============================================================================
// Select Node Tests
// =============================================================================

describe("evalSig - select nodes", () => {
  it("evaluates true branch when cond > 0.5", () => {
    const constPool = createConstPool([1.0, 100, 200]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: cond = 1.0
      { kind: "const", type: numberType, constId: 1 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 }, // 3: select
    ];

    expect(evalSig(3, env, nodes)).toBe(100);
  });

  it("evaluates false branch when cond <= 0.5", () => {
    const constPool = createConstPool([0.0, 100, 200]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: cond = 0.0
      { kind: "const", type: numberType, constId: 1 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 },
    ];

    expect(evalSig(3, env, nodes)).toBe(200);
  });

  it("uses 0.5 as threshold (0.5 is false)", () => {
    const constPool = createConstPool([0.5, 100, 200]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: cond = 0.5
      { kind: "const", type: numberType, constId: 1 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 },
    ];

    expect(evalSig(3, env, nodes)).toBe(200); // 0.5 is false
  });

  it("uses 0.5 as threshold (0.50001 is true)", () => {
    const constPool = createConstPool([0.50001, 100, 200]);
    const env = createTestEnv({ constPool });
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: cond = 0.50001
      { kind: "const", type: numberType, constId: 1 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 },
    ];

    expect(evalSig(3, env, nodes)).toBe(100); // 0.50001 is true
  });

  it("evaluates condition based on signal", () => {
    const constPool = createConstPool([0.001, 100, 200]);
    const env = createTestEnv({ tAbsMs: 1000, constPool });

    // cond = t * 0.001 = 1000 * 0.001 = 1.0 (true)
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType }, // 0: t = 1000
      { kind: "const", type: numberType, constId: 0 }, // 1: 0.001
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Mul },
      }, // 2: cond = 1.0
      { kind: "const", type: numberType, constId: 1 }, // 3: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 4: f = 200
      { kind: "select", type: numberType, cond: 2, t: 3, f: 4 }, // 5: select
    ];

    expect(evalSig(5, env, nodes)).toBe(100);
  });

  it("short-circuits evaluation (true branch)", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([1.0, 100, 200]);
    const env = createTestEnv({ constPool, cache });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: cond = 1.0 (true)
      { kind: "const", type: numberType, constId: 1 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 }, // 3: select
    ];

    evalSig(3, env, nodes);

    // Verify condition was evaluated
    expect(cache.stamp[0]).toBe(cache.frameId);

    // Verify true branch was evaluated
    expect(cache.stamp[1]).toBe(cache.frameId);

    // Verify false branch was NOT evaluated (short-circuit)
    expect(cache.stamp[2]).not.toBe(cache.frameId);
  });

  it("short-circuits evaluation (false branch)", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([0.0, 100, 200]);
    const env = createTestEnv({ constPool, cache });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: cond = 0.0 (false)
      { kind: "const", type: numberType, constId: 1 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 2 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 }, // 3: select
    ];

    evalSig(3, env, nodes);

    // Verify condition was evaluated
    expect(cache.stamp[0]).toBe(cache.frameId);

    // Verify true branch was NOT evaluated (short-circuit)
    expect(cache.stamp[1]).not.toBe(cache.frameId);

    // Verify false branch was evaluated
    expect(cache.stamp[2]).toBe(cache.frameId);
  });

  it("caches select node results", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([1.0, 100, 200]);
    const env = createTestEnv({ constPool, cache });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      { kind: "const", type: numberType, constId: 2 },
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 },
    ];

    // First evaluation
    const result1 = evalSig(3, env, nodes);
    expect(result1).toBe(100);

    // Verify cache
    expect(cache.stamp[3]).toBe(cache.frameId);
    expect(cache.value[3]).toBe(100);

    // Second evaluation - should hit cache
    const result2 = evalSig(3, env, nodes);
    expect(result2).toBe(100);
  });

  it("supports nested select nodes", () => {
    const constPool = createConstPool([1.0, 0.0, 100, 200, 300]);
    const env = createTestEnv({ constPool });

    // Outer select: cond=1.0 (true), so evaluate t branch
    // Inner select (t branch): cond=0.0 (false), so evaluate f branch = 200
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: outer cond = 1.0
      { kind: "const", type: numberType, constId: 1 }, // 1: inner cond = 0.0
      { kind: "const", type: numberType, constId: 2 }, // 2: 100
      { kind: "const", type: numberType, constId: 3 }, // 3: 200
      { kind: "select", type: numberType, cond: 1, t: 2, f: 3 }, // 4: inner select = 200
      { kind: "const", type: numberType, constId: 4 }, // 5: 300
      { kind: "select", type: numberType, cond: 0, t: 4, f: 5 }, // 6: outer select = 200
    ];

    expect(evalSig(6, env, nodes)).toBe(200);
  });
});

// =============================================================================
// InputSlot Node Tests
// =============================================================================

describe("evalSig - inputSlot nodes", () => {
  it("reads slot value", () => {
    const slots = createArraySlotReader(new Map([[0, 42]]));
    const cache = createSigFrameCache(10);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      slotValues: slots,
    });

    const nodes: SignalExprIR[] = [
      { kind: "inputSlot", type: numberType, slot: 0 },
    ];

    expect(evalSig(0, env, nodes)).toBe(42);
  });

  it("returns NaN for missing slot", () => {
    const slots = createArraySlotReader(new Map()); // Empty
    const cache = createSigFrameCache(10);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      slotValues: slots,
    });

    const nodes: SignalExprIR[] = [
      { kind: "inputSlot", type: numberType, slot: 99 },
    ];

    expect(evalSig(0, env, nodes)).toBeNaN();
  });

  it("reads multiple different slots", () => {
    const slots = createArraySlotReader(
      new Map([
        [0, 10],
        [1, 20],
        [5, 50],
      ])
    );
    const cache = createSigFrameCache(10);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      slotValues: slots,
    });

    const nodes: SignalExprIR[] = [
      { kind: "inputSlot", type: numberType, slot: 0 },
      { kind: "inputSlot", type: numberType, slot: 1 },
      { kind: "inputSlot", type: numberType, slot: 5 },
    ];

    expect(evalSig(0, env, nodes)).toBe(10);
    expect(evalSig(1, env, nodes)).toBe(20);
    expect(evalSig(2, env, nodes)).toBe(50);
  });

  it("caches inputSlot results", () => {
    const slots = createArraySlotReader(new Map([[0, 42]]));
    const cache = createSigFrameCache(10);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      slotValues: slots,
    });

    const nodes: SignalExprIR[] = [
      { kind: "inputSlot", type: numberType, slot: 0 },
    ];

    // First evaluation
    const result1 = evalSig(0, env, nodes);
    expect(result1).toBe(42);

    // Verify cache
    expect(cache.stamp[0]).toBe(cache.frameId);
    expect(cache.value[0]).toBe(42);

    // Second evaluation - should hit cache
    const result2 = evalSig(0, env, nodes);
    expect(result2).toBe(42);
  });

  it("integrates with zip nodes", () => {
    const slots = createArraySlotReader(new Map([[0, 10]]));
    const constPool = createConstPool([5]);
    const cache = createSigFrameCache(10);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      slotValues: slots,
    });

    // slot[0] + 5 = 10 + 5 = 15
    const nodes: SignalExprIR[] = [
      { kind: "inputSlot", type: numberType, slot: 0 }, // 0: 10
      { kind: "const", type: numberType, constId: 0 }, // 1: 5
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Add },
      }, // 2: 15
    ];

    expect(evalSig(2, env, nodes)).toBe(15);
  });

  it("integrates with select nodes", () => {
    const slots = createArraySlotReader(new Map([[0, 1.0]]));
    const constPool = createConstPool([100, 200]);
    const cache = createSigFrameCache(10);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      slotValues: slots,
    });

    // select(slot[0], 100, 200) where slot[0] = 1.0 (true)
    const nodes: SignalExprIR[] = [
      { kind: "inputSlot", type: numberType, slot: 0 }, // 0: cond = 1.0
      { kind: "const", type: numberType, constId: 0 }, // 1: t = 100
      { kind: "const", type: numberType, constId: 1 }, // 2: f = 200
      { kind: "select", type: numberType, cond: 0, t: 1, f: 2 }, // 3: select = 100
    ];

    expect(evalSig(3, env, nodes)).toBe(100);
  });
});

// =============================================================================
// BusCombine Node Tests (Sprint 3)
// =============================================================================

describe("evalSig - busCombine nodes", () => {
  describe("empty bus", () => {
    it("returns 0 when no default specified", () => {
      const nodes: SignalExprIR[] = [
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({});
      expect(evalSig(0, env, nodes)).toBe(0);
    });

    it("returns custom default when specified", () => {
      const nodes: SignalExprIR[] = [
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [],
          combine: { mode: "sum", default: 100 },
        },
      ];
      const env = createTestEnv({});
      expect(evalSig(0, env, nodes)).toBe(100);
    });

    it("returns default for all combine modes", () => {
      const env = createTestEnv({});

      const modes: Array<SigCombineSpec["mode"]> = [
        "sum",
        "average",
        "min",
        "max",
        "first",
        "last",
      ];

      for (const mode of modes) {
        const nodes: SignalExprIR[] = [
          {
            kind: "busCombine",
            type: numberType,
            busIndex: 0,
            terms: [],
            combine: { mode, default: 42 },
          },
        ];
        expect(evalSig(0, env, nodes)).toBe(42);
      }
    });
  });

  describe("single term bus", () => {
    it("returns term value directly (no combine)", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 42
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [42] });
      expect(evalSig(1, env, nodes)).toBe(42);
    });

    it("works for all combine modes", () => {
      const env = createTestEnv({ consts: [99] });

      const modes: Array<SigCombineSpec["mode"]> = [
        "sum",
        "average",
        "min",
        "max",
        "first",
        "last",
      ];

      for (const mode of modes) {
        const nodes: SignalExprIR[] = [
          { kind: "const", type: numberType, constId: 0 },
          {
            kind: "busCombine",
            type: numberType,
            busIndex: 0,
            terms: [0],
            combine: { mode },
          },
        ];
        expect(evalSig(1, env, nodes)).toBe(99);
      }
    });
  });

  describe("sum mode", () => {
    it("sums two terms", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // 20
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [10, 20] });
      expect(evalSig(2, env, nodes)).toBe(30);
    });

    it("sums all terms (5 terms)", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // 20
        { kind: "const", type: numberType, constId: 2 }, // 30
        { kind: "const", type: numberType, constId: 3 }, // 40
        { kind: "const", type: numberType, constId: 4 }, // 50
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2, 3, 4],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [10, 20, 30, 40, 50] });
      expect(evalSig(5, env, nodes)).toBe(150);
    });

    it("handles negative values", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // -5
        { kind: "const", type: numberType, constId: 2 }, // 3
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [10, -5, 3] });
      expect(evalSig(3, env, nodes)).toBe(8);
    });
  });

  describe("average mode", () => {
    it("averages all terms", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // 20
        { kind: "const", type: numberType, constId: 2 }, // 30
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "average" },
        },
      ];
      const env = createTestEnv({ consts: [10, 20, 30] });
      expect(evalSig(3, env, nodes)).toBe(20);
    });

    it("computes correct average for uneven values", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 1
        { kind: "const", type: numberType, constId: 1 }, // 2
        { kind: "const", type: numberType, constId: 2 }, // 3
        { kind: "const", type: numberType, constId: 3 }, // 4
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2, 3],
          combine: { mode: "average" },
        },
      ];
      const env = createTestEnv({ consts: [1, 2, 3, 4] });
      expect(evalSig(4, env, nodes)).toBe(2.5);
    });
  });

  describe("min mode", () => {
    it("finds minimum with positive values", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 50
        { kind: "const", type: numberType, constId: 1 }, // 10
        { kind: "const", type: numberType, constId: 2 }, // 30
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "min" },
        },
      ];
      const env = createTestEnv({ consts: [50, 10, 30] });
      expect(evalSig(3, env, nodes)).toBe(10);
    });

    it("finds minimum with negative values", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 5
        { kind: "const", type: numberType, constId: 1 }, // -10
        { kind: "const", type: numberType, constId: 2 }, // 0
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "min" },
        },
      ];
      const env = createTestEnv({ consts: [5, -10, 0] });
      expect(evalSig(3, env, nodes)).toBe(-10);
    });

    it("handles zeros", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0
        { kind: "const", type: numberType, constId: 1 }, // 0
        { kind: "const", type: numberType, constId: 2 }, // 0
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "min" },
        },
      ];
      const env = createTestEnv({ consts: [0, 0, 0] });
      expect(evalSig(3, env, nodes)).toBe(0);
    });
  });

  describe("max mode", () => {
    it("finds maximum", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 50
        { kind: "const", type: numberType, constId: 1 }, // 10
        { kind: "const", type: numberType, constId: 2 }, // 30
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "max" },
        },
      ];
      const env = createTestEnv({ consts: [50, 10, 30] });
      expect(evalSig(3, env, nodes)).toBe(50);
    });

    it("finds maximum with negative values", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // -5
        { kind: "const", type: numberType, constId: 1 }, // -10
        { kind: "const", type: numberType, constId: 2 }, // -3
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "max" },
        },
      ];
      const env = createTestEnv({ consts: [-5, -10, -3] });
      expect(evalSig(3, env, nodes)).toBe(-3);
    });
  });

  describe("first mode", () => {
    it("returns first term", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 100
        { kind: "const", type: numberType, constId: 1 }, // 200
        { kind: "const", type: numberType, constId: 2 }, // 300
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "first" },
        },
      ];
      const env = createTestEnv({ consts: [100, 200, 300] });
      expect(evalSig(3, env, nodes)).toBe(100);
    });

    it("respects compiler-sorted order", () => {
      // Terms are already sorted by compiler - runtime uses as-is
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 999
        { kind: "const", type: numberType, constId: 1 }, // 111
        { kind: "const", type: numberType, constId: 2 }, // 555
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          // Compiler sorted in this order
          terms: [1, 2, 0],
          combine: { mode: "first" },
        },
      ];
      const env = createTestEnv({ consts: [999, 111, 555] });
      // First in sorted order is 111 (terms[0] = sigId 1)
      expect(evalSig(3, env, nodes)).toBe(111);
    });
  });

  describe("last mode", () => {
    it("returns last term", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 100
        { kind: "const", type: numberType, constId: 1 }, // 200
        { kind: "const", type: numberType, constId: 2 }, // 300
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "last" },
        },
      ];
      const env = createTestEnv({ consts: [100, 200, 300] });
      expect(evalSig(3, env, nodes)).toBe(300);
    });

    it("respects compiler-sorted order", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 999
        { kind: "const", type: numberType, constId: 1 }, // 111
        { kind: "const", type: numberType, constId: 2 }, // 555
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          // Compiler sorted in this order
          terms: [1, 2, 0],
          combine: { mode: "last" },
        },
      ];
      const env = createTestEnv({ consts: [999, 111, 555] });
      // Last in sorted order is 999 (terms[2] = sigId 0)
      expect(evalSig(3, env, nodes)).toBe(999);
    });
  });

  describe("caching", () => {
    it("caches combine result", () => {
      const cache = createSigFrameCache(10);
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [42], cache });

      evalSig(1, env, nodes);
      expect(env.cache.stamp[1]).toBe(env.cache.frameId);
      expect(env.cache.value[1]).toBe(42);
    });

    it("caches term results individually", () => {
      const cache = createSigFrameCache(10);
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "const", type: numberType, constId: 1 },
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [10, 20], cache });

      evalSig(2, env, nodes);
      // Both terms should be cached
      expect(env.cache.stamp[0]).toBe(env.cache.frameId);
      expect(env.cache.stamp[1]).toBe(env.cache.frameId);
      expect(env.cache.value[0]).toBe(10);
      expect(env.cache.value[1]).toBe(20);
    });

    it("evaluates all terms even if some are cached", () => {
      const cache = createSigFrameCache(10);
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // 20
        { kind: "const", type: numberType, constId: 2 }, // 30
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [10, 20, 30], cache });

      // Pre-cache term 0
      evalSig(0, env, nodes);
      expect(cache.stamp[0]).toBe(cache.frameId);

      // Evaluate combine - should use cached term 0 and evaluate others
      const result = evalSig(3, env, nodes);
      expect(result).toBe(60);

      // All terms should be cached
      expect(cache.stamp[0]).toBe(cache.frameId);
      expect(cache.stamp[1]).toBe(cache.frameId);
      expect(cache.stamp[2]).toBe(cache.frameId);
    });
  });

  describe("debug tracing", () => {
    it("calls debug sink when enabled", () => {
      const traceInfo: BusCombineTraceInfo[] = [];
      const debug: DebugSink = {
        traceBusCombine: (info) => traceInfo.push(info),
      };

      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "const", type: numberType, constId: 1 },
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 42,
          terms: [0, 1],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [10, 20], debug });

      evalSig(2, env, nodes);

      expect(traceInfo).toHaveLength(1);
      expect(traceInfo[0].busIndex).toBe(42);
      expect(traceInfo[0].termIds).toEqual([0, 1]);
      expect(traceInfo[0].termValues).toEqual([10, 20]);
      expect(traceInfo[0].mode).toBe("sum");
      expect(traceInfo[0].result).toBe(30);
    });

    it("does not call debug sink when disabled", () => {
      let called = false;
      const debug: DebugSink = {
        // traceBusCombine is undefined - should not be called
      };

      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [42], debug });

      evalSig(1, env, nodes);

      // Should not throw or call anything
      expect(called).toBe(false);
    });

    it("does not call debug sink when env.debug is undefined", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [42] }); // No debug

      // Should not throw
      expect(() => evalSig(1, env, nodes)).not.toThrow();
    });

    it("traces empty bus", () => {
      const traceInfo: BusCombineTraceInfo[] = [];
      const debug: DebugSink = {
        traceBusCombine: (info) => traceInfo.push(info),
      };

      const nodes: SignalExprIR[] = [
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 99,
          terms: [],
          combine: { mode: "sum", default: 100 },
        },
      ];
      const env = createTestEnv({ debug });

      evalSig(0, env, nodes);

      // Empty bus should NOT trace (optimization - no combine happened)
      expect(traceInfo).toHaveLength(0);
    });

    it("traces single term bus", () => {
      const traceInfo: BusCombineTraceInfo[] = [];
      const debug: DebugSink = {
        traceBusCombine: (info) => traceInfo.push(info),
      };

      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 1,
          terms: [0],
          combine: { mode: "sum" },
        },
      ];
      const env = createTestEnv({ consts: [42], debug });

      evalSig(1, env, nodes);

      // Single term should NOT trace (optimization - no combine happened)
      expect(traceInfo).toHaveLength(0);
    });
  });

  describe("integration", () => {
    it("works with map nodes as terms", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 3.14
        { kind: "const", type: numberType, constId: 1 }, // -5.7
        {
          kind: "map",
          type: numberType,
          src: 0,
          fn: { kind: "opcode", opcode: OpCode.Floor },
        }, // floor(3.14) = 3
        {
          kind: "map",
          type: numberType,
          src: 1,
          fn: { kind: "opcode", opcode: OpCode.Abs },
        }, // abs(-5.7) = 5.7
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [2, 3],
          combine: { mode: "sum" },
        }, // 3 + 5.7 = 8.7
      ];
      const env = createTestEnv({ consts: [3.14, -5.7] });
      expect(evalSig(4, env, nodes)).toBeCloseTo(8.7, 5);
    });

    it("works with zip nodes as terms", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // 5
        { kind: "const", type: numberType, constId: 2 }, // 3
        {
          kind: "zip",
          type: numberType,
          a: 0,
          b: 1,
          fn: { kind: "opcode", opcode: OpCode.Add },
        }, // 10 + 5 = 15
        {
          kind: "zip",
          type: numberType,
          a: 1,
          b: 2,
          fn: { kind: "opcode", opcode: OpCode.Mul },
        }, // 5 * 3 = 15
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [3, 4],
          combine: { mode: "max" },
        }, // max(15, 15) = 15
      ];
      const env = createTestEnv({ consts: [10, 5, 3] });
      expect(evalSig(5, env, nodes)).toBe(15);
    });

    it("works with nested busCombine nodes", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "const", type: numberType, constId: 1 }, // 20
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 0,
          terms: [0, 1],
          combine: { mode: "sum" },
        }, // 10 + 20 = 30
        { kind: "const", type: numberType, constId: 2 }, // 5
        {
          kind: "busCombine",
          type: numberType,
          busIndex: 1,
          terms: [2, 3],
          combine: { mode: "average" },
        }, // (30 + 5) / 2 = 17.5
      ];
      const env = createTestEnv({ consts: [10, 20, 5] });
      expect(evalSig(4, env, nodes)).toBe(17.5);
    });
  });
});

// =============================================================================
// DAG Evaluation Tests
// =============================================================================

describe("evalSig - DAG evaluation", () => {
  it("evaluates sin(t * 0.001) correctly", () => {
    const constPool = createConstPool([0.001]);
    const env = createTestEnv({ tAbsMs: (Math.PI / 2) * 1000, constPool });

    // DAG: sin(t * 0.001)
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType }, // 0: t
      { kind: "const", type: numberType, constId: 0 }, // 1: 0.001
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Mul },
      }, // 2: t * 0.001
      {
        kind: "map",
        type: numberType,
        src: 2,
        fn: { kind: "opcode", opcode: OpCode.Sin },
      }, // 3: sin(t * 0.001)
    ];

    expect(evalSig(3, env, nodes)).toBeCloseTo(1, 5);
  });

  it("evaluates (a + b) * 2 correctly", () => {
    const constPool = createConstPool([10, 20, 2]);
    const env = createTestEnv({ constPool });

    // DAG: (a + b) * 2
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: 10
      { kind: "const", type: numberType, constId: 1 }, // 1: 20
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Add },
      }, // 2: 30
      { kind: "const", type: numberType, constId: 2 }, // 3: 2
      {
        kind: "zip",
        type: numberType,
        a: 2,
        b: 3,
        fn: { kind: "opcode", opcode: OpCode.Mul },
      }, // 4: 60
    ];

    expect(evalSig(4, env, nodes)).toBe(60);
  });

  it("evaluates abs(sin(t)) correctly", () => {
    const env = createTestEnv({ tAbsMs: (Math.PI * 3) / 2 }); // sin(3π/2) = -1

    // DAG: abs(sin(t))
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType }, // 0: t
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Sin },
      }, // 1: sin(t)
      {
        kind: "map",
        type: numberType,
        src: 1,
        fn: { kind: "opcode", opcode: OpCode.Abs },
      }, // 2: abs(sin(t))
    ];

    expect(evalSig(2, env, nodes)).toBeCloseTo(1, 5);
  });
});

// =============================================================================
// Shared Subexpression Tests
// =============================================================================

describe("evalSig - shared subexpressions", () => {
  it("evaluates shared nodes once per frame", () => {
    const cache = createSigFrameCache(10);
    const constPool = createConstPool([10, 20]);
    const env = createTestEnv({ constPool, cache });

    // DAG: (a + b) + (a + b)
    // Node 2 (a+b) is shared
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: a=10
      { kind: "const", type: numberType, constId: 1 }, // 1: b=20
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: OpCode.Add },
      }, // 2: a+b=30
      {
        kind: "zip",
        type: numberType,
        a: 2,
        b: 2,
        fn: { kind: "opcode", opcode: OpCode.Add },
      }, // 3: (a+b)+(a+b)=60
    ];

    const result = evalSig(3, env, nodes);
    expect(result).toBe(60);

    // Verify node 2 was cached (evaluated once)
    expect(cache.stamp[2]).toBe(cache.frameId);
    expect(cache.value[2]).toBe(30);
  });

  it("evaluates diamond dependency correctly", () => {
    const cache = createSigFrameCache(10);
    const env = createTestEnv({ tAbsMs: 100, cache });

    // DAG: sin(t) + cos(t), where t is shared
    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: timeType }, // 0: t (shared)
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Sin },
      }, // 1: sin(t)
      {
        kind: "map",
        type: numberType,
        src: 0,
        fn: { kind: "opcode", opcode: OpCode.Cos },
      }, // 2: cos(t)
      {
        kind: "zip",
        type: numberType,
        a: 1,
        b: 2,
        fn: { kind: "opcode", opcode: OpCode.Add },
      }, // 3: sin(t) + cos(t)
    ];

    const result = evalSig(3, env, nodes);

    // Verify result
    const expected = Math.sin(100) + Math.cos(100);
    expect(result).toBeCloseTo(expected, 10);

    // Verify node 0 (t) was cached (evaluated once despite two consumers)
    expect(cache.stamp[0]).toBe(cache.frameId);
    expect(cache.value[0]).toBe(100);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("evalSig - error handling", () => {
  it("throws error for invalid sigId", () => {
    const env = createTestEnv();
    const nodes: SignalExprIR[] = [];

    expect(() => evalSig(99, env, nodes)).toThrow("Invalid sigId");
  });

  it("throws error for unknown node kind", () => {
    const env = createTestEnv();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = [{ kind: "unknownKind", type: numberType }];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expect(() => evalSig(0, env, nodes)).toThrow("Unknown signal node kind");
  });

});

// =============================================================================
// Transform Node Tests (Sprint 4)
// =============================================================================

describe("evalSig - transform nodes", () => {
  describe("empty chain", () => {
    it("returns source unchanged", () => {
      const chain: TransformChainIR = {
        steps: [],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 42
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [42],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(42);
    });
  });

  describe("scaleBias step", () => {
    it("applies scale and bias", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "scaleBias", scale: 2, bias: 10 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] },
      });

      // 5 * 2 + 10 = 20
      expect(evalSig(1, env, nodes)).toBe(20);
    });

    it("applies scale only (bias = 0)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "scaleBias", scale: 3, bias: 0 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [10],
        transformTable: { chains: [chain] },
      });

      // 10 * 3 + 0 = 30
      expect(evalSig(1, env, nodes)).toBe(30);
    });

    it("applies bias only (scale = 1)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "scaleBias", scale: 1, bias: 5 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [10],
        transformTable: { chains: [chain] },
      });

      // 10 * 1 + 5 = 15
      expect(evalSig(1, env, nodes)).toBe(15);
    });

    it("applies negative scale", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "scaleBias", scale: -1, bias: 0 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 10
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [10],
        transformTable: { chains: [chain] },
      });

      // 10 * -1 + 0 = -10
      expect(evalSig(1, env, nodes)).toBe(-10);
    });
  });

  describe("normalize step", () => {
    it("clamps to 0..1 (value above)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "normalize", mode: "0..1" }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 1.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [1.5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(1);
    });

    it("clamps to 0..1 (value below)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "normalize", mode: "0..1" }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // -0.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [-0.5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(0);
    });

    it("passes through value in 0..1 range", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "normalize", mode: "0..1" }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(0.5);
    });

    it("clamps to -1..1 (value above)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "normalize", mode: "-1..1" }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 2
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [2],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(1);
    });

    it("clamps to -1..1 (value below)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "normalize", mode: "-1..1" }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // -2
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [-2],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(-1);
    });

    it("passes through value in -1..1 range", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "normalize", mode: "-1..1" }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(0.5);
    });
  });

  describe("quantize step", () => {
    it("rounds to nearest step", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "quantize", step: 0.25 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.3
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.3],
        transformTable: { chains: [chain] },
      });

      // 0.3 rounds to 0.25
      expect(evalSig(1, env, nodes)).toBeCloseTo(0.25, 5);
    });

    it("rounds up to nearest step", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "quantize", step: 0.25 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.4
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.4],
        transformTable: { chains: [chain] },
      });

      // 0.4 rounds to 0.5
      expect(evalSig(1, env, nodes)).toBeCloseTo(0.5, 5);
    });

    it("quantizes to integer step", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "quantize", step: 5 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 7
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [7],
        transformTable: { chains: [chain] },
      });

      // 7 rounds to 5
      expect(evalSig(1, env, nodes)).toBe(5);
    });
  });

  describe("ease step", () => {
    it("applies linear curve (id 0)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "ease", curveId: 0 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
      });

      // linear(0.5) = 0.5
      expect(evalSig(1, env, nodes)).toBe(0.5);
    });

    it("applies easeInQuad curve (id 1)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "ease", curveId: 1 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
      });

      // easeInQuad(0.5) = 0.5^2 = 0.25
      expect(evalSig(1, env, nodes)).toBe(0.25);
    });

    it("applies smoothstep curve (id 6)", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "ease", curveId: 6 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 0.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
      });

      // smoothstep(0.5) = 0.5^2 * (3 - 2*0.5) = 0.25 * 2 = 0.5
      expect(evalSig(1, env, nodes)).toBe(0.5);
    });

    it("clamps input to [0,1] before applying curve", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "ease", curveId: 1 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 1.5 (out of range)
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [1.5],
        transformTable: { chains: [chain] },
      });

      // easeInQuad(clamp(1.5, 0, 1)) = easeInQuad(1) = 1
      expect(evalSig(1, env, nodes)).toBe(1);
    });

    it("throws error for invalid curve ID", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "ease", curveId: 999 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
      });

      expect(() => evalSig(1, env, nodes)).toThrow("Invalid easing curve ID");
    });
  });

  describe("map step", () => {
    it("applies abs function", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "map", fn: { kind: "opcode", opcode: OpCode.Abs } }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // -5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [-5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(5);
    });

    it("applies sin function", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "map", fn: { kind: "opcode", opcode: OpCode.Sin } }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // Math.PI / 2
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [Math.PI / 2],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBeCloseTo(1, 5);
    });
  });

  describe("chained steps", () => {
    it("applies steps in order (scaleBias + scaleBias)", () => {
      const chain: TransformChainIR = {
        steps: [
          { kind: "scaleBias", scale: 2, bias: 0 },  // 5 * 2 = 10
          { kind: "scaleBias", scale: 1, bias: 5 },  // 10 + 5 = 15
        ],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(15);
    });

    it("applies steps in order (scaleBias + normalize)", () => {
      const chain: TransformChainIR = {
        steps: [
          { kind: "scaleBias", scale: 2, bias: 0 },  // 1.5 * 2 = 3
          { kind: "normalize", mode: "0..1" },       // clamp(3, 0, 1) = 1
        ],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 1.5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [1.5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBe(1);
    });

    it("applies complex chain (scaleBias + quantize + ease)", () => {
      const chain: TransformChainIR = {
        steps: [
          { kind: "scaleBias", scale: 0.1, bias: 0 },  // 5 * 0.1 = 0.5
          { kind: "quantize", step: 0.25 },            // round(0.5 / 0.25) * 0.25 = 0.5
          { kind: "ease", curveId: 1 },                // easeInQuad(0.5) = 0.25
        ],
        fromType: numberType,
        toType: numberType,
        cost: "normal",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 }, // 5
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] },
      });

      expect(evalSig(1, env, nodes)).toBeCloseTo(0.25, 5);
    });
  });


  describe("caching", () => {
    it("caches transform result", () => {
      const cache = createSigFrameCache(10);
      const chain: TransformChainIR = {
        steps: [{ kind: "scaleBias", scale: 2, bias: 10 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [5],
        cache,
        transformTable: { chains: [chain] },
      });

      evalSig(1, env, nodes);
      expect(cache.stamp[1]).toBe(cache.frameId);
      expect(cache.value[1]).toBe(20);
    });
  });

  describe("error handling", () => {
    it("throws error for invalid chain ID", () => {
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "transform", type: numberType, src: 0, chain: 999 },
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [] },
      });

      expect(() => evalSig(1, env, nodes)).toThrow("Invalid transform chain ID");
    });
  });

  describe("debug tracing", () => {
    it("calls debug sink when enabled", () => {
      const traceInfo: TransformTraceInfo[] = [];
      const debug: DebugSink = {
        traceTransform: (info) => traceInfo.push(info),
      };

      const chain: TransformChainIR = {
        steps: [
          { kind: "scaleBias", scale: 2, bias: 0 },
          { kind: "scaleBias", scale: 1, bias: 5 },
        ],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] },
        debug,
      });

      evalSig(1, env, nodes);

      expect(traceInfo).toHaveLength(1);
      expect(traceInfo[0].srcValue).toBe(5);
      expect(traceInfo[0].chainId).toBe(0);
      expect(traceInfo[0].finalValue).toBe(15);
      expect(traceInfo[0].steps).toHaveLength(2);
      expect(traceInfo[0].steps[0].kind).toBe("scaleBias");
      expect(traceInfo[0].steps[0].inputValue).toBe(5);
      expect(traceInfo[0].steps[0].outputValue).toBe(10);
      expect(traceInfo[0].steps[1].kind).toBe("scaleBias");
      expect(traceInfo[0].steps[1].inputValue).toBe(10);
      expect(traceInfo[0].steps[1].outputValue).toBe(15);
    });

    it("does not call debug sink when disabled", () => {
      const chain: TransformChainIR = {
        steps: [{ kind: "scaleBias", scale: 2, bias: 0 }],
        fromType: numberType,
        toType: numberType,
        cost: "cheap",
      };
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { kind: "transform", type: numberType, src: 0, chain: 0 },
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] },
      });

      // Should not throw
      expect(() => evalSig(1, env, nodes)).not.toThrow();
    });
  });
});
