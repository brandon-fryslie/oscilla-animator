/**
 * Stateful Signal Operations Test Suite (Sprint 5)
 *
 * Comprehensive tests for stateful signal operations:
 * - StateBuffer creation and reset
 * - RuntimeCtx creation
 * - integrate (Euler integration)
 * - sampleHold (rising edge trigger)
 * - slew (exponential smoothing)
 * - delayMs (time-based delay)
 * - delayFrames (frame-based delay)
 * - slew transform step
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-05-stateful.md
 */

import { describe, it, expect } from "vitest";
import { evalSig } from "../SigEvaluator";
import { createSigFrameCache, newFrame } from "../SigFrameCache";
import { createSigEnv, createConstPool } from "../SigEnv";
import type { SignalExprIR } from "../../../compiler/ir/signalExpr";
import type { TypeDesc } from "../../../compiler/ir/types";
import type { TransformChainIR } from "../../../compiler/ir/transforms";
import {
  createStateBuffer,
  resetStateBuffer,
  createEmptyStateBuffer,
} from "../StateBuffer";
import { createRuntimeCtx, createDefaultRuntimeCtx } from "../RuntimeCtx";

const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };

// =============================================================================
// StateBuffer Tests
// =============================================================================

describe("StateBuffer", () => {
  describe("creation", () => {
    it("creates state buffer with correct array sizes", () => {
      const state = createStateBuffer({ f64Count: 10, f32Count: 5, i32Count: 3 });

      expect(state.f64.length).toBe(10);
      expect(state.f32.length).toBe(5);
      expect(state.i32.length).toBe(3);
    });

    it("initializes all values to zero", () => {
      const state = createStateBuffer({ f64Count: 5, f32Count: 5, i32Count: 5 });

      for (let i = 0; i < 5; i++) {
        expect(state.f64[i]).toBe(0);
        expect(state.f32[i]).toBe(0);
        expect(state.i32[i]).toBe(0);
      }
    });

    it("creates empty state buffer", () => {
      const state = createEmptyStateBuffer();

      expect(state.f64.length).toBe(0);
      expect(state.f32.length).toBe(0);
      expect(state.i32.length).toBe(0);
    });
  });

  describe("reset", () => {
    it("zeros all values", () => {
      const state = createStateBuffer({ f64Count: 3, f32Count: 3, i32Count: 3 });

      // Modify values
      state.f64[0] = 42;
      state.f64[1] = 3.14;
      state.f32[0] = 99;
      state.i32[0] = 100;

      // Reset
      resetStateBuffer(state);

      // All should be zero
      for (let i = 0; i < 3; i++) {
        expect(state.f64[i]).toBe(0);
        expect(state.f32[i]).toBe(0);
        expect(state.i32[i]).toBe(0);
      }
    });

    it("does not resize arrays", () => {
      const state = createStateBuffer({ f64Count: 5, f32Count: 5, i32Count: 5 });
      const f64Ref = state.f64;
      const f32Ref = state.f32;
      const i32Ref = state.i32;

      resetStateBuffer(state);

      // Same array instances
      expect(state.f64).toBe(f64Ref);
      expect(state.f32).toBe(f32Ref);
      expect(state.i32).toBe(i32Ref);

      // Same length
      expect(state.f64.length).toBe(5);
      expect(state.f32.length).toBe(5);
      expect(state.i32.length).toBe(5);
    });
  });
});

// =============================================================================
// RuntimeCtx Tests
// =============================================================================

describe("RuntimeCtx", () => {
  it("creates context with correct fields", () => {
    const ctx = createRuntimeCtx(0.1, 42);

    expect(ctx.deltaSec).toBe(0.1);
    expect(ctx.deltaMs).toBe(100);
    expect(ctx.frameIndex).toBe(42);
  });

  it("computes deltaMs from deltaSec", () => {
    const ctx = createRuntimeCtx(1 / 60, 0);

    expect(ctx.deltaSec).toBeCloseTo(1 / 60, 10);
    expect(ctx.deltaMs).toBeCloseTo(1000 / 60, 10);
  });

  it("creates default context (60fps, frame 0)", () => {
    const ctx = createDefaultRuntimeCtx();

    expect(ctx.deltaSec).toBeCloseTo(1 / 60, 10);
    expect(ctx.deltaMs).toBeCloseTo(1000 / 60, 10);
    expect(ctx.frameIndex).toBe(0);
  });
});

