/**
 * ScheduleExecutor Tests
 *
 * Basic execution tests for the ScheduleExecutor.
 * Validates that the execution loop runs and steps execute in order.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ScheduleExecutor } from "../ScheduleExecutor";
import { createRuntimeState } from "../RuntimeState";
import type {
  CompiledProgramIR,
  TimeModelIR,
  ScheduleIR,
  StepIR,
  TypeTable,
  NodeTable,
  BusTable,
  LensTable,
  AdapterTable,
  FieldExprTable,
  ConstPool,
  OutputSpec,
  ProgramMeta,
  StateLayout,
} from "../../../compiler/ir";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal CompiledProgramIR for testing.
 */
function createMinimalProgram(
  timeModel: TimeModelIR,
  steps: StepIR[],
): CompiledProgramIR {
  const emptyTypeTable: TypeTable = { typeIds: [] };
  const emptyNodeTable: NodeTable = { nodes: [] };
  const emptyBusTable: BusTable = { buses: [] };
  const emptyLensTable: LensTable = { lenses: [] };
  const emptyAdapterTable: AdapterTable = { adapters: [] };
  const emptyFieldExprTable: FieldExprTable = { nodes: [] };
  const emptyConstPool: ConstPool = {
    json: [],
    f64: new Float64Array(0),
    f32: new Float32Array(0),
    i32: new Int32Array(0),
    constIndex: [],
  };
  const emptyStateLayout: StateLayout = {
    cells: [],
    f64Size: 0,
    f32Size: 0,
    i32Size: 0,
  };
  const emptySchedule: ScheduleIR = {
    steps,
    stepIdToIndex: Object.fromEntries(steps.map((s, i) => [s.id, i])),
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
  const emptyOutputs: OutputSpec[] = [];
  const emptyMeta: ProgramMeta = {
    sourceMap: {},
    names: {
      nodes: {},
      buses: {},
      steps: {},
    },
  };

  return {
    irVersion: 1,
    patchId: "test-patch",
    patchRevision: 1,
    compileId: "test-compile-1",
    seed: 42,
    timeModel,
    types: emptyTypeTable,
    nodes: emptyNodeTable,
    buses: emptyBusTable,
    lenses: emptyLensTable,
    adapters: emptyAdapterTable,
    fields: emptyFieldExprTable,
    constants: emptyConstPool,
    stateLayout: emptyStateLayout,
    schedule: emptySchedule,
    outputs: emptyOutputs,
    meta: emptyMeta,
  };
}

// ============================================================================
// ScheduleExecutor Tests
// ============================================================================

describe("ScheduleExecutor", () => {
  let executor: ScheduleExecutor;

  beforeEach(() => {
    executor = new ScheduleExecutor();
  });

  describe("executeFrame", () => {
    it("executes minimal program with timeDerive step", () => {
      const timeModel: TimeModelIR = {
        kind: "finite",
        durationMs: 1000,
      };

      const steps: StepIR[] = [
        {
          id: "step-time-derive",
          kind: "timeDerive",
          label: "Derive time signals",
          tAbsMsSlot: 0,
          timeModel,
          out: {
            tModelMs: 1,
            progress01: 2,
          },
        },
      ];

      const program = createMinimalProgram(timeModel, steps);
      const runtime = createRuntimeState(program);

      // Execute frame at t=500ms
      const output = executor.executeFrame(program, runtime, 500);

      // Verify output structure
      expect(output).toBeDefined();
      expect(output.frameId).toBe(1); // First frame

      // Note: We can't verify slot values yet because ValueStore.read() is stubbed
      // That's OK for Sprint 1 - we're just testing the execution loop structure
    });

    it("increments frameId on each execution", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const program = createMinimalProgram(timeModel, []);
      const runtime = createRuntimeState(program);

      const output1 = executor.executeFrame(program, runtime, 0);
      expect(output1.frameId).toBe(1);

      const output2 = executor.executeFrame(program, runtime, 16.67);
      expect(output2.frameId).toBe(2);

      const output3 = executor.executeFrame(program, runtime, 33.33);
      expect(output3.frameId).toBe(3);
    });

    it("executes steps in schedule order", () => {
      // This is a structure test - we verify that the executor
      // iterates through steps without error, even though step
      // implementations are stubs.
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };

      const steps: StepIR[] = [
        {
          id: "step-1",
          kind: "timeDerive",
          tAbsMsSlot: 0,
          timeModel,
          out: { tModelMs: 1 },
        },
        {
          id: "step-2",
          kind: "nodeEval",
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [2],
          phase: "preBus",
        },
        {
          id: "step-3",
          kind: "busEval",
          busIndex: 0,
          outSlot: 3,
          publishers: [],
          combine: { mode: "last" },
          silent: { kind: "zero" },
          busType: { world: "signal", domain: "number" },
        },
      ];

      const program = createMinimalProgram(timeModel, steps);
      const runtime = createRuntimeState(program);

      // Should not throw - all step executors should handle their stubs
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();
    });

    it("handles all step kinds without error", () => {
      // Exhaustiveness test - ensure all 6 step kinds can execute
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };

      const steps: StepIR[] = [
        {
          id: "time",
          kind: "timeDerive",
          tAbsMsSlot: 0,
          timeModel,
          out: { tModelMs: 1 },
        },
        {
          id: "node",
          kind: "nodeEval",
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [],
          phase: "postBus",
        },
        {
          id: "bus",
          kind: "busEval",
          busIndex: 0,
          outSlot: 2,
          publishers: [],
          combine: { mode: "last" },
          silent: { kind: "zero" },
          busType: { world: "signal", domain: "number" },
        },
        {
          id: "materialize",
          kind: "materialize",
          materialization: {
            id: "mat-1",
            fieldExprId: "field-1",
            domainSlot: 3,
            outBufferSlot: 4,
            format: { components: 2, elementType: "f32" },
            policy: "perFrame",
          },
        },
        {
          id: "render",
          kind: "renderAssemble",
          rootNodeIndex: 0,
          outSlot: 5,
        },
        {
          id: "debug",
          kind: "debugProbe",
          probe: {
            id: "probe-1",
            slots: [1, 2],
            mode: "value",
          },
        },
      ];

      const program = createMinimalProgram(timeModel, steps);
      const runtime = createRuntimeState(program);

      // All step kinds should execute without error
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();
    });
  });
});
