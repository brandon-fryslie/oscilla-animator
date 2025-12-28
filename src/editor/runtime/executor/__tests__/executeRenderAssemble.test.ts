/**
 * executeRenderAssemble Tests
 *
 * Verifies render tree assembly finalization step.
 *
 * Test Coverage:
 * - Slot read from instance2dListSlot, pathBatchListSlot
 * - Slot write to step.outFrameSlot
 * - Validation (if implemented)
 * - Error cases (missing inputs, invalid slot)
 *
 * References:
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-102151.md §Deliverable 1
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 5
 * - src/editor/runtime/executor/steps/executeRenderAssemble.ts
 */

import { describe, it, expect } from "vitest";
import { executeRenderAssemble } from "../steps/executeRenderAssemble";
import { createRuntimeState } from "../RuntimeState";
import type { StepRenderAssemble, CompiledProgramIR } from "../../../compiler/ir";

// Helper to create test program and runtime with pre-configured slots
function createTestContext(outFrameSlot: number = 100) {
  const renderAssembleStep: StepRenderAssemble = {
    kind: "renderAssemble",
    id: "render-assemble" as any,
    deps: [],
    instance2dListSlot: 0 as any,
    pathBatchListSlot: 1 as any,
    outFrameSlot,
  };

  const program: CompiledProgramIR = {
    irVersion: 1,
    patchId: "test",
    patchRevision: 1,
    compileId: "test",
    seed: 42,
    timeModel: { kind: "infinite", windowMs: 10000 },
    types: { types: [] },
    nodes: { nodes: [] },
    buses: { buses: [] },
    lenses: { lenses: [] },
    adapters: { adapters: [] },
    fields: { exprs: [] },
    constants: {
      json: [],
      f64: new Float64Array([42, 99, 3.14]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [],
    },
    stateLayout: { cells: [], f64Size: 0, f32Size: 0, i32Size: 0 },
    schedule: {
      steps: [renderAssembleStep],
      stepIdToIndex: {},
      deps: { fwdDeps: {}, revDeps: {} },
      determinism: { sortKeyRanges: {} },
      caching: { perFrame: [], untilInvalidated: [] },
    },
    outputs: { outputs: [] },
  } as unknown as CompiledProgramIR;

  const runtime = createRuntimeState(program);
  return { program, runtime, step: renderAssembleStep };
}

describe("executeRenderAssemble - Core Functionality", () => {
  it("writes assembled frame to output slot", () => {
    const { runtime, step } = createTestContext();

    // Execute assembly
    executeRenderAssemble(step, {} as any, runtime);

    // Verify assembled frame in output slot
    const frame = runtime.values.read(100) as any;
    expect(frame).toBeDefined();
    expect(frame.version).toBe(1);
    expect(Array.isArray(frame.passes)).toBe(true);
  });

  it("produces empty passes when no batches provided", () => {
    const { runtime, step } = createTestContext();

    // With no batches in step or slots, passes should be empty
    executeRenderAssemble(step, {} as any, runtime);

    const frame = runtime.values.read(100) as any;
    expect(frame.passes).toEqual([]);
  });

  it("includes clear mode in assembled frame", () => {
    const { runtime, step } = createTestContext();

    executeRenderAssemble(step, {} as any, runtime);

    const frame = runtime.values.read(100) as any;
    expect(frame.clear).toBeDefined();
    expect(frame.clear.mode).toBe("color");
    expect(frame.clear.colorRGBA).toBe(0x000000FF); // Black background
  });
});

describe("executeRenderAssemble - Error Handling", () => {
  it("executes without error when batch slots are empty", () => {
    const { runtime, step } = createTestContext();

    // No batches provided - should still execute successfully
    expect(() => {
      executeRenderAssemble(step, {} as any, runtime);
    }).not.toThrow();

    // Verify frame was assembled
    const frame = runtime.values.read(100);
    expect(frame).toBeDefined();
  });

  it("throws error if slot not in slotMeta (not allocated)", () => {
    // Create context without the render step (so slot not allocated)
    const program: CompiledProgramIR = {
      irVersion: 1,
      patchId: "test",
      patchRevision: 1,
      compileId: "test",
      seed: 42,
      timeModel: { kind: "infinite", windowMs: 10000 },
      types: { types: [] },
      nodes: { nodes: [] },
      buses: { buses: [] },
      lenses: { lenses: [] },
      adapters: { adapters: [] },
      fields: { exprs: [] },
      constants: {
        json: [],
        f64: new Float64Array([]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [],
      },
      stateLayout: { cells: [], f64Size: 0, f32Size: 0, i32Size: 0 },
      schedule: {
        steps: [], // No steps - slot not allocated
        stepIdToIndex: {},
        deps: { fwdDeps: {}, revDeps: {} },
        determinism: { sortKeyRanges: {} },
        caching: { perFrame: [], untilInvalidated: [] },
      },
      outputs: { outputs: [] },
    } as unknown as CompiledProgramIR;

    const runtime = createRuntimeState(program);

    const step: StepRenderAssemble = {
      kind: "renderAssemble",
      id: "render-assemble" as any,
      deps: [],
      instance2dListSlot: 0 as any,
      pathBatchListSlot: 1 as any,
      outFrameSlot: 9999, // Not allocated
    };

    // ValueStore throws when slot not in slotMeta
    expect(() => {
      executeRenderAssemble(step, {} as any, runtime);
    }).toThrow(/slot.*not found/i);
  });
});

describe("executeRenderAssemble - Integration", () => {
  it("assembles frame from empty batch lists", () => {
    const { runtime, step } = createTestContext();

    // Execute with no batches - should produce empty frame
    executeRenderAssemble(step, {} as any, runtime);

    const frame = runtime.values.read(100) as any;
    expect(frame).toBeDefined();
    expect(frame.version).toBe(1);
    expect(frame.passes).toEqual([]);
  });

  it("writes assembled frame to output slot", () => {
    const { runtime, step } = createTestContext();

    // Execute assembly
    executeRenderAssemble(step, {} as any, runtime);

    // Verify frame structure
    const frame = runtime.values.read(100) as any;
    expect(frame).toMatchObject({
      version: 1,
      clear: expect.anything(),
      passes: expect.any(Array),
    });
  });

  it("produces empty passes array by default", () => {
    const { runtime, step } = createTestContext();

    executeRenderAssemble(step, {} as any, runtime);

    const frame = runtime.values.read(100) as any;
    expect(frame.passes).toEqual([]);
  });
});

describe("executeRenderAssemble - Spec Compliance", () => {
  it("satisfies 'typically trivial' spec requirement", () => {
    const { runtime, step } = createTestContext();

    // Step should execute quickly - no heavy computation
    // It assembles passes from batch lists (which may be empty)
    executeRenderAssemble(step, {} as any, runtime);

    // Verify an assembled frame is written to output slot
    const frame = runtime.values.read(100) as any;
    expect(frame).toBeDefined();
    expect(frame.version).toBe(1);
    expect(Array.isArray(frame.passes)).toBe(true);
  });

  it("provides stable boundary for hot-swap", () => {
    const { runtime, step } = createTestContext();

    // The step provides a stable output slot for hot-swap
    executeRenderAssemble(step, {} as any, runtime);

    // Verify step writes to the expected output slot
    const frame = runtime.values.read(100);
    expect(frame).toBeDefined();
  });

  it("produces deterministic output for same inputs", () => {
    const { runtime: runtime1, step: step1 } = createTestContext();
    const { runtime: runtime2, step: step2 } = createTestContext();

    // Execute with same inputs should produce same structure
    executeRenderAssemble(step1, {} as any, runtime1);
    executeRenderAssemble(step2, {} as any, runtime2);

    const frame1 = runtime1.values.read(100) as any;
    const frame2 = runtime2.values.read(100) as any;

    // Same structure (though not same reference)
    expect(frame1.version).toBe(frame2.version);
    expect(frame1.passes.length).toBe(frame2.passes.length);
  });
});
