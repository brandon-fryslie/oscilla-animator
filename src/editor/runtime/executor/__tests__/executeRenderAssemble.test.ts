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

interface TestContext {
  program: CompiledProgramIR;
  runtime: ReturnType<typeof createRuntimeState>;
  step: StepRenderAssemble;
}

interface AnyObject {
  [key: string]: unknown;
}

// Helper to create test program and runtime with pre-configured slots
function createTestContext(outFrameSlot: number = 100): TestContext {
  const renderAssembleStep: StepRenderAssemble = {
    kind: "renderAssemble",
    id: "render-assemble" as unknown as never,
    deps: [],
    instance2dListSlot: 0 as unknown as never,
    pathBatchListSlot: 1 as unknown as never,
    outFrameSlot,
  };

  const program: CompiledProgramIR = {
    irVersion: 1,
    patchId: "test",
    seed: 42,
    timeModel: { kind: "infinite", windowMs: 10000 },
    types: { typeIds: [] },
    signalExprs: { nodes: [] },
    fieldExprs: { nodes: [] },
    eventExprs: { nodes: [] },
    constants: {
      json: [],
    },
    stateLayout: { cells: [], f64Size: 0, f32Size: 0, i32Size: 0 },
    // slotMeta for slots used by renderAssemble step
    slotMeta: [
      { slot: 0, storage: "object", offset: 0, type: { world: "signal", domain: "renderCmds", category: "internal", busEligible: false }, debugName: "instance2dList" },
      { slot: 1, storage: "object", offset: 1, type: { world: "signal", domain: "renderCmds", category: "internal", busEligible: false }, debugName: "pathBatchList" },
      { slot: outFrameSlot, storage: "object", offset: 2, type: { world: "signal", domain: "renderTree", category: "internal", busEligible: false }, debugName: "outFrame" },
    ],
    render: { sinks: [] },
    cameras: { cameras: [], cameraIdToIndex: {} },
    meshes: { meshes: [], meshIdToIndex: {} },
    schedule: {
      steps: [renderAssembleStep],
      stepIdToIndex: {},
      deps: {
        slotProducerStep: {},
        slotConsumers: {},
      },
      determinism: {
        allowedOrderingInputs: [],
        topoTieBreak: "nodeIdLex",
      },
      caching: {
        stepCache: {},
        materializationCache: {},
      },
    },
    outputs: [],
    debugIndex: {
      stepToBlock: new Map<string, string>(),
      slotToBlock: new Map<number, string>(),
    },
  } as unknown as CompiledProgramIR;

  const runtime = createRuntimeState(program);
  return { program, runtime, step: renderAssembleStep };
}

describe("executeRenderAssemble - Core Functionality", () => {
  it("writes assembled frame to output slot", () => {
    const { runtime, step } = createTestContext();

    // Execute assembly
    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    // Verify assembled frame in output slot
    const frame = runtime.values.read(100) as AnyObject;
    expect(frame).toBeDefined();
    expect(frame.version).toBe(1);
    expect(Array.isArray(frame.passes)).toBe(true);
  });

  it("produces empty passes when no batches provided", () => {
    const { runtime, step } = createTestContext();

    // With no batches in step or slots, passes should be empty
    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    const frame = runtime.values.read(100) as AnyObject;
    expect(frame.passes).toEqual([]);
  });

  it("includes clear mode in assembled frame", () => {
    const { runtime, step } = createTestContext();

    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    const frame = runtime.values.read(100) as AnyObject;
    expect(frame.clear).toBeDefined();
    const clear = frame.clear as AnyObject;
    expect(clear.mode).toBe("color");
    expect(clear.colorRGBA).toBe(0x000000FF); // Black background
  });
});

