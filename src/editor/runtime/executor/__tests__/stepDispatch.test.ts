/**
 * Step Dispatch Tests
 *
 * Tests for the step execution dispatch layer.
 * Each step kind has a dedicated executor function.
 *
 * References:
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 3
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2
 */

import { describe, it, expect } from "vitest";
import { executeMaterialize } from "../steps/executeMaterialize";
import { executeRenderAssemble } from "../steps/executeRenderAssemble";
import { executeDebugProbe } from "../steps/executeDebugProbe";
import type {
  StepMaterialize,
  StepRenderAssemble,
  StepDebugProbe,
  CompiledProgramIR,
} from "../../../compiler/ir";
import { createRuntimeState } from "../RuntimeState";

/**
 * Create minimal program IR for testing.
 *
 * Includes slotMeta for slots 0-2 used by step dispatch tests.
 */
function createMinimalProgram(): CompiledProgramIR {
  return {
    irVersion: 1,
    patchId: "test-patch",
    seed: 42,
    timeModel: { kind: "infinite", windowMs: 10000 },
    types: { typeIds: [] },
    signalExprs: { nodes: [] },
    fieldExprs: {
      nodes: [
        {
          kind: "const",
          type: { world: "field", domain: "float", category: "core", busEligible: true },
          constId: 0,
        },
      ],
    },
    eventExprs: { nodes: [] },
    constants: {
      json: [42],
    },
    stateLayout: {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    },
    // slotMeta for slots used by step dispatch tests
    slotMeta: [
      { slot: 0, storage: "object", offset: 0, type: { world: "signal", domain: "unknown", category: "internal", busEligible: false }, debugName: "slot0" },
      { slot: 1, storage: "object", offset: 1, type: { world: "signal", domain: "unknown", category: "internal", busEligible: false }, debugName: "slot1" },
      { slot: 2, storage: "object", offset: 2, type: { world: "signal", domain: "unknown", category: "internal", busEligible: false }, debugName: "slot2" },
    ],
    render: { sinks: [] },
    cameras: { cameras: [], cameraIdToIndex: {} },
    meshes: { meshes: [], meshIdToIndex: {} },
    schedule: {
      steps: [],
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
  };
}

describe("Step Dispatch", () => {
  describe("executeMaterialize", () => {
    it("does not throw when called", () => {
      const step: StepMaterialize = {
        id: "materialize-1",
        kind: "materialize",
        deps: [],
        materialization: {
          id: "mat-1",
          fieldExprId: "0", // Use index 0 (the only field node in the array)
          domainSlot: 0,
          outBufferSlot: 1,
          format: { components: 2, elementType: "f32" },
          policy: "perFrame",
        },
      };

      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      // Write domain count to slot 0 (required by executeMaterialize)
      runtime.values.write(0, 100); // 100 elements in domain

      // Should not throw - materializes field and writes buffer handle
      expect(() => {
        executeMaterialize(step, program, runtime, { tAbsMs: 1000, tModelMs: 1000 });
      }).not.toThrow();

      // Verify buffer handle was written
      const bufferHandle = runtime.values.read(1);
      expect(bufferHandle).toBeDefined();
      expect((bufferHandle as { kind: string }).kind).toBe("buffer");
    });
  });

  describe("executeRenderAssemble", () => {
    it("does not throw when called", () => {
      const step: StepRenderAssemble = {
        id: "render-assemble-1",
        kind: "renderAssemble",
        deps: [],
        instance2dListSlot: 0,
        pathBatchListSlot: 1,
        outFrameSlot: 2,
      };

      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      // Should not throw (stub is no-op)
      expect(() => {
        executeRenderAssemble(step, program, runtime);
      }).not.toThrow();
    });
  });

  describe("executeDebugProbe", () => {
    it("does not throw when called", () => {
      const step: StepDebugProbe = {
        id: "debug-probe-1",
        kind: "debugProbe",
        deps: [],
        probe: {
          id: "probe-1",
          slots: [0, 1],
          mode: "value",
        },
      };

      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      // Write some test values to probe
      runtime.values.write(0, 42);
      runtime.values.write(1, 3.14);

      // Should not throw (stub is no-op)
      expect(() => {
        executeDebugProbe(step, runtime);
      }).not.toThrow();
    });
  });
});