// =============================================================================
// Integrate Operation Tests
// =============================================================================

describe("stateful - integrate", () => {
  it("accumulates input over time", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([1.0]);

    // Frame 1: 0 + 1.0 * 0.1 = 0.1
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 1.0
      {
        kind: "stateful",
        type: numberType,
        op: "integrate",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0 },
      },
    ];

    expect(evalSig(1, env1, nodes)).toBeCloseTo(0.1, 5);
    expect(state.f64[0]).toBeCloseTo(0.1, 5);

    // Frame 2: 0.1 + 1.0 * 0.1 = 0.2
    newFrame(cache, 2);
    const env2 = createSigEnv({
      tAbsMs: 100,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.1, 1),
    });

    expect(evalSig(1, env2, nodes)).toBeCloseTo(0.2, 5);
    expect(state.f64[0]).toBeCloseTo(0.2, 5);
  });

  it("integrates over multiple frames", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([10.0]);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "integrate",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0 },
      },
    ];

    // Integrate 10.0 over 10 frames of 0.1 sec each
    // CRITICAL: Cache starts at frameId=1, so we evaluate first frame with frameId=1,
    // then call newFrame with 2, 3, 4, ..., 10 for subsequent frames
    let result = 0;
    for (let frame = 0; frame < 10; frame++) {
      // Set cache frameId: first iteration uses frameId=1 (initial), then 2, 3, ...
      if (frame > 0) {
        newFrame(cache, frame + 1);
      }
      const env = createSigEnv({
        tAbsMs: frame * 100,
        constPool,
        cache,
        state,
        runtimeCtx: createRuntimeCtx(0.1, frame),
      });
      result = evalSig(1, env, nodes);
    }

    // 10 * 0.1 * 10 = 10.0
    expect(result).toBeCloseTo(10.0, 5);
  });

  it("respects deltaSec for frame-rate independence", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([1.0]);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "integrate",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0 },
      },
    ];

    // 30fps (0.033 sec per frame)
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(1 / 30, 0),
    });

    const result = evalSig(1, env1, nodes);
    expect(result).toBeCloseTo(1 / 30, 5);

    // Reset state
    resetStateBuffer(state);

    // 60fps (0.0166 sec per frame)
    newFrame(cache, 2);
    const env2 = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(1 / 60, 0),
    });

    const result2 = evalSig(1, env2, nodes);
    expect(result2).toBeCloseTo(1 / 60, 5);
  });

  it("defaults to 0 when no input", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });

    const nodes: SignalExprIR[] = [
      {
        kind: "stateful",
        type: numberType,
        op: "integrate",
        stateId: "s0",
        params: { stateOffset: 0 },
      },
    ];

    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    expect(evalSig(0, env, nodes)).toBe(0);
  });
});

// =============================================================================
// SampleHold Operation Tests
// =============================================================================

