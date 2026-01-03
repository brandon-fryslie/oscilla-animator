/**
 * RuntimeState.hotSwap() Tests
 *
 * Tests for hot-swap method on RuntimeState that preserves state/time continuity.
 *
 * References:
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §9
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-102151.md §2B
 */

import { describe, it, expect } from "vitest";
import { createRuntimeState } from "../RuntimeState";
import type { CompiledProgramIR, StateLayout } from "../../../compiler/ir";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a minimal test program for state hot-swap testing.
 */
function createTestProgram(stateLayout: StateLayout, seed = 42): CompiledProgramIR {
  return {
    irVersion: 1,
    patchId: "test-patch",
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
      json: [42.0, 100.0],
    },
    stateLayout,
    // Signal and field expr tables must have non-zero length for cache tests
    signalExprs: {
      nodes: [{ kind: "const", constId: 0, type: { world: "signal", domain: "float", category: "core", busEligible: true } }],
    },
    fieldExprs: {
      nodes: [{ kind: "const", constId: 0, type: { world: "field", domain: "float", category: "core", busEligible: true } }],
    },
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
    meta: {
      sourceMap: {},
      names: { nodes: {}, buses: {}, steps: {} },
    },
  } as unknown as CompiledProgramIR;
}

// ============================================================================
// RuntimeState.hotSwap() Tests
// ============================================================================

describe("RuntimeState.hotSwap()", () => {
  describe("State Preservation", () => {
    it("preserves matching state cells", () => {
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

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);

      // Mutate old state
      oldRuntime.state.f64[0] = 99.5;

      // Hot-swap
      const newRuntime = oldRuntime.hotSwap(newProgram);

      // State should be preserved
      expect(newRuntime.state.f64[0]).toBe(99.5);
    });

    it("initializes new state cells with defaults", () => {
      const oldLayout: StateLayout = {
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

      const newLayout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
          },
          {
            stateId: "state-2",
            storage: "f64",
            offset: 1,
            size: 1,
            nodeId: "node-2",
            role: "value",
            initialConstId: 0, // 42.0
          },
        ],
        f64Size: 2,
        f32Size: 0,
        i32Size: 0,
      };

      const oldProgram = createTestProgram(oldLayout, 1);
      const newProgram = createTestProgram(newLayout, 2);

      const oldRuntime = createRuntimeState(oldProgram);
      oldRuntime.state.f64[0] = 77.7;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // Existing cell preserved
      expect(newRuntime.state.f64[0]).toBe(77.7);
      // New cell initialized
      expect(newRuntime.state.f64[1]).toBe(42.0);
    });

    it("drops removed state cells without error", () => {
      const oldLayout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "value",
          },
          {
            stateId: "state-2",
            storage: "f64",
            offset: 1,
            size: 1,
            nodeId: "node-2",
            role: "value",
          },
        ],
        f64Size: 2,
        f32Size: 0,
        i32Size: 0,
      };

      const newLayout: StateLayout = {
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

      const oldProgram = createTestProgram(oldLayout, 1);
      const newProgram = createTestProgram(newLayout, 2);

      const oldRuntime = createRuntimeState(oldProgram);
      oldRuntime.state.f64[0] = 11.1;
      oldRuntime.state.f64[1] = 22.2;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // Kept cell preserved
      expect(newRuntime.state.f64[0]).toBe(11.1);
      // Removed cell dropped
      expect(newRuntime.state.f64.length).toBe(1);
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

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);

      // Simulate some frames
      oldRuntime.frameId = 42;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // frameId should be preserved
      expect(newRuntime.frameId).toBe(42);
    });

    it("preserves FrameCache.frameId across swap", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);

      // Simulate some frames
      oldRuntime.frameCache.frameId = 100;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // FrameCache.frameId should be preserved
      expect(newRuntime.frameCache.frameId).toBe(100);
    });
  });

  describe("Cache Invalidation", () => {
    it("invalidates signal cache stamps", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);

      // Populate signal cache
      oldRuntime.frameCache.sigValue[0] = 1.23;
      oldRuntime.frameCache.sigStamp[0] = 5;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // Signal stamps should be invalidated (zeroed)
      expect(newRuntime.frameCache.sigStamp[0]).toBe(0);
      // Values are NOT cleared (stale values persist until overwritten)
      // This is intentional - stamps determine validity, not value clearing
    });

    it("invalidates field cache stamps", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);

      // Populate field cache
      oldRuntime.frameCache.fieldStamp[0] = 10;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // Field stamps should be invalidated (zeroed)
      expect(newRuntime.frameCache.fieldStamp[0]).toBe(0);
    });

    it("clears field buffer pool", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);

      // Populate buffer pool
      const testBuffer = new Float32Array([1, 2, 3]);
      oldRuntime.frameCache.fieldBuffers.set("buffer-1", testBuffer);

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // Buffer pool should be cleared
      expect(newRuntime.frameCache.fieldBuffers.size).toBe(0);
    });
  });

  describe("Return Value", () => {
    it("returns a new RuntimeState instance", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);
      const newRuntime = oldRuntime.hotSwap(newProgram);

      // Should be a different instance
      expect(newRuntime).not.toBe(oldRuntime);
      expect(newRuntime.values).not.toBe(oldRuntime.values);
      expect(newRuntime.state).not.toBe(oldRuntime.state);
      expect(newRuntime.frameCache).not.toBe(oldRuntime.frameCache);
    });

    it("new runtime is fully functional", () => {
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

      const oldProgram = createTestProgram(layout, 1);
      const newProgram = createTestProgram(layout, 2);

      const oldRuntime = createRuntimeState(oldProgram);
      oldRuntime.state.f64[0] = 50.0;

      const newRuntime = oldRuntime.hotSwap(newProgram);

      // New runtime should be fully functional
      // State preserved
      expect(newRuntime.state.f64[0]).toBe(50.0);

      // Can mutate state
      newRuntime.state.f64[0] = 60.0;
      expect(newRuntime.state.f64[0]).toBe(60.0);

      // Old runtime unchanged
      expect(oldRuntime.state.f64[0]).toBe(50.0);
    });
  });

  describe("Integration", () => {
    it("multiple swaps preserve state correctly", () => {
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

      const program1 = createTestProgram(layout, 1);
      const program2 = createTestProgram(layout, 2);
      const program3 = createTestProgram(layout, 3);

      let runtime = createRuntimeState(program1);
      runtime.state.f64[0] = 10.0;

      // First swap
      runtime = runtime.hotSwap(program2);
      expect(runtime.state.f64[0]).toBe(10.0);

      // Mutate
      runtime.state.f64[0] = 20.0;

      // Second swap
      runtime = runtime.hotSwap(program3);
      expect(runtime.state.f64[0]).toBe(20.0);
    });
  });
});
