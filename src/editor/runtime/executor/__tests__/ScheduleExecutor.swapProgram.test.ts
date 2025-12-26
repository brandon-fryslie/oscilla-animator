/**
 * ScheduleExecutor.swapProgram() Tests
 *
 * Tests for swapProgram method that enables hot-swap during execution.
 *
 * References:
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §9
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-102151.md §2C
 */

import { describe, it, expect } from "vitest";
import { ScheduleExecutor } from "../ScheduleExecutor";
import { createRuntimeState } from "../RuntimeState";
import type { CompiledProgramIR, StateLayout, StepIR } from "../../../compiler/ir";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create minimal program for testing
 */
function createTestProgram(
  stateLayout: StateLayout,
  steps: StepIR[] = [],
  seed = 42
): CompiledProgramIR {
  return {
    irVersion: 1,
    patchId: "test-patch",
    patchRevision: 1,
    compileId: `test-compile-${seed}`,
    seed,
    timeModel: { kind: "infinite", windowMs: 10000 },
    types: { typeIds: [] },
    nodes: { nodes: [] },
    buses: { buses: [] },
    lenses: { lenses: [] },
    adapters: { adapters: [] },
    fields: { nodes: [] },
    constants: {
      json: [],
      f64: new Float64Array([42.0]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [{ k: "f64", idx: 0 }],
    },
    stateLayout,
    schedule: {
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
    },
    outputs: [],
    meta: {
      sourceMap: {},
      names: { nodes: {}, buses: {}, steps: {} },
    },
  };
}

// ============================================================================
// ScheduleExecutor.swapProgram() Tests
// ============================================================================

describe("ScheduleExecutor.swapProgram()", () => {
  describe("Basic Swap Functionality", () => {
    it("swaps program without error", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const program1 = createTestProgram(layout, [], 1);
      const program2 = createTestProgram(layout, [], 2);

      const executor = new ScheduleExecutor();
      const runtime = createRuntimeState(program1);

      expect(() => {
        executor.swapProgram(program2, runtime);
      }).not.toThrow();
    });

    it("returns updated runtime", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const program1 = createTestProgram(layout, [], 1);
      const program2 = createTestProgram(layout, [], 2);

      const executor = new ScheduleExecutor();
      const oldRuntime = createRuntimeState(program1);

      const newRuntime = executor.swapProgram(program2, oldRuntime);

      // Should return a new runtime
      expect(newRuntime).toBeDefined();
      expect(newRuntime).not.toBe(oldRuntime);
    });
  });

  describe("State Continuity", () => {
    it("preserves state across executeFrame calls", () => {
      const layout: StateLayout = {
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

      const steps: StepIR[] = [
        {
          id: "step-time",
          kind: "timeDerive",
          tAbsMsSlot: 0,
          timeModel: { kind: "infinite", windowMs: 10000 },
          out: { tModelMs: 1 },
        },
      ];

      const program1 = createTestProgram(layout, steps, 1);
      const program2 = createTestProgram(layout, steps, 2);

      const executor = new ScheduleExecutor();
      let runtime = createRuntimeState(program1);

      // Execute frame with program1
      executor.executeFrame(program1, runtime, 100);

      // Mutate state
      runtime.state.f64[0] = 77.7;

      // Swap to program2
      runtime = executor.swapProgram(program2, runtime);

      // State should be preserved
      expect(runtime.state.f64[0]).toBe(77.7);

      // Execute frame with program2 - state still preserved
      executor.executeFrame(program2, runtime, 200);
      expect(runtime.state.f64[0]).toBe(77.7);
    });

    it("mid-execution swap preserves state", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "value",
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const steps: StepIR[] = [
        {
          id: "step-time",
          kind: "timeDerive",
          tAbsMsSlot: 0,
          timeModel: { kind: "infinite", windowMs: 10000 },
          out: { tModelMs: 1 },
        },
      ];

      const program1 = createTestProgram(layout, steps, 1);
      const program2 = createTestProgram(layout, steps, 2);
      const program3 = createTestProgram(layout, steps, 3);

      const executor = new ScheduleExecutor();
      let runtime = createRuntimeState(program1);

      // Frame 1 with program1
      executor.executeFrame(program1, runtime, 0);
      runtime.state.f64[0] = 10.0;

      // Frame 2 with program2 (swapped)
      runtime = executor.swapProgram(program2, runtime);
      executor.executeFrame(program2, runtime, 16.67);
      expect(runtime.state.f64[0]).toBe(10.0);

      // Frame 3 with program3 (swapped again)
      runtime = executor.swapProgram(program3, runtime);
      executor.executeFrame(program3, runtime, 33.33);
      expect(runtime.state.f64[0]).toBe(10.0);
    });
  });

  describe("Frame ID Continuity", () => {
    it("preserves frameId across swap", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const program1 = createTestProgram(layout, [], 1);
      const program2 = createTestProgram(layout, [], 2);

      const executor = new ScheduleExecutor();
      let runtime = createRuntimeState(program1);

      // Execute a few frames
      executor.executeFrame(program1, runtime, 0);
      executor.executeFrame(program1, runtime, 16.67);
      executor.executeFrame(program1, runtime, 33.33);

      const frameIdBeforeSwap = runtime.frameId;

      // Swap
      runtime = executor.swapProgram(program2, runtime);

      // frameId should be preserved
      expect(runtime.frameId).toBe(frameIdBeforeSwap);
    });

    it("frameId continues incrementing after swap", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const program1 = createTestProgram(layout, [], 1);
      const program2 = createTestProgram(layout, [], 2);

      const executor = new ScheduleExecutor();
      let runtime = createRuntimeState(program1);

      // Execute frames with program1
      executor.executeFrame(program1, runtime, 0); // frameId = 1
      executor.executeFrame(program1, runtime, 16.67); // frameId = 2

      // Swap
      runtime = executor.swapProgram(program2, runtime); // frameId = 2 (preserved)

      // Execute frames with program2
      executor.executeFrame(program2, runtime, 33.33); // frameId = 3
      executor.executeFrame(program2, runtime, 50); // frameId = 4

      expect(runtime.frameId).toBe(4);
    });
  });

  describe("Integration with executeFrame", () => {
    it("swap between frames works correctly", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const steps: StepIR[] = [
        {
          id: "step-time",
          kind: "timeDerive",
          tAbsMsSlot: 0,
          timeModel: { kind: "infinite", windowMs: 10000 },
          out: { tModelMs: 1 },
        },
      ];

      const program1 = createTestProgram(layout, steps, 1);
      const program2 = createTestProgram(layout, steps, 2);

      const executor = new ScheduleExecutor();
      let runtime = createRuntimeState(program1);

      // Execute frame sequence: program1, swap, program2, program2
      executor.executeFrame(program1, runtime, 0);
      expect(runtime.frameId).toBe(1);

      runtime = executor.swapProgram(program2, runtime);
      executor.executeFrame(program2, runtime, 16.67);
      expect(runtime.frameId).toBe(2);

      executor.executeFrame(program2, runtime, 33.33);
      expect(runtime.frameId).toBe(3);
    });
  });
});
