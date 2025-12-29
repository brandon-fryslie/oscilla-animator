/**
 * Closure Bridge Test Suite (Sprint 6)
 *
 * Tests for TEMPORARY closure bridge infrastructure during migration period.
 * Will be REMOVED once all blocks are migrated to IR (Sprint 7+).
 *
 * Coverage:
 * - Closure registration and retrieval
 * - Missing closure error handling
 * - Closure called with correct time and context
 * - Closure result returned correctly
 * - Closure result cached properly
 * - Closure bridge works in DAG with other IR nodes
 * - Migration status tracking
 * - Debug tracing
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md
 */

import { describe, it, expect } from "vitest";
import { evalSig } from "../SigEvaluator";
import { createSigFrameCache, newFrame } from "../SigFrameCache";
import { createSigEnv, createConstPool, type SigEnv } from "../SigEnv";
import { createClosureRegistry, type ClosureRegistry } from "../ClosureRegistry";
import { createLegacyContext, type LegacyClosure, type LegacyContext } from "../LegacyClosure";
import { createRuntimeCtx } from "../RuntimeCtx";
import {
  isMigrated,
  getMigrationStatus,
  MIGRATED_BLOCKS,
} from "../MigrationTracking";
import type { SignalExprIR } from "../../../compiler/ir/signalExpr";
import type { DebugSink, ClosureBridgeTraceInfo } from "../DebugSink";
import type { TypeDesc } from "../../../compiler/ir/types";

// Test helpers

const numberType: TypeDesc = { world: "signal", domain: "number" };

interface CreateTestEnvOptions {
  tAbsMs?: number;
  consts?: number[];
  closureRegistry?: ClosureRegistry;
  debug?: DebugSink;
}

function createTestEnv(params?: CreateTestEnvOptions): SigEnv {
  const constPool = createConstPool(params?.consts ?? []);
  const cache = createSigFrameCache(1024);
  return createSigEnv({
    tAbsMs: params?.tAbsMs ?? 0,
    constPool,
    cache,
    closureRegistry: params?.closureRegistry ?? createClosureRegistry(),
    runtimeCtx: createRuntimeCtx(1 / 60, 0),
    debug: params?.debug,
  });
}

// =============================================================================
// Closure Registry Tests
// =============================================================================

describe("ClosureRegistry", () => {
  it("creates empty registry", () => {
    const registry = createClosureRegistry();
    expect(registry.size()).toBe(0);
  });

  it("registers and retrieves closure", () => {
    const registry = createClosureRegistry();
    const testClosure: LegacyClosure = (_t, _ctx) => _t * 2;

    registry.register("test", testClosure);

    expect(registry.size()).toBe(1);
    expect(registry.has("test")).toBe(true);
    expect(registry.get("test")).toBe(testClosure);
  });

  it("returns undefined for missing closure", () => {
    const registry = createClosureRegistry();
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.has("missing")).toBe(false);
  });

  it("clears all closures", () => {
    const registry = createClosureRegistry();
    registry.register("test1", (_t, _ctx) => _t);
    registry.register("test2", (_t, _ctx) => _t * 2);

    expect(registry.size()).toBe(2);

    registry.clear();

    expect(registry.size()).toBe(0);
    expect(registry.has("test1")).toBe(false);
    expect(registry.has("test2")).toBe(false);
  });

  it("overwrites existing closure", () => {
    const registry = createClosureRegistry();
    const closure1: LegacyClosure = (_t, _ctx) => 1;
    const closure2: LegacyClosure = (_t, _ctx) => 2;

    registry.register("test", closure1);
    registry.register("test", closure2);

    expect(registry.size()).toBe(1);
    expect(registry.get("test")).toBe(closure2);
  });
});

// =============================================================================
// Legacy Closure Context Tests
// =============================================================================

describe("LegacyContext", () => {
  it("creates context from SigEnv", () => {
    const runtimeCtx = createRuntimeCtx(0.016, 42);
    const env = createSigEnv({
      tAbsMs: 1000,
      constPool: createConstPool([]),
      cache: createSigFrameCache(10),
      runtimeCtx,
    });

    const ctx = createLegacyContext(env);

    expect(ctx.deltaSec).toBe(0.016);
    expect(ctx.deltaMs).toBe(16);
    expect(ctx.frameIndex).toBe(42);
  });
});

// =============================================================================
// ClosureBridge Node Evaluation Tests
// =============================================================================

