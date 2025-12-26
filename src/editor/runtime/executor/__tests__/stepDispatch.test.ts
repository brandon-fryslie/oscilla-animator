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
        nodeIndex: 0,
        inputSlots: [],
        outputSlots: [],
        phase: "preBus",
      };

      const program = {} as CompiledProgramIR;
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

      // Should not throw (stub writes empty buffer)
      expect(() => {
        executeMaterialize(step, program, runtime);
      }).not.toThrow();

      // Verify buffer handle was written
      const bufferHandle = runtime.values.read(1);
      expect(bufferHandle).toBeDefined();
      expect((bufferHandle as any).kind).toBe("buffer");
    });
  });

  describe("executeRenderAssemble", () => {
    it("does not throw when called", () => {
      const step: StepRenderAssemble = {
        id: "render-assemble-1",
        kind: "renderAssemble",
        rootNodeIndex: 0,
        outSlot: 1,
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
        probe: {
          id: "probe-1",
          slots: [1, 2],
          mode: "value",
        },
      };

      const runtime = createRuntimeState({} as CompiledProgramIR);

      // Should not throw (stub is no-op)
      expect(() => {
        executeDebugProbe(step, runtime);
      }).not.toThrow();
    });
  });
});
