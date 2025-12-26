/**
 * Block Migration Golden Tests
 *
 * Validates that IR-compiled blocks produce identical output to closure-compiled blocks.
 * These tests will be expanded as more blocks are migrated in Sprint 7.
 *
 * Test coverage:
 * - AddSignal, SubSignal, MulSignal, DivSignal
 * - MinSignal, MaxSignal
 * - ClampSignal
 * - Oscillator (future)
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-07-blockCompilerMigration.md
 */

import { describe, it } from "vitest";
import { createSignalExprBuilder, opcode } from "../SignalExprBuilder";
import { OpCode } from "../../../compiler/ir/opcodes";
import {
  type GoldenTest,
  assertGoldenTestPasses,
  standardTimePoints,
} from "./goldenTests.test";

// =============================================================================
// Binary Math Blocks
// =============================================================================

describe("AddSignal Migration", () => {
  it("matches closure output for constant inputs", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(10);
    const b = builder.sigConst(20);
    const sum = builder.sigZip(a, b, opcode(OpCode.Add));
    const result = builder.build(sum);

    const test: GoldenTest = {
      name: "AddSignal(10, 20)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 10 + 20,
    };

    assertGoldenTestPasses(test);
  });

  it("matches closure output for time-based inputs", () => {
    const builder = createSignalExprBuilder();
    const t = builder.sigTimeAbsMs();
    const scale = builder.sigConst(0.001);
    const scaled = builder.sigZip(t, scale, opcode(OpCode.Mul));
    const offset = builder.sigConst(100);
    const sum = builder.sigZip(scaled, offset, opcode(OpCode.Add));
    const result = builder.build(sum);

    const test: GoldenTest = {
      name: "AddSignal(t * 0.001, 100)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: (t) => t * 0.001 + 100,
    };

    assertGoldenTestPasses(test);
  });
});

describe("SubSignal Migration", () => {
  it("matches closure output for constant inputs", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(50);
    const b = builder.sigConst(20);
    const diff = builder.sigZip(a, b, opcode(OpCode.Sub));
    const result = builder.build(diff);

    const test: GoldenTest = {
      name: "SubSignal(50, 20)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 50 - 20,
    };

    assertGoldenTestPasses(test);
  });

  it("matches closure output for time-based inputs", () => {
    const builder = createSignalExprBuilder();
    const t = builder.sigTimeAbsMs();
    const offset = builder.sigConst(500);
    const diff = builder.sigZip(t, offset, opcode(OpCode.Sub));
    const result = builder.build(diff);

    const test: GoldenTest = {
      name: "SubSignal(t, 500)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: (t) => t - 500,
    };

    assertGoldenTestPasses(test);
  });
});

describe("MulSignal Migration", () => {
  it("matches closure output for constant inputs", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(5);
    const b = builder.sigConst(7);
    const product = builder.sigZip(a, b, opcode(OpCode.Mul));
    const result = builder.build(product);

    const test: GoldenTest = {
      name: "MulSignal(5, 7)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 5 * 7,
    };

    assertGoldenTestPasses(test);
  });

  it("matches closure output for amplitude modulation", () => {
    const builder = createSignalExprBuilder();
    const t = builder.sigTimeAbsMs();
    const freq = builder.sigConst(0.001);
    const phase = builder.sigZip(t, freq, opcode(OpCode.Mul));
    const twoPi = builder.sigConst(2 * Math.PI);
    const angle = builder.sigZip(phase, twoPi, opcode(OpCode.Mul));
    const sine = builder.sigMap(angle, opcode(OpCode.Sin));
    const amp = builder.sigConst(0.5);
    const scaled = builder.sigZip(sine, amp, opcode(OpCode.Mul));
    const result = builder.build(scaled);

    const test: GoldenTest = {
      name: "MulSignal(sin(t * 0.001 * 2π), 0.5)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: (t) => Math.sin(t * 0.001 * 2 * Math.PI) * 0.5,
      tolerance: 1e-9, // Slightly larger tolerance for trig functions
    };

    assertGoldenTestPasses(test);
  });
});

describe("DivSignal Migration", () => {
  it("matches closure output for constant inputs", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(100);
    const b = builder.sigConst(4);
    const quotient = builder.sigZip(a, b, opcode(OpCode.Div));
    const result = builder.build(quotient);

    const test: GoldenTest = {
      name: "DivSignal(100, 4)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 100 / 4,
    };

    assertGoldenTestPasses(test);
  });

  it("handles division by zero safely", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(42);
    const b = builder.sigConst(0);
    const quotient = builder.sigZip(a, b, opcode(OpCode.Div));
    const result = builder.build(quotient);

    const test: GoldenTest = {
      name: "DivSignal(42, 0) = 0",
      timePoints: [0],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 0, // Safe fallback
    };

    assertGoldenTestPasses(test);
  });
});

// =============================================================================
// Comparison/Selection Blocks
// =============================================================================