describe("closureBridge nodes", () => {
  it("calls registered closure", () => {
    const registry = createClosureRegistry();
    registry.register("testClosure", (_t, _ctx) => _t * 2);

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "testClosure",
        inputSlots: [],
      },
    ];

    const env = createTestEnv({
      tAbsMs: 100,
      closureRegistry: registry,
    });

    expect(evalSig(0, env, nodes)).toBe(200);
  });

  it("throws on missing closure", () => {
    const registry = createClosureRegistry();
    // No closure registered

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "missing",
        inputSlots: [],
      },
    ];

    const env = createTestEnv({ closureRegistry: registry });

    expect(() => evalSig(0, env, nodes)).toThrow(
      "Missing closure: missing"
    );
  });

  it("caches closure result", () => {
    let callCount = 0;
    const registry = createClosureRegistry();
    registry.register("countingClosure", (_t, _ctx) => {
      callCount++;
      return 42;
    });

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "countingClosure",
        inputSlots: [],
      },
    ];

    const env = createTestEnv({ closureRegistry: registry });

    evalSig(0, env, nodes);
    evalSig(0, env, nodes); // Second call same frame

    expect(callCount).toBe(1); // Only called once (cached)
  });

  it("re-evaluates on new frame", () => {
    let callCount = 0;
    const registry = createClosureRegistry();
    registry.register("countingClosure", (_t, _ctx) => {
      callCount++;
      return 42;
    });

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "countingClosure",
        inputSlots: [],
      },
    ];

    const cache = createSigFrameCache(1024);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      closureRegistry: registry,
    });

    evalSig(0, env, nodes); // Frame 1
    newFrame(cache, 2);
    evalSig(0, env, nodes); // Frame 2

    expect(callCount).toBe(2); // Called on each frame
  });

  it("passes correct time to closure", () => {
    let capturedTime = 0;
    const registry = createClosureRegistry();
    registry.register("captureClosure", (_t, _ctx) => {
      capturedTime = _t;
      return 0;
    });

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "captureClosure",
        inputSlots: [],
      },
    ];

    const env = createTestEnv({
      tAbsMs: 5000,
      closureRegistry: registry,
    });

    evalSig(0, env, nodes);

    expect(capturedTime).toBe(5000);
  });

  it("passes correct context to closure", () => {
    let capturedCtx: LegacyContext | null = null;
    const registry = createClosureRegistry();
    registry.register("captureClosure", (_t, _ctx) => {
      capturedCtx = _ctx;
      return 0;
    });

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "captureClosure",
        inputSlots: [],
      },
    ];

    const runtimeCtx = createRuntimeCtx(0.016, 42);
    const cache = createSigFrameCache(1024);
    const env = createSigEnv({
      tAbsMs: 1000,
      constPool: createConstPool([]),
      cache,
      closureRegistry: registry,
      runtimeCtx,
    });

    evalSig(0, env, nodes);

    expect(capturedCtx).not.toBeNull();
    // Use non-null assertion after checking not null
    expect(capturedCtx!.deltaSec).toBe(0.016);
    expect(capturedCtx!.deltaMs).toBe(16);
    expect(capturedCtx!.frameIndex).toBe(42);
  });

  it("works in DAG with IR nodes", () => {
    const registry = createClosureRegistry();
    registry.register("halfTime", (_t, _ctx) => _t / 2);

    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: numberType }, // 0: time (100)
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "halfTime",
        inputSlots: [],
      }, // 1: closure (50)
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: 100 },
      }, // 2: 100 + 50 = 150
    ];

    const env = createTestEnv({
      tAbsMs: 100,
      closureRegistry: registry,
    });

    // timeAbsMs (100) + halfTime (50) = 150
    expect(evalSig(2, env, nodes)).toBe(150);
  });

  it("evaluates input slots for cache correctness", () => {
    const registry = createClosureRegistry();
    registry.register("simpleClosure", (_t, _ctx) => 42);

    // Input slots are evaluated for cache correctness
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: dummy input
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "simpleClosure",
        inputSlots: [0], // Reference const node (should be evaluated)
      },
    ];

    const cache = createSigFrameCache(1024);
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([99]),
      cache,
      closureRegistry: registry,
    });

    evalSig(1, env, nodes);

    // Const node should have been evaluated (cache populated)
    expect(cache.stamp[0]).toBe(cache.frameId);
    expect(cache.value[0]).toBe(99);
  });
});

// =============================================================================
// Debug Tracing Tests
// =============================================================================

describe("closureBridge debug tracing", () => {
  it("traces closure call when debug sink provided", () => {
    const registry = createClosureRegistry();
    registry.register("testClosure", (_t, _ctx) => _t * 2);

    const traces: ClosureBridgeTraceInfo[] = [];
    const debug: DebugSink = {
      traceClosureBridge: (info) => traces.push(info),
    };

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "testClosure",
        inputSlots: [],
      },
    ];

    const env = createTestEnv({
      tAbsMs: 1000,
      closureRegistry: registry,
      debug,
    });

    evalSig(0, env, nodes);

    expect(traces.length).toBe(1);
    expect(traces[0].closureId).toBe("testClosure");
    expect(traces[0].tAbsMs).toBe(1000);
    expect(traces[0].result).toBe(2000);
    expect(traces[0].executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("no tracing when debug sink not provided", () => {
    const registry = createClosureRegistry();
    registry.register("testClosure", (_t, _ctx) => 42);

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "testClosure",
        inputSlots: [],
      },
    ];

    const env = createTestEnv({
      closureRegistry: registry,
      // No debug sink
    });

    // Should not throw or cause errors
    expect(evalSig(0, env, nodes)).toBe(42);
  });
});

