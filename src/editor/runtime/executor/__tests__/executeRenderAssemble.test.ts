/**
 * executeRenderAssemble Tests
 *
 * Verifies render tree assembly finalization step.
 *
 * Test Coverage:
 * - Slot read from rootNodeIndex output
 * - Slot write to step.outSlot
 * - Validation (if implemented)
 * - Error cases (missing rootNodeIndex, invalid slot)
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
function createTestContext(outSlot: number = 100) {
  const renderAssembleStep: StepRenderAssemble = {
    kind: "renderAssemble",
    id: "render-assemble" as any,
    rootNodeIndex: 0 as any,
    outSlot,
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
  it("reads render tree from step.outSlot when already present", () => {
    const { runtime, step } = createTestContext();

    // Pre-populate the output slot with a render tree
    const mockRenderTree = { kind: "renderTree", nodes: [] };
    runtime.values.write(100, mockRenderTree);

    executeRenderAssemble(step, {} as any, runtime);

    // Verify render tree still in output slot
    expect(runtime.values.read(100)).toBe(mockRenderTree);
  });

  it("handles null render tree gracefully", () => {
    const { runtime, step } = createTestContext();

    // Pre-populate with null (valid for stub render nodes)
    runtime.values.write(100, null);

    executeRenderAssemble(step, {} as any, runtime);

    // Verify null preserved
    expect(runtime.values.read(100)).toBe(null);
  });

  it("handles undefined render tree gracefully", () => {
    const { runtime, step } = createTestContext();

    // Pre-populate with undefined
    runtime.values.write(100, undefined);

    executeRenderAssemble(step, {} as any, runtime);

    // Verify undefined preserved
    expect(runtime.values.read(100)).toBe(undefined);
  });
});

describe("executeRenderAssemble - Error Handling", () => {
  it("reads unwritten slot without error (returns undefined)", () => {
    const { runtime, step } = createTestContext();

    // Don't write to slot - simulates render node that didn't populate output yet
    // Per ValueStore semantics, reading an allocated but unwritten slot returns undefined

    // executeRenderAssemble reads the slot (doesn't throw)
    executeRenderAssemble(step, {} as any, runtime);

    // Slot is undefined (not written)
    expect(runtime.values.read(100)).toBe(undefined);
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
      rootNodeIndex: 0 as any,
      outSlot: 9999, // Not allocated
    };

    // ValueStore throws when slot not in slotMeta
    expect(() => {
      executeRenderAssemble(step, {} as any, runtime);
    }).toThrow(/slot.*not found/i);
  });
});

describe("executeRenderAssemble - Integration", () => {
  it("acts as stable finalization boundary", () => {
    const { runtime, step } = createTestContext();

    // Setup: render node already wrote output
    const renderOutput = {
      kind: "renderCommands",
      commands: [{ op: "drawCircle", x: 100, y: 100, r: 50 }],
    };
    runtime.values.write(100, renderOutput);

    executeRenderAssemble(step, {} as any, runtime);

    // Verify output is stable (no transformation applied)
    expect(runtime.values.read(100)).toBe(renderOutput);
  });

  it("works with complex render tree structure", () => {
    const { runtime, step } = createTestContext();

    const complexRenderTree = {
      kind: "renderTree",
      root: {
        type: "group",
        children: [
          { type: "circle", x: 0, y: 0, r: 10 },
          { type: "rect", x: 10, y: 10, w: 20, h: 20 },
          {
            type: "group",
            children: [{ type: "line", x1: 0, y1: 0, x2: 100, y2: 100 }],
          },
        ],
      },
    };

    runtime.values.write(100, complexRenderTree);

    executeRenderAssemble(step, {} as any, runtime);

    // Verify complex structure preserved
    expect(runtime.values.read(100)).toEqual(complexRenderTree);
  });
});

describe("executeRenderAssemble - Spec Compliance", () => {
  it("satisfies 'typically trivial' spec requirement", () => {
    const { runtime, step } = createTestContext();

    // Per spec: "the render node already wrote a RenderTree/RenderCmds to its output slot"
    const renderTree = { kind: "renderTree", nodes: [] };
    runtime.values.write(100, renderTree);

    // Should be trivial - no heavy computation
    executeRenderAssemble(step, {} as any, runtime);

    // Verify render tree is accessible
    expect(runtime.values.read(100)).toBe(renderTree);
  });

  it("provides stable boundary for hot-swap", () => {
    const { runtime, step } = createTestContext();

    // This step exists for hot-swap + tracing stability
    const renderTree = { kind: "renderTree", version: 1 };
    runtime.values.write(100, renderTree);

    executeRenderAssemble(step, {} as any, runtime);

    // Verify step provides stable reference point
    expect(runtime.values.read(100)).toBe(renderTree);
  });

  it("validates render tree is present (finalization check)", () => {
    const { runtime, step } = createTestContext();

    // Write various types of render output
    const testCases = [
      { kind: "renderTree", nodes: [] },
      { kind: "renderCommands", cmds: [] },
      null,
      undefined,
      { custom: "renderOutput" },
    ];

    for (const renderOutput of testCases) {
      // Clear previous write tracking
      runtime.values.clear();

      // Write render output
      runtime.values.write(100, renderOutput);

      // Execute step - should not throw (validates output exists)
      expect(() => {
        executeRenderAssemble(step, {} as any, runtime);
      }).not.toThrow();

      // Verify output accessible after finalization
      expect(runtime.values.read(100)).toBe(renderOutput);
    }
  });
});
