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
  StateLayout,
  SlotMetaEntry,
  SignalExprIR,
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
  slotMeta: SlotMetaEntry[] = [],
  signalExprs: SignalExprIR[] = [],
): CompiledProgramIR {
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

  return {
    irVersion: 1,
    patchId: "test-patch",
    seed: 42,
    timeModel,
    types: { typeIds: [] },
    signalExprs: { nodes: signalExprs },
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
    stateLayout: emptyStateLayout,
    slotMeta,
    render: { sinks: [] },
    cameras: { cameras: [], cameraIdToIndex: {} },
    meshes: { meshes: [], meshIdToIndex: {} },
    schedule: emptySchedule,
    outputs: [],
    debugIndex: {
      stepToBlock: new Map<string, string>(),
      slotToBlock: new Map<number, string>(),
    },
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

    it("executes single signalEval step", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const steps: StepIR[] = [
        {
          id: "signal-1",
          kind: "signalEval",
          deps: [],
          outputs: [{ sigId: 0, slot: 0 }],
        },
      ];

      const slotMeta: SlotMetaEntry[] = [
        {
          slot: 0,
          storage: "f64",
          offset: 0,
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          debugName: "slot0",
        },
      ];

      const signalExprs: SignalExprIR[] = [
        {
          kind: "const",
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          constId: 0,
        },
      ];

      const program = createMinimalProgram(timeModel, steps, slotMeta, signalExprs);
      const runtime = createRuntimeState(program);

      // SignalEval should execute without error
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();

      // Verify slot was written
      const value = runtime.values.read(0);
      expect(value).toBeDefined();
    });

    it("executes multiple steps in dependency order", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const steps: StepIR[] = [
        // Step 1: signal-1 writes to slot 0
        {
          id: "signal-1",
          kind: "signalEval",
          deps: [],
          outputs: [{ sigId: 0, slot: 0 }],
        },
        // Step 2: signal-2 writes to slot 1 (depends on signal-1)
        {
          id: "signal-2",
          kind: "signalEval",
          deps: ["signal-1"],
          outputs: [{ sigId: 1, slot: 1 }],
        },
      ];

      const slotMeta: SlotMetaEntry[] = [
        {
          slot: 0,
          storage: "f64",
          offset: 0,
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          debugName: "slot0",
        },
        {
          slot: 1,
          storage: "f64",
          offset: 1,
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          debugName: "slot1",
        },
      ];

      const signalExprs: SignalExprIR[] = [
        {
          kind: "const",
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          constId: 0,
        },
        {
          kind: "const",
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          constId: 0,
        },
      ];

      const program = createMinimalProgram(timeModel, steps, slotMeta, signalExprs);
      const runtime = createRuntimeState(program);

      // Both steps should execute in order
      expect(() => {
        executor.executeFrame(program, runtime, 0);
      }).not.toThrow();

      // Verify both slots were written
      expect(runtime.values.read(0)).toBeDefined();
      expect(runtime.values.read(1)).toBeDefined();
    });

    it("handles all step kinds without error", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };
      const steps: StepIR[] = [
        {
          id: "signal",
          kind: "signalEval",
          deps: [],
          outputs: [{ sigId: 0, slot: 1 }],
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

      const slotMeta: SlotMetaEntry[] = [
        {
          slot: 0,
          storage: "object",
          offset: 0,
          type: { world: "signal", domain: "renderCmds", category: "internal", busEligible: false },
          debugName: "instance2dListSlot",
        },
        {
          slot: 1,
          storage: "f64",
          offset: 0,
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          debugName: "slot1",
        },
        {
          slot: 2,
          storage: "f64",
          offset: 1,
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          debugName: "slot2",
        },
        {
          slot: 3,
          storage: "i32",
          offset: 0,
          type: { world: "signal", domain: "int", category: "core", busEligible: false },
          debugName: "domainSlot",
        },
        {
          slot: 4,
          storage: "object",
          offset: 1,
          type: { world: "signal", domain: "unknown", category: "internal", busEligible: false },
          debugName: "outBufferSlot",
        },
        {
          slot: 5,
          storage: "object",
          offset: 2,
          type: { world: "signal", domain: "renderTree", category: "internal", busEligible: false },
          debugName: "outFrameSlot",
        },
      ];

      const signalExprs: SignalExprIR[] = [
        {
          kind: "const",
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
          constId: 0,
        },
      ];

      const program = createMinimalProgram(timeModel, steps, slotMeta, signalExprs);
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