describe("stateful - sampleHold", () => {
  it("samples input on rising edge", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 2, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([42, 0]); // input, trigger

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // input: 42
      { kind: "const", type: numberType, constId: 1 }, // trigger: 0
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];

    // Frame 1: trigger low (0), no sample
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    expect(evalSig(2, env1, nodes)).toBe(0); // Initial held value

    // Frame 2: trigger high (1.0), sample!
    newFrame(cache, 2);
    const constPool2 = createConstPool([42, 1.0]);
    const nodes2: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 }, // trigger: 1.0
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];
    const env2 = createSigEnv({
      tAbsMs: 16,
      constPool: constPool2,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 1),
    });

    expect(evalSig(2, env2, nodes2)).toBe(42); // Sampled!
  });

  it("holds value after rising edge", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 2, f32Count: 0, i32Count: 0 });

    // Frame 1: trigger low, input 10
    let constPool = createConstPool([10, 0]);
    const nodes1: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];
    let env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });
    evalSig(2, env, nodes1);

    // Frame 2: trigger high, input 100 (sample)
    newFrame(cache, 2);
    constPool = createConstPool([100, 1.0]);
    const nodes2: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];
    env = createSigEnv({
      tAbsMs: 16,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 1),
    });
    expect(evalSig(2, env, nodes2)).toBe(100);

    // Frame 3: trigger still high, input changes to 999 (hold, no new sample)
    newFrame(cache, 3);
    constPool = createConstPool([999, 1.0]);
    const nodes3: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];
    env = createSigEnv({
      tAbsMs: 32,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 2),
    });
    expect(evalSig(2, env, nodes3)).toBe(100); // Still holding 100
  });

  it("ignores falling edge", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 2, f32Count: 0, i32Count: 0 });

    // Pre-load state: held value = 42, last trigger = 1.0
    state.f64[0] = 42;
    state.f64[1] = 1.0;

    // Frame: trigger goes from 1.0 to 0 (falling edge), input = 999
    const constPool = createConstPool([999, 0]);
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];
    const env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    expect(evalSig(2, env, nodes)).toBe(42); // Still holding 42 (no sample on falling edge)
  });

  it("uses 0.5 threshold for trigger", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 2, f32Count: 0, i32Count: 0 });

    // Trigger 0.4 -> 0.6 (crosses 0.5)
    state.f64[1] = 0.4; // last trigger

    const constPool = createConstPool([100, 0.6]);
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      { kind: "const", type: numberType, constId: 1 },
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, trigger: 1 },
      },
    ];
    const env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    expect(evalSig(2, env, nodes)).toBe(100); // Sampled (rising edge)
  });

  it("throws error if no trigger signal", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 2, f32Count: 0, i32Count: 0 });

    const nodes: SignalExprIR[] = [
      {
        kind: "stateful",
        type: numberType,
        op: "sampleHold",
        stateId: "s0",
        params: { stateOffset: 0 }, // No trigger!
      },
    ];
    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([]),
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    expect(() => evalSig(0, env, nodes)).toThrow("requires trigger signal");
  });
});

// =============================================================================
// Slew Operation Tests
// =============================================================================

describe("stateful - slew", () => {
  it("smoothly approaches target", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([100]);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // target: 100
      {
        kind: "stateful",
        type: numberType,
        op: "slew",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, rate: 10 },
      },
    ];

    // Frame 1: start at 0, slew towards 100
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const v1 = evalSig(1, env1, nodes);
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(100);

    // Frame 2: closer to 100
    newFrame(cache, 2);
    const env2 = createSigEnv({
      tAbsMs: 100,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.1, 1),
    });

    const v2 = evalSig(1, env2, nodes);
    expect(v2).toBeGreaterThan(v1);
    expect(v2).toBeLessThan(100);
  });

  it("rate controls approach speed", () => {
    const statefast = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const stateSlow = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([100]);

    // Fast slew (rate=20)
    const nodesFast: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "slew",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, rate: 20 },
      },
    ];

    // Slow slew (rate=5)
    const nodesSlow: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "slew",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, rate: 5 },
      },
    ];

    const envFast = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache: createSigFrameCache(10),
      state: statefast,
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const envSlow = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache: createSigFrameCache(10),
      state: stateSlow,
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const vFast = evalSig(1, envFast, nodesFast);
    const vSlow = evalSig(1, envSlow, nodesSlow);

    // Fast should be closer to 100
    expect(vFast).toBeGreaterThan(vSlow);
  });

  it("defaults rate to 1", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
    const constPool = createConstPool([100]);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "slew",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0 }, // No rate specified
      },
    ];

    const env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const result = evalSig(1, env, nodes);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

// =============================================================================
// Slew Transform Step Tests
// =============================================================================

