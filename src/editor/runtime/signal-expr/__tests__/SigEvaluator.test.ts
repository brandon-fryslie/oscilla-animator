/**
 * Signal Evaluator Test Suite
 *
 * Comprehensive tests for the SignalExpr evaluator.
 * Covers: cache behavior, node evaluation, DAG composition, shared subexpressions,
 * conditional evaluation (select), external inputs (inputSlot).
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P1 "Create Test Suite"
 * - .agent_planning/signalexpr-runtime/DOD-20251225-190000.md §P1 "Create Test Suite for Core Evaluator"
 * - .agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md §P1 "Test Suite for Select and InputSlot"
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
import { OpCode } from "../../../compiler/ir/opcodes";
import type { TypeDesc } from "../../../compiler/ir/types";

// Test helpers

const numberType: TypeDesc = { world: "signal", domain: "number" };
const timeType: TypeDesc = { world: "signal", domain: "timeMs" };

function createTestEnv(params?: {
  tAbsMs?: number;
  constPool?: ConstPool;
  cache?: SigFrameCache;
}): SigEnv {
  return createSigEnv({
    tAbsMs: params?.tAbsMs ?? 0,
    constPool: params?.constPool ?? createConstPool([]),
    cache: params?.cache ?? createSigFrameCache(1024),
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
    const env = createSigEnv({ tAbsMs: 1000, constPool, cache, slotValues: slots });

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

  it("throws error for unsupported node kind (future sprint)", () => {
    const env = createTestEnv();
    const nodes: SignalExprIR[] = [
      { kind: "stateful", type: numberType, op: "integrate", stateId: "s0" },
    ];

    expect(() => evalSig(0, env, nodes)).toThrow("not yet implemented");
  });
});
