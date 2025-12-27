/**
 * RuntimeState Tests
 *
 * Integration tests for RuntimeState creation from CompiledProgramIR.
 * Verifies ValueStore and StateBuffer integration.
 */

import { describe, it, expect } from "vitest";
import { createRuntimeState } from "../RuntimeState";
import type { CompiledProgramIR } from "../../../compiler/ir/program";
import type { ScheduleIR, TimeModelIR } from "../../../compiler/ir/schedule";
import type { StateLayout } from "../../../compiler/ir/stores";

// Helper to create a minimal program for testing
function createMinimalProgram(): CompiledProgramIR {
  const timeModel: TimeModelIR = {
    kind: "cyclic",
    periodMs: 1000,
    mode: "loop",
    phaseDomain: "0..1",
  };

  const schedule: ScheduleIR = {
    steps: [],
    stepIdToIndex: {},
    deps: {
      slotProducerStep: {},
      slotConsumers: {},
      busDependsOnSlots: {},
      busProvidesSlot: {},
    },
    determinism: {
      allowedOrderingInputs: [],
      topoTieBreak: "nodeIdLex",
    },
    caching: {
      stepCache: {},
      materializationCache: {},
    },
  };

  const stateLayout: StateLayout = {
    cells: [],
    f64Size: 0,
    f32Size: 0,
    i32Size: 0,
  };

  return {
    irVersion: 1,
    patchId: "test-patch",
    patchRevision: 1,
    compileId: "test-compile",
    seed: 12345,
    timeModel,
    types: { typeIds: [] },
    nodes: { nodes: [] },
    buses: { buses: [] },
    lenses: { lenses: [] },
    adapters: { adapters: [] },
    fields: { nodes: [] },
    constants: {
      json: [],
      f64: new Float64Array([]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [],
    },
    stateLayout,
    schedule,
    outputs: [],
    meta: {
      sourceMap: {},
      names: {
        nodes: {},
        buses: {},
        steps: {},
      },
    },
  };
}

describe("RuntimeState", () => {
  describe("Creation from Minimal Program", () => {
    it("creates RuntimeState from empty program", () => {
      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      expect(runtime).toBeDefined();
      expect(runtime.values).toBeDefined();
      expect(runtime.state).toBeDefined();
      expect(runtime.frameCache).toBeDefined();
      expect(runtime.frameId).toBe(0);
    });

    it("creates ValueStore with empty slotMeta for empty schedule", () => {
      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      // Empty schedule means no slots, so all arrays should be empty
      expect(runtime.values.f64.length).toBe(0);
      expect(runtime.values.f32.length).toBe(0);
      expect(runtime.values.i32.length).toBe(0);
      expect(runtime.values.u32.length).toBe(0);
      expect(runtime.values.objects.length).toBe(0);
    });

    it("creates StateBuffer with empty state layout", () => {
      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      expect(runtime.state.f64.length).toBe(0);
      expect(runtime.state.f32.length).toBe(0);
      expect(runtime.state.i32.length).toBe(0);
    });

    it("initializes frameId to 0", () => {
      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      expect(runtime.frameId).toBe(0);
    });

    it("creates stub FrameCache", () => {
      const program = createMinimalProgram();
      const runtime = createRuntimeState(program);

      expect(runtime.frameCache.frameId).toBe(1);
      expect(typeof runtime.frameCache.newFrame).toBe("function");
      expect(typeof runtime.frameCache.invalidate).toBe("function");
    });
  });

  describe("Creation with State Cells", () => {
    it("creates StateBuffer with correct sizes from layout", () => {
      const program = createMinimalProgram();
      program.stateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const runtime = createRuntimeState(program);

      expect(runtime.state.f64.length).toBe(1);
      expect(runtime.state.f32.length).toBe(0);
      expect(runtime.state.i32.length).toBe(0);
    });

    it("initializes state cells with zeros when no initialConstId", () => {
      const program = createMinimalProgram();
      program.stateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 2,
            nodeId: "node-1",
            role: "buffer",
          },
        ],
        f64Size: 2,
        f32Size: 0,
        i32Size: 0,
      };

      const runtime = createRuntimeState(program);

      expect(runtime.state.f64[0]).toBe(0);
      expect(runtime.state.f64[1]).toBe(0);
    });

    it("initializes state cells from const pool", () => {
      const program = createMinimalProgram();
      program.constants = {
        json: [],
        f64: new Float64Array([42.0, 100.0]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [
          { k: "f64", idx: 0 },
          { k: "f64", idx: 1 },
        ],
      };
      program.stateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
            initialConstId: 0,
          },
          {
            stateId: "state-2",
            storage: "f64",
            offset: 1,
            size: 1,
            nodeId: "node-2",
            role: "value",
            initialConstId: 1,
          },
        ],
        f64Size: 2,
        f32Size: 0,
        i32Size: 0,
      };

      const runtime = createRuntimeState(program);

      expect(runtime.state.f64[0]).toBe(42.0);
      expect(runtime.state.f64[1]).toBe(100.0);
    });

    it("handles mixed storage types in state layout", () => {
      const program = createMinimalProgram();
      program.constants = {
        json: [],
        f64: new Float64Array([1.1]),
        f32: new Float32Array([2.2]),
        i32: new Int32Array([33]),
        constIndex: [
          { k: "f64", idx: 0 },
          { k: "f32", idx: 0 },
          { k: "i32", idx: 0 },
        ],
      };
      program.stateLayout = {
        cells: [
          {
            stateId: "state-f64",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "value",
            initialConstId: 0,
          },
          {
            stateId: "state-f32",
            storage: "f32",
            offset: 0,
            size: 1,
            nodeId: "node-2",
            role: "value",
            initialConstId: 1,
          },
          {
            stateId: "state-i32",
            storage: "i32",
            offset: 0,
            size: 1,
            nodeId: "node-3",
            role: "counter",
            initialConstId: 2,
          },
        ],
        f64Size: 1,
        f32Size: 1,
        i32Size: 1,
      };

      const runtime = createRuntimeState(program);

      expect(runtime.state.f64.length).toBe(1);
      expect(runtime.state.f32.length).toBe(1);
      expect(runtime.state.i32.length).toBe(1);

      expect(runtime.state.f64[0]).toBe(1.1);
      expect(runtime.state.f32[0]).toBeCloseTo(2.2);
      expect(runtime.state.i32[0]).toBe(33);
    });
  });

  describe("Slot Metadata Extraction", () => {
    it("extracts slots from timeDerive step", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-time",
          kind: "timeDerive",
          deps: [],
          tAbsMsSlot: 0,
          timeModel: program.timeModel,
          out: {
            tModelMs: 1,
            phase01: 2,
          },
        },
      ];

      const runtime = createRuntimeState(program);

      // Slots 0, 1, 2 should be allocated
      expect(runtime.values.f64.length).toBeGreaterThanOrEqual(3);
      expect(runtime.values.slotMeta.length).toBe(3);
    });

    it("extracts slots from nodeEval step", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-node",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [0, 1],
          outputSlots: [2, 3],
          phase: "postBus",
        },
      ];

      const runtime = createRuntimeState(program);

      // Slots 0, 1, 2, 3 should be allocated
      expect(runtime.values.f64.length).toBeGreaterThanOrEqual(4);
      expect(runtime.values.slotMeta.length).toBe(4);
    });

    it("extracts slots from busEval step", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-bus",
          kind: "busEval",
          deps: [],
          busIndex: 0,
          outSlot: 5,
          publishers: [
            {
              enabled: true,
              sortKey: 0,
              srcSlot: 3,
              publisherId: "pub-1",
            },
          ],
          combine: { mode: "last" },
          silent: { kind: "zero" },
          busType: { world: "signal", domain: "number" },
        },
      ];

      const runtime = createRuntimeState(program);

      // Slots 3, 5 should be allocated
      expect(runtime.values.slotMeta.length).toBe(2);
      expect(runtime.values.slotMeta.some((m) => m.slot === 3)).toBe(true);
      expect(runtime.values.slotMeta.some((m) => m.slot === 5)).toBe(true);
    });

    it("deduplicates slot indices across multiple steps", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [0, 1],
          outputSlots: [2],
          phase: "postBus",
        },
        {
          id: "step-2",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 1,
          inputSlots: [2], // Slot 2 used as input
          outputSlots: [3],
          phase: "postBus",
        },
      ];

      const runtime = createRuntimeState(program);

      // Slots 0, 1, 2, 3 should be allocated (2 appears in both steps but only allocated once)
      expect(runtime.values.slotMeta.length).toBe(4);
    });

    it("allocates slots with dense offsets", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [0, 10, 20], // Sparse slot indices
          outputSlots: [30],
          phase: "postBus",
        },
      ];

      const runtime = createRuntimeState(program);

      // Slots 0, 10, 20, 30 allocated with dense offsets 0, 1, 2, 3
      expect(runtime.values.slotMeta.length).toBe(4);
      const slot0Meta = runtime.values.slotMeta.find((m) => m.slot === 0);
      const slot10Meta = runtime.values.slotMeta.find((m) => m.slot === 10);
      const slot20Meta = runtime.values.slotMeta.find((m) => m.slot === 20);
      const slot30Meta = runtime.values.slotMeta.find((m) => m.slot === 30);

      expect(slot0Meta?.offset).toBe(0);
      expect(slot10Meta?.offset).toBe(10);
      expect(slot20Meta?.offset).toBe(20);
      expect(slot30Meta?.offset).toBe(30);
    });
  });

  describe("ValueStore Operations", () => {
    it("ValueStore supports write and read operations", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [0, 1],
          phase: "postBus",
        },
      ];

      const runtime = createRuntimeState(program);

      runtime.values.write(0, 3.14);
      runtime.values.write(1, 2.71);

      expect(runtime.values.read(0)).toBe(3.14);
      expect(runtime.values.read(1)).toBe(2.71);
    });

    it("ValueStore enforces single-writer per frame", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [0],
          phase: "postBus",
        },
      ];

      const runtime = createRuntimeState(program);

      runtime.values.write(0, 1.0);
      expect(() => runtime.values.write(0, 2.0)).toThrow("already written this frame");
    });

    it("ValueStore clear() resets write tracking", () => {
      const program = createMinimalProgram();
      program.schedule.steps = [
        {
          id: "step-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [0],
          phase: "postBus",
        },
      ];

      const runtime = createRuntimeState(program);

      runtime.values.write(0, 1.0);
      runtime.values.clear();
      expect(() => runtime.values.write(0, 2.0)).not.toThrow();
      expect(runtime.values.read(0)).toBe(2.0);
    });
  });
});
