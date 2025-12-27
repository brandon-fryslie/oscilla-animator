/**
 * Step Dispatch Tests
 *
 * Tests that all step kinds dispatch correctly.
 * Validates exhaustiveness of step kind handling.
 */

import { describe, it, expect } from "vitest";
import { executeTimeDerive } from "../steps/executeTimeDerive";
import { executeNodeEval } from "../steps/executeNodeEval";
import { executeBusEval } from "../steps/executeBusEval";
import { executeMaterialize } from "../steps/executeMaterialize";
import { executeRenderAssemble } from "../steps/executeRenderAssemble";
import { executeDebugProbe } from "../steps/executeDebugProbe";
import { createRuntimeState } from "../RuntimeState";
import type {
  StepTimeDerive,
  StepNodeEval,
  StepBusEval,
  StepMaterialize,
  StepRenderAssemble,
  StepDebugProbe,
  TimeModelIR,
  CompiledProgramIR,
} from "../../../compiler/ir";
import type { EffectiveTime } from "../timeResolution";

describe("Step Dispatch", () => {
  // ==========================================================================
  // Test that each step executor can be called without error
  // ==========================================================================

  describe("executeTimeDerive", () => {
    it("does not throw when called", () => {
      const timeModel: TimeModelIR = { kind: "infinite", windowMs: 10000 };

      const step: StepTimeDerive = {
        id: "time-derive-1",
        kind: "timeDerive",
        deps: [],
        tAbsMsSlot: 0,
        timeModel,
        out: {
          tModelMs: 1,
        },
      };

      // Provide schedule with the step so slotMeta is extracted
      const program = {
        schedule: { steps: [step] },
      } as CompiledProgramIR;
      const runtime = createRuntimeState(program);
      const time: EffectiveTime = {
        tAbsMs: 1000,
        tModelMs: 1000,
      };

      // Should not throw (stub ValueStore now works)
      expect(() => {
        executeTimeDerive(step, runtime, time);
      }).not.toThrow();
    });
  });

  describe("executeNodeEval", () => {
    it("does not throw when called with empty inputs/outputs", () => {
      const step: StepNodeEval = {
        id: "node-eval-1",
        kind: "nodeEval",
        deps: [],
        nodeIndex: 0,
        inputSlots: [],
        outputSlots: [],
        phase: "preBus",
      };

      // Provide minimal program structure with a node
      const program = {
        nodes: {
          nodes: [
            { id: "test-node", typeId: 0, inputCount: 0, outputCount: 0, opcodeId: 0 },
          ],
        },
      } as CompiledProgramIR;
      const runtime = createRuntimeState(program);

      // Should not throw (stubs handle empty arrays)
      expect(() => {
        executeNodeEval(step, program, runtime);
      }).not.toThrow();
    });
  });

  describe("executeBusEval", () => {
    it("handles zero publishers (silent value)", () => {
      const step: StepBusEval = {
        id: "bus-eval-1",
        kind: "busEval",
        deps: [],
        busIndex: 0,
        outSlot: 1,
        publishers: [],
        combine: { mode: "last" },
        silent: { kind: "zero" },
        busType: { world: "signal", domain: "number" },
      };

      // Provide schedule with the step so slotMeta is extracted
      const program = {
        schedule: { steps: [step] },
      } as CompiledProgramIR;
      const runtime = createRuntimeState(program);

      // Should not throw - writes silent value
      expect(() => {
        executeBusEval(step, program, runtime);
      }).not.toThrow();

      // Verify silent value was written
      expect(runtime.values.read(1)).toBe(0);
    });
  });

  describe("executeMaterialize", () => {
    it("does not throw when called", () => {
      const step: StepMaterialize = {
        id: "materialize-1",
        kind: "materialize",
        deps: [],
        materialization: {
          id: "mat-1",
          fieldExprId: "field-1",
          domainSlot: 0,
          outBufferSlot: 1,
          format: { components: 2, elementType: "f32" },
          policy: "perFrame",
        },
      };

      // Provide schedule with the step so slotMeta is extracted
      const program = {
        schedule: { steps: [step] },
      } as CompiledProgramIR;
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
      expect((bufferHandle as unknown as { kind: string }).kind).toBe("buffer");
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

      // Provide schedule with the step so slotMeta is extracted
      const program = {
        schedule: { steps: [step] },
      } as CompiledProgramIR;
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
          slots: [1, 2],
          mode: "value",
        },
      };

      const runtime = createRuntimeState({} as CompiledProgramIR);

      // Should not throw
      expect(() => {
        executeDebugProbe(step, runtime);
      }).not.toThrow();
    });

    it("no-ops when TraceController.mode is 'off'", async () => {
      // Import TraceController dynamically to reset it
      const { TraceController } = await import("../../../debug/TraceController");
      TraceController._resetForTesting();
      TraceController.instance.setMode('off');

      const initialWritePtr = TraceController.instance.valueRing.getWritePtr();

      const step: StepDebugProbe = {
        id: "debug-probe-2",
        kind: "debugProbe",
        deps: [],
        probe: {
          id: "probe-2",
          slots: [0],
          mode: "value",
        },
      };

      // Create a timeDerive step to ensure slot 0 gets allocated
      const timeStep = {
        id: "time-derive-1",
        kind: "timeDerive" as const,
        deps: [],
        tAbsMsSlot: 0,
        timeModel: { kind: "infinite" as const, windowMs: 10000 },
        out: { tModelMs: 1 },
      };

      // Setup minimal runtime with slot allocated via schedule
      const program = {
        schedule: { steps: [timeStep, step] },
      } as CompiledProgramIR;
      const runtime = createRuntimeState(program);
      runtime.values.write(0, 42);

      executeDebugProbe(step, runtime);

      // No values should have been written (mode is 'off')
      expect(TraceController.instance.valueRing.getWritePtr()).toBe(initialWritePtr);
    });

    it("writes to ValueRing when mode is 'full'", async () => {
      // Import TraceController dynamically to reset it
      const { TraceController } = await import("../../../debug/TraceController");
      TraceController._resetForTesting();
      TraceController.instance.setMode('full');

      const initialWritePtr = TraceController.instance.valueRing.getWritePtr();

      const step: StepDebugProbe = {
        id: "debug-probe-3",
        kind: "debugProbe",
        deps: [],
        probe: {
          id: "probe-3",
          slots: [0],
          mode: "value",
        },
      };

      // Create a timeDerive step to ensure slot 0 gets allocated
      const timeStep = {
        id: "time-derive-1",
        kind: "timeDerive" as const,
        deps: [],
        tAbsMsSlot: 0,
        timeModel: { kind: "infinite" as const, windowMs: 10000 },
        out: { tModelMs: 1 },
      };

      // Setup runtime with slot allocated via schedule
      const program = {
        schedule: { steps: [timeStep, step] },
      } as CompiledProgramIR;
      const runtime = createRuntimeState(program);
      runtime.values.write(0, 42.5);

      executeDebugProbe(step, runtime);

      // One value should have been written
      expect(TraceController.instance.valueRing.getWritePtr()).toBe(initialWritePtr + 1);

      // Reset mode to avoid affecting other tests
      TraceController.instance.setMode('off');
    });

    it("records values for multiple slots", async () => {
      // Import TraceController dynamically to reset it
      const { TraceController } = await import("../../../debug/TraceController");
      TraceController._resetForTesting();
      TraceController.instance.setMode('full');

      const initialWritePtr = TraceController.instance.valueRing.getWritePtr();

      const step: StepDebugProbe = {
        id: "debug-probe-4",
        kind: "debugProbe",
        deps: [],
        probe: {
          id: "probe-4",
          slots: [0, 1, 2],
          mode: "value",
        },
      };

      // Create a timeDerive step with multiple output slots
      const timeStep = {
        id: "time-derive-1",
        kind: "timeDerive" as const,
        deps: [],
        tAbsMsSlot: 0,
        timeModel: { kind: "cyclic" as const, periodMs: 1000, mode: "loop" as const, phaseDomain: "0..1" },
        out: { tModelMs: 1, phase01: 2 },
      };

      // Setup runtime with multiple slots allocated via schedule
      const program = {
        schedule: { steps: [timeStep, step] },
      } as CompiledProgramIR;
      const runtime = createRuntimeState(program);
      runtime.values.write(0, 1.0);
      runtime.values.write(1, 0.5);
      runtime.values.write(2, 0.75);

      executeDebugProbe(step, runtime);

      // Three values should have been written
      expect(TraceController.instance.valueRing.getWritePtr()).toBe(initialWritePtr + 3);

      // Reset mode to avoid affecting other tests
      TraceController.instance.setMode('off');
    });
  });
});