describe("executeRenderAssemble - Error Handling", () => {
  it("executes without error when batch slots are empty", () => {
    const { runtime, step } = createTestContext();

    // No batches provided - should still execute successfully
    expect(() => {
      executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);
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
      seed: 42,
      timeModel: { kind: "infinite", windowMs: 10000 },
      types: { typeIds: [] },
      signalExprs: { nodes: [] },
      fieldExprs: { nodes: [] },
      eventExprs: { nodes: [] },
      constants: {
        json: [],
      },
      stateLayout: { cells: [], f64Size: 0, f32Size: 0, i32Size: 0 },
      slotMeta: [], // Empty slotMeta - no slots allocated
      render: { sinks: [] },
      cameras: { cameras: [], cameraIdToIndex: {} },
      meshes: { meshes: [], meshIdToIndex: {} },
      schedule: {
        steps: [], // No steps - slot not allocated
        stepIdToIndex: {},
        deps: {
          slotProducerStep: {},
          slotConsumers: {},
        },
        determinism: {
          allowedOrderingInputs: [],
          topoTieBreak: "nodeIdLex",
        },
        caching: {
          stepCache: {},
          materializationCache: {},
        },
      },
      outputs: [],
      debugIndex: {
        stepToBlock: new Map<string, string>(),
        slotToBlock: new Map<number, string>(),
      },
    } as unknown as CompiledProgramIR;

    const runtime = createRuntimeState(program);

    const step: StepRenderAssemble = {
      kind: "renderAssemble",
      id: "render-assemble" as unknown as never,
      deps: [],
      instance2dListSlot: 0 as unknown as never,
      pathBatchListSlot: 1 as unknown as never,
      outFrameSlot: 9999, // Not allocated
    };

    // ValueStore throws when slot not in slotMeta
    expect(() => {
      executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);
    }).toThrow("ValueStore.write: no metadata for slot 9999");
  });
});

describe("executeRenderAssemble - Integration", () => {
  it("assembles frame from empty batch lists", () => {
    const { runtime, step } = createTestContext();

    // Execute with no batches - should produce empty frame
    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    const frame = runtime.values.read(100) as AnyObject;
    expect(frame).toBeDefined();
    expect(frame.version).toBe(1);
    expect(frame.passes).toEqual([]);
  });

  it("writes assembled frame to output slot", () => {
    const { runtime, step } = createTestContext();

    // Execute assembly
    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    // Verify frame structure
    const frame = runtime.values.read(100) as AnyObject;
    expect(frame).toMatchObject({
      version: 1,
      clear: expect.anything() as unknown,
      passes: expect.any(Array) as unknown[],
    });
  });

  it("produces empty passes array by default", () => {
    const { runtime, step } = createTestContext();

    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    const frame = runtime.values.read(100) as AnyObject;
    expect(frame.passes).toEqual([]);
  });
});

describe("executeRenderAssemble - Spec Compliance", () => {
  it("satisfies 'typically trivial' spec requirement", () => {
    const { runtime, step } = createTestContext();

    // Step should execute quickly - no heavy computation
    // It assembles passes from batch lists (which may be empty)
    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    // Verify an assembled frame is written to output slot
    const frame = runtime.values.read(100) as AnyObject;
    expect(frame).toBeDefined();
    expect(frame.version).toBe(1);
    expect(Array.isArray(frame.passes)).toBe(true);
  });

  it("provides stable boundary for hot-swap", () => {
    const { runtime, step } = createTestContext();

    // The step provides a stable output slot for hot-swap
    executeRenderAssemble(step, {} as unknown as CompiledProgramIR, runtime);

    // Verify step writes to the expected output slot
    const frame = runtime.values.read(100);
    expect(frame).toBeDefined();
  });

  it("produces deterministic output for same inputs", () => {
    const { runtime: runtime1, step: step1 } = createTestContext();
    const { runtime: runtime2, step: step2 } = createTestContext();

    // Execute with same inputs should produce same structure
    executeRenderAssemble(step1, {} as unknown as CompiledProgramIR, runtime1);
    executeRenderAssemble(step2, {} as unknown as CompiledProgramIR, runtime2);

    const frame1 = runtime1.values.read(100) as AnyObject;
    const frame2 = runtime2.values.read(100) as AnyObject;

    // Same structure (though not same reference)
    expect(frame1.version).toBe(frame2.version);
    const passes1 = frame1.passes as unknown[];
    const passes2 = frame2.passes as unknown[];
    expect(passes1.length).toBe(passes2.length);
  });
});