// =============================================================================
// Migration Tracking Tests
// =============================================================================

describe("migration tracking", () => {
  it("tracks migration status", () => {
    const status = getMigrationStatus();

    expect(status.total).toBeGreaterThan(0);
    expect(status.percentage).toBeGreaterThanOrEqual(0);
    expect(status.percentage).toBeLessThanOrEqual(100);
    expect(status.migrated).toBeInstanceOf(Array);
    expect(status.pending).toBeInstanceOf(Array);
    expect(status.migrated.length + status.pending.length).toBe(status.total);
  });

  it("isMigrated returns true for migrated blocks (Phase 4 complete)", () => {
    // Phase 4 complete: all major blocks are now migrated
    expect(isMigrated("AddSignal")).toBe(true);
    expect(isMigrated("Oscillator")).toBe(true);
    expect(isMigrated("CycleTimeRoot")).toBe(true);
    expect(isMigrated("RenderInstances2D")).toBe(true);
  });

  it("isMigrated returns false for unknown blocks", () => {
    // Unknown blocks are not in the migrated set
    expect(isMigrated("UnknownBlock")).toBe(false);
    expect(isMigrated("FakeBlock")).toBe(false);
  });

  it("isMigrated can be dynamically updated", () => {
    // Add a test block temporarily
    MIGRATED_BLOCKS.add("TestBlock");

    expect(isMigrated("TestBlock")).toBe(true);

    // Clean up
    MIGRATED_BLOCKS.delete("TestBlock");

    expect(isMigrated("TestBlock")).toBe(false);
  });

  it("calculates correct percentage", () => {
    const status = getMigrationStatus();

    const expectedPercentage =
      status.total > 0 ? (status.migrated.length / status.total) * 100 : 0;

    expect(status.percentage).toBeCloseTo(expectedPercentage, 2);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("closureBridge integration", () => {
  it("multiple closures in same DAG", () => {
    const registry = createClosureRegistry();
    registry.register("double", (_t, _ctx) => _t * 2);
    registry.register("triple", (_t, _ctx) => _t * 3);

    const nodes: SignalExprIR[] = [
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "double",
        inputSlots: [],
      }, // 0: 200
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "triple",
        inputSlots: [],
      }, // 1: 300
      {
        kind: "zip",
        type: numberType,
        a: 0,
        b: 1,
        fn: { kind: "opcode", opcode: 100 },
      }, // 2: 200 + 300 = 500
    ];

    const env = createTestEnv({
      tAbsMs: 100,
      closureRegistry: registry,
    });

    expect(evalSig(2, env, nodes)).toBe(500);
  });

  it("closure used in conditional", () => {
    const registry = createClosureRegistry();
    registry.register("positive", (_t, _ctx) => 100);
    registry.register("negative", (_t, _ctx) => -100);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0: condition (1.0 = true)
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "positive",
        inputSlots: [],
      }, // 1: true branch
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "negative",
        inputSlots: [],
      }, // 2: false branch
      {
        kind: "select",
        type: numberType,
        cond: 0,
        t: 1,
        f: 2,
      }, // 3: select based on condition
    ];

    const env = createTestEnv({
      consts: [1.0],
      closureRegistry: registry,
    });

    expect(evalSig(3, env, nodes)).toBe(100);
  });

  it("complex DAG with closures and IR operations", () => {
    const registry = createClosureRegistry();
    // Legacy oscillator: sin(t * 0.001 * 2π)
    registry.register("legacyOsc", (_t, _ctx) =>
      Math.sin(_t * 0.001 * Math.PI * 2)
    );

    const nodes: SignalExprIR[] = [
      { kind: "timeAbsMs", type: numberType }, // 0: time
      { kind: "const", type: numberType, constId: 0 }, // 1: 0.5
      {
        kind: "closureBridge",
        type: numberType,
        closureId: "legacyOsc",
        inputSlots: [],
      }, // 2: osc output (-1..1)
      {
        kind: "zip",
        type: numberType,
        a: 2,
        b: 1,
        fn: { kind: "opcode", opcode: 100 },
      }, // 3: osc + 0.5
    ];

    const env = createTestEnv({
      tAbsMs: 0, // sin(0) = 0
      consts: [0.5],
      closureRegistry: registry,
    });

    // sin(0) = 0, 0 + 0.5 = 0.5
    expect(evalSig(3, env, nodes)).toBeCloseTo(0.5, 5);
  });
});