describe("transform - slew step", () => {
  it("applies slew smoothing", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });

    const chain: TransformChainIR = {
      steps: [{ kind: "slew", stateOffset: 0, rate: 10 }],
      fromType: numberType,
      toType: numberType,
      cost: "normal",
    };

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 100
      { kind: "transform", type: numberType, src: 0, chain: 0 },
    ];

    // Frame 1: slew towards 100
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([100]),
      cache,
      state,
      transformTable: { chains: [chain] },
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const v1 = evalSig(1, env1, nodes);
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(100);

    // Frame 2: closer to 100
    newFrame(cache, 2);
    const env2 = createSigEnv({
      tAbsMs: 100,
      constPool: createConstPool([100]),
      cache,
      state,
      transformTable: { chains: [chain] },
      runtimeCtx: createRuntimeCtx(0.1, 1),
    });

    const v2 = evalSig(1, env2, nodes);
    expect(v2).toBeGreaterThan(v1);
  });

  it("works in transform chain", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });

    const chain: TransformChainIR = {
      steps: [
        { kind: "scaleBias", scale: 2, bias: 0 }, // 50 * 2 = 100
        { kind: "slew", stateOffset: 0, rate: 5 }, // slew towards 100
      ],
      fromType: numberType,
      toType: numberType,
      cost: "normal",
    };

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 50
      { kind: "transform", type: numberType, src: 0, chain: 0 },
    ];

    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([50]),
      cache,
      state,
      transformTable: { chains: [chain] },
      runtimeCtx: createRuntimeCtx(0.1, 0),
    });

    const result = evalSig(1, env, nodes);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

// =============================================================================
// DelayMs Operation Tests
// =============================================================================

describe("stateful - delayMs", () => {
  it("delays signal by milliseconds", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 65, f32Count: 0, i32Count: 1 });
    const constPool = createConstPool([100]);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 100
      {
        kind: "stateful",
        type: numberType,
        op: "delayMs",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, delayMs: 100, bufferSize: 64 },
      },
    ];

    // Frame 1: delay buffer starts at 0
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    expect(evalSig(1, env1, nodes)).toBe(0); // Delayed value (buffer was 0)

    // Run ~7 more frames (100ms / 16ms ≈ 6.25 frames)
    for (let i = 1; i < 8; i++) {
      newFrame(cache, i + 1);
      const env = createSigEnv({
        tAbsMs: i * 16,
        constPool,
        cache,
        state,
        runtimeCtx: createRuntimeCtx(0.016, i),
      });
      evalSig(1, env, nodes);
    }

    // After ~100ms, delayed output should now be 100
    newFrame(cache, 9);
    const env2 = createSigEnv({
      tAbsMs: 128,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 8),
    });

    expect(evalSig(1, env2, nodes)).toBe(100);
  });

  it("uses default delay and buffer size", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 65, f32Count: 0, i32Count: 1 });
    const constPool = createConstPool([42]);

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "delayMs",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0 }, // defaults: delayMs=100, bufferSize=64
      },
    ];

    const env = createSigEnv({
      tAbsMs: 0,
      constPool,
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    // Should not throw
    expect(() => evalSig(1, env, nodes)).not.toThrow();
  });
});

// =============================================================================
// DelayFrames Operation Tests
// =============================================================================

describe("stateful - delayFrames", () => {
  it("delays signal by 1 frame", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 3, f32Count: 0, i32Count: 1 });

    const nodes1: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 100
      {
        kind: "stateful",
        type: numberType,
        op: "delayFrames",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, delayFrames: 1 },
      },
    ];

    // Frame 1: input=100, output=0 (buffer empty)
    const env1 = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([100]),
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    expect(evalSig(1, env1, nodes1)).toBe(0);

    // Frame 2: input=200, output=100 (delayed by 1 frame)
    newFrame(cache, 2);
    const nodes2: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 200
      {
        kind: "stateful",
        type: numberType,
        op: "delayFrames",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, delayFrames: 1 },
      },
    ];
    const env2 = createSigEnv({
      tAbsMs: 16,
      constPool: createConstPool([200]),
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 1),
    });

    expect(evalSig(1, env2, nodes2)).toBe(100); // Previous frame's value
  });

  it("delays signal by 5 frames", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 7, f32Count: 0, i32Count: 1 });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "delayFrames",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0, delayFrames: 5 },
      },
    ];

    // Feed values: frame0=100, frame1=200, ..., frame5=600
    const values = [100, 200, 300, 400, 500, 600];
    for (let i = 0; i < values.length; i++) {
      if (i > 0) {
        newFrame(cache, i + 1);
      }
      const env = createSigEnv({
        tAbsMs: i * 16,
        constPool: createConstPool([values[i]]),
        cache,
        state,
        runtimeCtx: createRuntimeCtx(0.016, i),
      });
      evalSig(1, env, nodes);
    }

    // Frame 6: should output value from frame 1 (200)
    newFrame(cache, 7);
    const env6 = createSigEnv({
      tAbsMs: 96,
      constPool: createConstPool([700]),
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 6),
    });

    expect(evalSig(1, env6, nodes)).toBe(200); // 5 frames ago
  });

  it("uses default delay (1 frame)", () => {
    const cache = createSigFrameCache(10);
    const state = createStateBuffer({ f64Count: 3, f32Count: 0, i32Count: 1 });

    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 },
      {
        kind: "stateful",
        type: numberType,
        op: "delayFrames",
        input: 0,
        stateId: "s0",
        params: { stateOffset: 0 }, // No delayFrames specified
      },
    ];

    const env = createSigEnv({
      tAbsMs: 0,
      constPool: createConstPool([42]),
      cache,
      state,
      runtimeCtx: createRuntimeCtx(0.016, 0),
    });

    // Should not throw
    expect(() => evalSig(1, env, nodes)).not.toThrow();
  });
});

