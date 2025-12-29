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
  SignalExprTable,
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
  // Include stub nodes for any nodeEval steps in the schedule
  const nodeEvalSteps = steps.filter((s) => s.kind === "nodeEval") as { nodeIndex: number }[];
  const maxNodeIndex = nodeEvalSteps.length > 0
    ? Math.max(...nodeEvalSteps.map((s) => s.nodeIndex))
    : -1;
  const stubNodes = Array.from({ length: maxNodeIndex + 1 }, (_, i) => ({
    id: `stub-node-${i}`,
    typeId: 0,
    inputCount: 0,
    outputCount: 1,
    opcodeId: 0, // Const opcode
    compilerTag: 0, // constId = 0 -> f64[0] = 42.0
  }));
  const emptyNodeTable: NodeTable = { nodes: stubNodes };
  const emptyBusTable: BusTable = { buses: [] };
  const emptyLensTable: LensTable = { lenses: [] };
  const emptyAdapterTable: AdapterTable = { adapters: [] };
  const emptyFieldExprTable: FieldExprTable = {
    nodes: [
      {
        kind: "const",
        type: { world: "field", domain: "float" },
        constId: 0,
      },
    ],
  };
  const emptySignalTable: SignalExprTable = { nodes: [] };
  const emptyConstPool: ConstPool = {
    json: [42],
    f64: new Float64Array([42.0]),
    f32: new Float32Array([]),
    i32: new Int32Array([]),
    constIndex: [{ k: "f64", idx: 0 }],
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
    signalTable: emptySignalTable,
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

  describe("construction", () => {
    it("should create a valid ScheduleExecutor instance", () => {
      expect(executor).toBeDefined();
    });
  });

  describe("executeFrame", () => {
    it("executes empty schedule without error", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const program = createMinimalProgram(timeModel, []);
      const runtime = createRuntimeState(program);

      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();
    });

    it("executes single nodeEval step", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const steps: StepIR[] = [
        {
          id: "node-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [0],
          phase: "postBus",
        },
      ];

      const program = createMinimalProgram(timeModel, steps);
      const runtime = createRuntimeState(program);

      // NodeEval should execute without error (stub node)
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();

      // Verify slot was written (const opcode writes 42)
      const value = runtime.values.read(0);
      expect(value).toBe(42);
    });

    it("executes multiple steps in dependency order", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const steps: StepIR[] = [
        // Step 1: node-1 writes to slot 0
        {
          id: "node-1",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [0],
          phase: "postBus",
        },
        // Step 2: node-2 writes to slot 1
        {
          id: "node-2",
          kind: "nodeEval",
          deps: ["node-1"], // Depends on node-1
          nodeIndex: 1,
          inputSlots: [0],
          outputSlots: [1],
          phase: "postBus",
        },
      ];

      const program = createMinimalProgram(timeModel, steps);
      const runtime = createRuntimeState(program);

      // Both steps should execute in order
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();

      // Verify both slots were written
      expect(runtime.values.read(0)).toBe(42);
      expect(runtime.values.read(1)).toBe(42);
    });

    it("handles all step kinds without error", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const steps: StepIR[] = [
        {
          id: "node",
          kind: "nodeEval",
          deps: [],
          nodeIndex: 0,
          inputSlots: [],
          outputSlots: [1],
          phase: "postBus",
        },
        {
          id: "bus",
          kind: "busEval",
          deps: [],
          busIndex: 0,
          busType: { world: "signal", domain: "float" },
          outSlot: 2,
          publishers: [],
          combine: { mode: "last" },
          silent: { kind: "const", constId: 0 },
        },
        {
          id: "mat",
          kind: "materialize",
          deps: [],
          materialization: {
            id: "mat-1",
            fieldExprId: "0",
            domainSlot: 3,
            outBufferSlot: 4,
            format: { components: 2, elementType: "f32" },
            policy: "perFrame",
          },
        },
        {
          id: "render",
          deps: [],
          kind: "renderAssemble",
          instance2dListSlot: 0,
          pathBatchListSlot: 1,
          outFrameSlot: 5,
        },
        {
          id: "debug",
          kind: "debugProbe",
          deps: [],
          probe: {
            id: "probe-1",
            slots: [1, 2],
            mode: "value",
          },
        },
      ];

      const program = createMinimalProgram(timeModel, steps);
      const runtime = createRuntimeState(program);

      // Write domain count to slot 3 (required by materialize step)
      runtime.values.write(3, 100);

      // All step kinds should execute without error
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();
    });
  });
});
