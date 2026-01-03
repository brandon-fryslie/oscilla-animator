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
    seed: 12345,
    timeModel,
    types: { typeIds: [] },
    signalExprs: { nodes: [] },
    fieldExprs: { nodes: [] },
    eventExprs: { nodes: [] },
    constants: {
      json: [],
    },
    stateLayout,
    slotMeta: [],
    render: { sinks: [] },
    cameras: { cameras: [], cameraIdToIndex: {} },
    meshes: { meshes: [], meshIdToIndex: {} },
    schedule,
    outputs: [],
    debugIndex: {
      stepToBlock: new Map<string, string>(),
      slotToBlock: new Map<number, string>(),
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
      const newProgram = {
        ...program,
        stateLayout: {
          cells: [
            {
              stateId: "state-1",
              storage: "f64" as const,
              offset: 0,
              size: 1,
              nodeId: "node-1",
              role: "accumulator" as const,
            },
          ],
          f64Size: 1,
          f32Size: 0,
          i32Size: 0,
        },
      };

      const runtime = createRuntimeState(newProgram);

      expect(runtime.state.f64.length).toBe(1);
      expect(runtime.state.f32.length).toBe(0);
      expect(runtime.state.i32.length).toBe(0);
    });

    it("initializes state cells with zeros when no initialConstId", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        stateLayout: {
          cells: [
            {
              stateId: "state-1",
              storage: "f64" as const,
              offset: 0,
              size: 2,
              nodeId: "node-1",
              role: "buffer" as const,
            },
          ],
          f64Size: 2,
          f32Size: 0,
          i32Size: 0,
        },
      };

      const runtime = createRuntimeState(newProgram);

      expect(runtime.state.f64[0]).toBe(0);
      expect(runtime.state.f64[1]).toBe(0);
    });

    it("initializes state cells from const pool", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        constants: {
          json: [42.0, 100.0],
        },
        stateLayout: {
          cells: [
            {
              stateId: "state-1",
              storage: "f64" as const,
              offset: 0,
              size: 1,
              nodeId: "node-1",
              role: "accumulator" as const,
              initialConstId: 0,
            },
            {
              stateId: "state-2",
              storage: "f64" as const,
              offset: 1,
              size: 1,
              nodeId: "node-2",
              role: "value" as const,
              initialConstId: 1,
            },
          ],
          f64Size: 2,
          f32Size: 0,
          i32Size: 0,
        },
      };

      const runtime = createRuntimeState(newProgram);

      expect(runtime.state.f64[0]).toBe(42.0);
      expect(runtime.state.f64[1]).toBe(100.0);
    });

    it("handles mixed storage types in state layout", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        constants: {
          json: [1.1, 2.2, 33],
        },
        stateLayout: {
          cells: [
            {
              stateId: "state-f64",
              storage: "f64" as const,
              offset: 0,
              size: 1,
              nodeId: "node-1",
              role: "value" as const,
              initialConstId: 0,
            },
            {
              stateId: "state-f32",
              storage: "f32" as const,
              offset: 0,
              size: 1,
              nodeId: "node-2",
              role: "value" as const,
              initialConstId: 1,
            },
            {
              stateId: "state-i32",
              storage: "i32" as const,
              offset: 0,
              size: 1,
              nodeId: "node-3",
              role: "counter" as const,
              initialConstId: 2,
            },
          ],
          f64Size: 1,
          f32Size: 1,
          i32Size: 1,
        },
      };

      const runtime = createRuntimeState(newProgram);

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
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "timeMs" as const, category: "internal" as const, busEligible: false },
            debugName: "tAbsMs",
          },
          {
            slot: 1,
            storage: "f64" as const,
            offset: 1,
            type: { world: "signal" as const, domain: "timeMs" as const, category: "internal" as const, busEligible: false },
            debugName: "tModelMs",
          },
          {
            slot: 2,
            storage: "f64" as const,
            offset: 2,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "phase01",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-time",
              kind: "timeDerive" as const,
              deps: [],
              tAbsMsSlot: 0,
              timeModel: program.timeModel,
              out: {
                tModelMs: 1,
                phase01: 2,
              },
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      // Slots 0, 1, 2 should be allocated
      expect(runtime.values.f64.length).toBeGreaterThanOrEqual(3);
      expect(runtime.values.slotMeta.length).toBe(3);
    });

    it("extracts slots from signalEval step", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig0",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-signal",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 0, slot: 0 }],
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      // Slot 0 should be allocated
      expect(runtime.values.f64.length).toBeGreaterThanOrEqual(1);
      expect(runtime.values.slotMeta.length).toBe(1);
    });

    it("deduplicates slot indices across multiple steps", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig0",
          },
          {
            slot: 1,
            storage: "f64" as const,
            offset: 1,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig1",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-1",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 0, slot: 0 }],
            },
            {
              id: "step-2",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 1, slot: 1 }],
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      // Slots 0, 1 should be allocated
      expect(runtime.values.slotMeta.length).toBe(2);
    });

    it("allocates slots with dense offsets", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig0",
          },
          {
            slot: 10,
            storage: "f64" as const,
            offset: 10,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig10",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-1",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 0, slot: 0 }],
            },
            {
              id: "step-2",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 1, slot: 10 }],
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      // Slots 0, 10 allocated
      expect(runtime.values.slotMeta.length).toBe(2);
      const slot0Meta = runtime.values.slotMeta.find((m) => m.slot === 0);
      const slot10Meta = runtime.values.slotMeta.find((m) => m.slot === 10);

      expect(slot0Meta?.offset).toBe(0);
      expect(slot10Meta?.offset).toBe(10);
    });
  });

  describe("ValueStore Operations", () => {
    it("ValueStore supports write and read operations", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig0",
          },
          {
            slot: 1,
            storage: "f64" as const,
            offset: 1,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig1",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-1",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 0, slot: 0 }],
            },
            {
              id: "step-2",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 1, slot: 1 }],
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      runtime.values.write(0, 3.14);
      runtime.values.write(1, 2.71);

      expect(runtime.values.read(0)).toBe(3.14);
      expect(runtime.values.read(1)).toBe(2.71);
    });

    it("ValueStore enforces single-writer per frame", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig0",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-1",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 0, slot: 0 }],
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      runtime.values.write(0, 1.0);
      expect(() => runtime.values.write(0, 2.0)).toThrow("ValueStore.write: slot 0 written multiple times this frame");
    });

    it("ValueStore clear() resets write tracking", () => {
      const program = createMinimalProgram();
      const newProgram = {
        ...program,
        slotMeta: [
          {
            slot: 0,
            storage: "f64" as const,
            offset: 0,
            type: { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true },
            debugName: "sig0",
          },
        ],
        schedule: {
          ...program.schedule,
          steps: [
            {
              id: "step-1",
              kind: "signalEval" as const,
              deps: [],
              outputs: [{ sigId: 0, slot: 0 }],
            },
          ],
        },
      };

      const runtime = createRuntimeState(newProgram);

      runtime.values.write(0, 1.0);
      runtime.values.clear();
      expect(() => runtime.values.write(0, 2.0)).not.toThrow();
      expect(runtime.values.read(0)).toBe(2.0);
    });
  });
});
