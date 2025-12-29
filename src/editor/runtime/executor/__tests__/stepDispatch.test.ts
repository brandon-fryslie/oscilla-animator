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
import { executeNodeEval } from "../steps/executeNodeEval";
import { executeBusEval } from "../steps/executeBusEval";
import { executeMaterialize } from "../steps/executeMaterialize";
import { executeRenderAssemble } from "../steps/executeRenderAssemble";
import { executeDebugProbe } from "../steps/executeDebugProbe";
import type {
  StepNodeEval,
  StepBusEval,
  StepMaterialize,
  StepRenderAssemble,
  StepDebugProbe,
  CompiledProgramIR,
} from "../../../compiler/ir";
import { createRuntimeState } from "../RuntimeState";
import { OpCode } from "../../../compiler/ir/opcodes";

/**
 * Create minimal program IR for testing.
 * Includes all required tables (fields, signalTable, constants).
 */
function createMinimalProgram(steps: unknown[] = []): CompiledProgramIR {
  return {
    schedule: { steps },
    // Minimal field expression table - single const node
    fields: {
      nodes: [
        {
          kind: "const",
          type: { world: "field", domain: "float" },
          constId: 0,
        },
      ],
    },
    // Minimal signal expression table
    signalTable: {
      nodes: [],
    },
    // Minimal constant pool
    constants: {
      json: [42], // const value for field node
      f64: new Float64Array([42.0]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [{ k: "f64", idx: 0 }],
    },
    // Minimal bus table
    buses: {
      buses: [],
    },
  } as unknown as CompiledProgramIR;
}

// Note: Test programs use type casting to CompiledProgramIR
// This allows minimal test data while satisfying the type system

describe("Step Dispatch", () => {
  describe("executeNodeEval", () => {
    it("does not throw when called", () => {
      const step: StepNodeEval = {
        id: "node-eval-1",
        kind: "nodeEval",
        deps: [],
        nodeIndex: 0,
        outputSlots: [0],
        inputSlots: [],
        phase: "postBus",
      };

      const baseProgram = createMinimalProgram([step]);
      // Override nodes to provide a stub node
      const program = {
        ...baseProgram,
        nodes: {
          nodes: [
            {
              id: "stub-node-0",
              typeId: 0,
              inputCount: 0,
              outputCount: 1,
              opcodeId: OpCode.Const,
              compilerTag: 0, // constId = 0 -> f64[0] = 42.0
            },
          ],
        },
        constants: {
          json: [42],
          f64: new Float64Array([42.0]),
          f32: new Float32Array([]),
          i32: new Int32Array([]),
          constIndex: [{ k: "f64", idx: 0 }],
        },
      } as unknown as CompiledProgramIR;

      const runtime = createRuntimeState(program);

      // Should not throw (stub opcode)
      expect(() => {
        executeNodeEval(step, program, runtime);
      }).not.toThrow();

      // Verify output was written
      expect(runtime.values.read(0)).toBe(42);
    });
  });

  describe("executeBusEval", () => {
    it("does not throw when called", () => {
      const step: StepBusEval = {
        id: "bus-eval-1",
        kind: "busEval",
        deps: [],
        busIndex: 0,
        busType: { world: "signal", domain: "float" },
        outSlot: 1,
        publishers: [],
        combine: { mode: "last" },
        silent: { kind: "const", constId: 0 },
      };

      const baseProgram = createMinimalProgram([step]);
      // Override buses to provide a stub bus
      const program = {
        ...baseProgram,
        buses: {
          buses: [
            {
              id: "stub-bus-0",
              typeId: 0,
              inputCount: 0,
            },
          ],
        },
        // Ensure constants are present
        constants: {
          json: [0],
          f64: new Float64Array([0]),
          f32: new Float32Array([]),
          i32: new Int32Array([]),
          constIndex: [{ k: "f64", idx: 0 }],
        },
      } as unknown as CompiledProgramIR;

      const runtime = createRuntimeState(program);

      // Should not throw (bus stub returns 0)
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
          fieldExprId: "0", // Use index 0 (the only field node in the array)
          domainSlot: 0,
          outBufferSlot: 1,
          format: { components: 2, elementType: "f32" },
          policy: "perFrame",
        },
      };

      const program = createMinimalProgram([step]);
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

      const program = createMinimalProgram([step]);
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

      const program = createMinimalProgram([step]);
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
