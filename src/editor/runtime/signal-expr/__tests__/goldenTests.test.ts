/**
 * Golden Tests - Verify IR Output Matches Closure Output
 *
 * These tests ensure that migrated blocks produce identical results
 * whether compiled to IR or closures.
 *
 * Test methodology:
 * 1. Compile block using closure compiler (legacy)
 * 2. Compile same block using IR compiler (new)
 * 3. Evaluate both at multiple time points
 * 4. Assert outputs match within tolerance
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-07-blockCompilerMigration.md §P1 "Golden Test Framework"
 */

import { describe, it } from "vitest";
import { createSigFrameCache, newFrame } from "../SigFrameCache";
import { createSigEnv } from "../SigEnv";
import { evalSig } from "../SigEvaluator";
import type { SignalExprIR } from "../../../compiler/ir/signalExpr";
import type { RuntimeCtx } from "../../../compiler/types";
import type { ConstPool } from "../SignalExprBuilder";

/**
 * Golden test specification.
 */
export interface GoldenTest {
  /** Test name/description */
  name: string;

  /** Time points to test (milliseconds) */
  timePoints: number[];

  /** IR nodes to evaluate */
  nodes: SignalExprIR[];

  /** Const pool for IR */
  constPool: ConstPool;

  /** Root node ID (which node to evaluate) */
  rootId: number;

  /** Legacy closure for comparison */
  closure: (t: number, ctx: RuntimeCtx) => number;

  /** Tolerance for floating-point comparison (default: 1e-10) */
  tolerance?: number;
}

/**
 * Run a single golden test.
 * Returns failures if IR output doesn't match closure output.
 */
export function runGoldenTest(test: GoldenTest): {
  passed: boolean;
  failures: { time: number; closure: number; ir: number; diff: number }[];
} {
  const tolerance = test.tolerance ?? 1e-10;
  const failures: { time: number; closure: number; ir: number; diff: number }[] = [];

  // Create frame cache (reuse across frames for efficiency)
  const cache = createSigFrameCache(test.nodes.length);

  // Create mock RuntimeCtx
  const ctx: RuntimeCtx = {
    viewport: { w: 1920, h: 1080, dpr: 1 },
  };

  for (const t of test.timePoints) {
    // Evaluate closure
    const closureValue = test.closure(t, ctx);

    // Evaluate IR (new frame for each time point)
    newFrame(cache, cache.frameId + 1);
    const env = createSigEnv({
      tAbsMs: t,
      constPool: test.constPool,
      cache,
    });
    const irValue = evalSig(test.rootId, env, test.nodes);

    // Compare
    const diff = Math.abs(closureValue - irValue);
    if (diff > tolerance) {
      failures.push({
        time: t,
        closure: closureValue,
        ir: irValue,
        diff,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Helper to create standard test time points.
 */
export function standardTimePoints(): number[] {
  return [0, 100, 250, 500, 750, 1000, 2000, 5000];
}

/**
 * Assert that a golden test passes.
 * Throws with detailed failure info if test fails.
 */
export function assertGoldenTestPasses(test: GoldenTest): void {
  const result = runGoldenTest(test);

  if (!result.passed) {
    const failureDetails = result.failures
      .map(
        (f) =>
          `  t=${f.time}ms: closure=${f.closure}, ir=${f.ir}, diff=${f.diff}`
      )
      .join("\n");

    throw new Error(
      `Golden test "${test.name}" failed:\n${failureDetails}\n` +
        `(${result.failures.length} time points failed out of ${test.timePoints.length})`
    );
  }
}

// =============================================================================
// Example Tests (to be expanded as blocks are migrated)
// =============================================================================

describe("Golden Tests - Block Migration Validation", () => {
  describe("example: constant signal", () => {
    it("matches closure output", () => {
      const test: GoldenTest = {
        name: "constant 42",
        timePoints: standardTimePoints(),
        nodes: [
          {
            kind: "const",
            type: { world: "signal", domain: "float", category: "core", busEligible: true },
            constId: 0,
          },
        ],
        constPool: { numbers: [42] },
        rootId: 0,
        closure: () => 42,
      };

      assertGoldenTestPasses(test);
    });
  });

  describe("example: timeAbsMs signal", () => {
    it("matches closure output", () => {
      const test: GoldenTest = {
        name: "timeAbsMs",
        timePoints: standardTimePoints(),
        nodes: [
          {
            kind: "timeAbsMs",
            type: { world: "signal", domain: "timeMs", category: "internal", busEligible: false },
          },
        ],
        constPool: { numbers: [] },
        rootId: 0,
        closure: (t) => t,
      };

      assertGoldenTestPasses(test);
    });
  });

  // Additional tests will be added as blocks are migrated in Sprint 7
  // See SPRINT-07 plan for:
  // - AddSignal tests
  // - SubSignal tests
  // - MulSignal tests
  // - DivSignal tests
  // - MinSignal tests
  // - MaxSignal tests
  // - ClampSignal tests
  // - Oscillator tests (sine waveform)
});