describe("MinSignal Migration", () => {
  it("matches closure output for constant inputs", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(10);
    const b = builder.sigConst(20);
    const min = builder.sigZip(a, b, opcode(OpCode.Min));
    const result = builder.build(min);

    const test: GoldenTest = {
      name: "MinSignal(10, 20)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => Math.min(10, 20),
    };

    assertGoldenTestPasses(test);
  });

  it("matches closure output with time-varying signals", () => {
    const builder = createSignalExprBuilder();
    const t = builder.sigTimeAbsMs();
    const threshold = builder.sigConst(500);
    const min = builder.sigZip(t, threshold, opcode(OpCode.Min));
    const result = builder.build(min);

    const test: GoldenTest = {
      name: "MinSignal(t, 500)",
      timePoints: [0, 250, 500, 750, 1000],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: (t) => Math.min(t, 500),
    };

    assertGoldenTestPasses(test);
  });
});

describe("MaxSignal Migration", () => {
  it("matches closure output for constant inputs", () => {
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(10);
    const b = builder.sigConst(20);
    const max = builder.sigZip(a, b, opcode(OpCode.Max));
    const result = builder.build(max);

    const test: GoldenTest = {
      name: "MaxSignal(10, 20)",
      timePoints: standardTimePoints(),
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => Math.max(10, 20),
    };

    assertGoldenTestPasses(test);
  });

  it("matches closure output with time-varying signals", () => {
    const builder = createSignalExprBuilder();
    const t = builder.sigTimeAbsMs();
    const threshold = builder.sigConst(500);
    const max = builder.sigZip(t, threshold, opcode(OpCode.Max));
    const result = builder.build(max);

    const test: GoldenTest = {
      name: "MaxSignal(t, 500)",
      timePoints: [0, 250, 500, 750, 1000],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: (t) => Math.max(t, 500),
    };

    assertGoldenTestPasses(test);
  });
});

// =============================================================================
// Clamp Block (uses params, not inputs)
// =============================================================================

describe("ClampSignal Migration", () => {
  it("matches closure output for basic clamping", () => {
    // Build IR: clamp(value, 0, 1) = min(max(value, 0), 1)
    const builder = createSignalExprBuilder();
    const value = builder.sigConst(1.5);
    const minVal = builder.sigConst(0);
    const maxVal = builder.sigConst(1);

    // max(value, minVal)
    const clamped_lo = builder.sigZip(value, minVal, opcode(OpCode.Max));
    // min(result, maxVal)
    const clamped = builder.sigZip(clamped_lo, maxVal, opcode(OpCode.Min));
    const result = builder.build(clamped);

    const test: GoldenTest = {
      name: "ClampSignal(1.5, 0, 1)",
      timePoints: [0],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => Math.max(0, Math.min(1, 1.5)),
    };

    assertGoldenTestPasses(test);
  });

  it("clamps values below minimum", () => {
    const builder = createSignalExprBuilder();
    const value = builder.sigConst(-0.5);
    const minVal = builder.sigConst(0);
    const maxVal = builder.sigConst(1);

    const clamped_lo = builder.sigZip(value, minVal, opcode(OpCode.Max));
    const clamped = builder.sigZip(clamped_lo, maxVal, opcode(OpCode.Min));
    const result = builder.build(clamped);

    const test: GoldenTest = {
      name: "ClampSignal(-0.5, 0, 1) = 0",
      timePoints: [0],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 0,
    };

    assertGoldenTestPasses(test);
  });

  it("preserves values within range", () => {
    const builder = createSignalExprBuilder();
    const value = builder.sigConst(0.5);
    const minVal = builder.sigConst(0);
    const maxVal = builder.sigConst(1);

    const clamped_lo = builder.sigZip(value, minVal, opcode(OpCode.Max));
    const clamped = builder.sigZip(clamped_lo, maxVal, opcode(OpCode.Min));
    const result = builder.build(clamped);

    const test: GoldenTest = {
      name: "ClampSignal(0.5, 0, 1) = 0.5",
      timePoints: [0],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => 0.5,
    };

    assertGoldenTestPasses(test);
  });
});

// =============================================================================
// Complex Composition Tests
// =============================================================================

describe("Complex Signal Graphs", () => {
  it("handles shared subexpressions correctly", () => {
    // Build: (a + b) * (a + b) where a+b is computed once
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(3);
    const b = builder.sigConst(4);
    const sum = builder.sigZip(a, b, opcode(OpCode.Add)); // Shared
    const squared = builder.sigZip(sum, sum, opcode(OpCode.Mul));
    const result = builder.build(squared);

    const test: GoldenTest = {
      name: "(a + b) * (a + b) with shared subexpression",
      timePoints: [0],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => {
        const sum = 3 + 4;
        return sum * sum;
      },
    };

    assertGoldenTestPasses(test);
  });

  it("handles deep expression trees", () => {
    // Build: ((a + b) * c) - d
    const builder = createSignalExprBuilder();
    const a = builder.sigConst(10);
    const b = builder.sigConst(5);
    const c = builder.sigConst(2);
    const d = builder.sigConst(3);

    const sum = builder.sigZip(a, b, opcode(OpCode.Add));
    const product = builder.sigZip(sum, c, opcode(OpCode.Mul));
    const diff = builder.sigZip(product, d, opcode(OpCode.Sub));
    const result = builder.build(diff);

    const test: GoldenTest = {
      name: "((10 + 5) * 2) - 3",
      timePoints: [0],
      nodes: result.nodes,
      constPool: result.constPool,
      rootId: result.rootId,
      closure: () => ((10 + 5) * 2) - 3,
    };

    assertGoldenTestPasses(test);
  });
});