// =============================================================================
// edgeDetectWrap Stateful Operation Tests (Phase 4 - Workstream A)
// =============================================================================

describe("evalSig - edgeDetectWrap stateful operation", () => {
  it("detects wrap when phase drops from high to low", () => {
    const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 0 });
    const cache = createSigFrameCache(10);
    const runtimeCtx = createRuntimeCtx(0.016, 0);
    
    // Simulate phase at 0.95
    const nodes1: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.95
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool1 = createConstPool([0.95]);
    const env1 = createSigEnv({ 
      tAbsMs: 0, 
      constPool: constPool1, 
      cache, 
      state,
      runtimeCtx 
    });
    
    // First frame: no wrap (no previous phase)
    const result1 = evalSig(1, env1, nodes1);
    expect(result1).toBe(0.0); // No wrap on first frame
    expect(state.f64[0]).toBe(0.95); // Stored phase
    
    // Advance to next frame with wrapped phase
    newFrame(cache, cache.frameId + 1);
    const nodes2: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.05 (wrapped!)
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool2 = createConstPool([0.05]);
    const env2 = createSigEnv({ 
      tAbsMs: 16.67, 
      constPool: constPool2, 
      cache, 
      state,
      runtimeCtx 
    });
    
    // Second frame: wrap detected!
    const result2 = evalSig(1, env2, nodes2);
    expect(result2).toBe(1.0); // Wrap detected
    expect(state.f64[0]).toBe(0.05); // Stored new phase
  });

  it("does not fire on continuous phase increase", () => {
    const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 0 });
    const cache = createSigFrameCache(10);
    const runtimeCtx = createRuntimeCtx(0.016, 0);
    
    // Simulate phase at 0.3
    const nodes1: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.3
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool1 = createConstPool([0.3]);
    const env1 = createSigEnv({ 
      tAbsMs: 0, 
      constPool: constPool1, 
      cache, 
      state,
      runtimeCtx 
    });
    
    evalSig(1, env1, nodes1);
    expect(state.f64[0]).toBe(0.3);
    
    // Advance to next frame with normal increase
    newFrame(cache, cache.frameId + 1);
    const nodes2: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.35 (normal increase)
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool2 = createConstPool([0.35]);
    const env2 = createSigEnv({ 
      tAbsMs: 16.67, 
      constPool: constPool2, 
      cache, 
      state,
      runtimeCtx 
    });
    
    // No wrap - continuous increase
    const result2 = evalSig(1, env2, nodes2);
    expect(result2).toBe(0.0);
  });

  it("uses threshold heuristic (prevPhase > 0.8 && phase < 0.2)", () => {
    const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 0 });
    const cache = createSigFrameCache(10);
    const runtimeCtx = createRuntimeCtx(0.016, 0);
    
    // Test boundary: prevPhase = 0.8, phase = 0.2 (should NOT wrap)
    state.f64[0] = 0.8;
    const nodes1: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.2
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool1 = createConstPool([0.2]);
    const env1 = createSigEnv({ 
      tAbsMs: 0, 
      constPool: constPool1, 
      cache, 
      state,
      runtimeCtx 
    });
    
    const result1 = evalSig(1, env1, nodes1);
    expect(result1).toBe(0.0); // Boundary case - no wrap
    
    // Test wrap: prevPhase = 0.81, phase = 0.19 (should wrap)
    newFrame(cache, cache.frameId + 1);
    state.f64[0] = 0.81;
    const nodes2: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.19
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool2 = createConstPool([0.19]);
    const env2 = createSigEnv({ 
      tAbsMs: 16.67, 
      constPool: constPool2, 
      cache, 
      state,
      runtimeCtx 
    });
    
    const result2 = evalSig(1, env2, nodes2);
    expect(result2).toBe(1.0); // Wrap detected
  });

  it("persists state across frames", () => {
    const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 0 });
    const cache = createSigFrameCache(10);
    const runtimeCtx = createRuntimeCtx(0.016, 0);
    
    const phases = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05]; // Wrap at end
    const expectedWrap = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; // Only last frame wraps
    
    for (let i = 0; i < phases.length; i++) {
      if (i > 0) newFrame(cache, cache.frameId + 1);
      
      const nodes: SignalExprIR[] = [
        { kind: "const", type: numberType, constId: 0 },
        { 
          kind: "stateful", 
          type: numberType, 
          op: "edgeDetectWrap",
        stateId: "wrap0", 
          input: 0,
          params: { stateOffset: 0 }
        }
      ];
      const constPool = createConstPool([phases[i]]);
      const env = createSigEnv({ 
        tAbsMs: i * 16.67, 
        constPool, 
        cache, 
        state,
        runtimeCtx 
      });
      
      const result = evalSig(1, env, nodes);
      expect(result).toBe(expectedWrap[i]);
      expect(state.f64[0]).toBe(phases[i]); // State persists
    }
  });

  it("handles first frame correctly (no previous phase)", () => {
    const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 0 });
    const cache = createSigFrameCache(10);
    const runtimeCtx = createRuntimeCtx(0.016, 0);
    
    // First frame with low phase (no wrap possible)
    const nodes: SignalExprIR[] = [
      { kind: "const", type: numberType, constId: 0 }, // 0.05
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const constPool = createConstPool([0.05]);
    const env = createSigEnv({ 
      tAbsMs: 0, 
      constPool, 
      cache, 
      state,
      runtimeCtx 
    });
    
    const result = evalSig(1, env, nodes);
    expect(result).toBe(0.0); // No wrap on first frame (prevPhase = 0)
    expect(state.f64[0]).toBe(0.05);
  });

  it("works with dynamic input (not constant)", () => {
    const state = createStateBuffer({ f64Count: 10, f32Count: 0, i32Count: 0 });
    const cache = createSigFrameCache(10);
    const runtimeCtx = createRuntimeCtx(0.016, 0);
    
    // Frame 1: phase01 node returns 0.95
    const nodes1: SignalExprIR[] = [
      { kind: "phase01", type: numberType }, // Dynamic input
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const env1 = createSigEnv({ 
      tAbsMs: 0, 
      constPool: createConstPool([]), 
      cache, 
      state,
      runtimeCtx,
      phase01: 0.95
    });
    
    evalSig(1, env1, nodes1);
    expect(state.f64[0]).toBe(0.95);
    
    // Frame 2: phase01 node returns 0.05 (wrapped!)
    newFrame(cache, cache.frameId + 1);
    const nodes2: SignalExprIR[] = [
      { kind: "phase01", type: numberType },
      { 
        kind: "stateful", 
        type: numberType, 
        op: "edgeDetectWrap",
        stateId: "wrap0", 
        input: 0,
        params: { stateOffset: 0 }
      }
    ];
    const env2 = createSigEnv({ 
      tAbsMs: 16.67, 
      constPool: createConstPool([]), 
      cache, 
      state,
      runtimeCtx,
      phase01: 0.05
    });
    
    const result2 = evalSig(1, env2, nodes2);
    expect(result2).toBe(1.0); // Wrap detected from phase01 input
  });
});
