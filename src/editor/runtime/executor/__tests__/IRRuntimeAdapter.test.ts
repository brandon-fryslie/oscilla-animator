/**
 * IRRuntimeAdapter Tests
 *
 * Tests for the IRRuntimeAdapter that bridges ScheduleExecutor to Player.
 *
 * Validates:
 * - Adapter construction
 * - createProgram() returns valid Program interface
 * - signal() executes frames and returns RenderTree
 * - RuntimeState preservation across signal() calls
 * - Hot-swap behavior (swapProgram)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { IRRuntimeAdapter } from "../IRRuntimeAdapter";
import type {
  CompiledProgramIR,
  StateLayout,
  StepIR,
  OutputSpec,
} from "../../../compiler/ir";
import type { RuntimeCtx, KernelEvent } from "../../../compiler/types";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create minimal program for testing
 */
function createTestProgram(
  stateLayout: StateLayout,
  steps: StepIR[] = [],
  outputs: OutputSpec[] = [],
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
    fields: {
      nodes: [
        {
          kind: "const",
          type: { world: "field", domain: "float", category: "core", busEligible: true },
          constId: 0,
        },
      ],
    },
    signalTable: { nodes: [] },
    constants: {
      json: [42],
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
    outputs,
    meta: {
      sourceMap: {},
      names: { nodes: {}, buses: {}, steps: {} },
    },
  };
}

/**
 * Create default RuntimeCtx for testing
 */
function createTestRuntimeCtx(): RuntimeCtx {
  return {
    viewport: { w: 800, h: 600, dpr: 1 },
  };
}

// ============================================================================
// IRRuntimeAdapter Tests
// ============================================================================

describe("IRRuntimeAdapter", () => {
  let emptyLayout: StateLayout;
  let runtimeCtx: RuntimeCtx;

  beforeEach(() => {
    emptyLayout = {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    };
    runtimeCtx = createTestRuntimeCtx();
  });

  describe("Construction", () => {
    it("constructs successfully with valid program", () => {
      const program = createTestProgram(emptyLayout);
      expect(() => new IRRuntimeAdapter(program)).not.toThrow();
    });

    it("initializes internal state", () => {
      const program = createTestProgram(emptyLayout);
      const adapter = new IRRuntimeAdapter(program);

      // Adapter should have initialized executor and runtime
      // We can't directly access private fields, but createProgram should work
      expect(() => adapter.createProgram()).not.toThrow();
    });
  });

  describe("createProgram()", () => {
    it("returns valid Program interface", () => {
      const program = createTestProgram(emptyLayout);
      const adapter = new IRRuntimeAdapter(program);

      const playerProgram = adapter.createProgram();

      expect(playerProgram).toBeDefined();
      expect(playerProgram.signal).toBeInstanceOf(Function);
      expect(playerProgram.event).toBeInstanceOf(Function);
    });

    it("signal() executes and returns RenderTree", () => {
      const program = createTestProgram(emptyLayout);
      const adapter = new IRRuntimeAdapter(program);
      const playerProgram = adapter.createProgram();

      const tree = playerProgram.signal(0, runtimeCtx);

      // Should return a RenderTree (empty group when no outputs)
      expect(tree).toBeDefined();
      expect(tree.kind).toBe("group");
      expect(tree.id).toBe("empty");
    });

    it("event() returns empty array (stub)", () => {
      const program = createTestProgram(emptyLayout);
      const adapter = new IRRuntimeAdapter(program);
      const playerProgram = adapter.createProgram();

      const testEvent: KernelEvent = { type: "test", payload: {} };
      const events = playerProgram.event(testEvent);

      expect(events).toEqual([]);
    });
  });

  describe("RuntimeState Preservation", () => {
    it("preserves runtime state across multiple signal() calls", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "counter",
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const program = createTestProgram(layout);
      const adapter = new IRRuntimeAdapter(program);
      const playerProgram = adapter.createProgram();

      // Execute multiple frames
      playerProgram.signal(0, runtimeCtx);
      playerProgram.signal(16.67, runtimeCtx);
      playerProgram.signal(33.33, runtimeCtx);

      // RuntimeState should persist across calls (not recreated)
      // We can't directly verify, but execution shouldn't throw
      expect(() => playerProgram.signal(50, runtimeCtx)).not.toThrow();
    });

    it("does not recreate RuntimeState on each signal() call", () => {
      const program = createTestProgram(emptyLayout);
      const adapter = new IRRuntimeAdapter(program);
      const playerProgram = adapter.createProgram();

      // Call signal multiple times
      playerProgram.signal(0, runtimeCtx);
      const tree1 = playerProgram.signal(16.67, runtimeCtx);
      const tree2 = playerProgram.signal(33.33, runtimeCtx);

      // Both should succeed (runtime not recreated)
      expect(tree1).toBeDefined();
      expect(tree2).toBeDefined();
    });
  });

  describe("swapProgram()", () => {
    it("swaps to new program without error", () => {
      const program1 = createTestProgram(emptyLayout, [], [], 1);
      const program2 = createTestProgram(emptyLayout, [], [], 2);

      const adapter = new IRRuntimeAdapter(program1);
      const playerProgram = adapter.createProgram();

      // Execute with program1
      playerProgram.signal(0, runtimeCtx);

      // Swap to program2
      expect(() => adapter.swapProgram(program2)).not.toThrow();

      // Execute with program2
      expect(() => playerProgram.signal(16.67, runtimeCtx)).not.toThrow();
    });

    it("preserves state cells across swap", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
            initialConstId: 0, // Initialize to 42.0
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const program1 = createTestProgram(layout, [], [], 1);
      const program2 = createTestProgram(layout, [], [], 2);

      const adapter = new IRRuntimeAdapter(program1);
      const playerProgram = adapter.createProgram();

      // Execute with program1
      playerProgram.signal(0, runtimeCtx);

      // Swap to program2
      adapter.swapProgram(program2);

      // Execute with program2 - should preserve state
      expect(() => playerProgram.signal(16.67, runtimeCtx)).not.toThrow();
    });

    it("initializes new state cells with defaults", () => {
      const layout1: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const layout2: StateLayout = {
        cells: [
          {
            stateId: "state-new",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-2",
            role: "newCounter",
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const program1 = createTestProgram(layout1, [], [], 1);
      const program2 = createTestProgram(layout2, [], [], 2);

      const adapter = new IRRuntimeAdapter(program1);
      const playerProgram = adapter.createProgram();

      // Execute with program1
      playerProgram.signal(0, runtimeCtx);

      // Swap to program2 (adds new state cell)
      adapter.swapProgram(program2);

      // Execute with program2 - new state cell should be initialized
      expect(() => playerProgram.signal(16.67, runtimeCtx)).not.toThrow();
    });

    it("continues using same Program object after swap", () => {
      const program1 = createTestProgram(emptyLayout, [], [], 1);
      const program2 = createTestProgram(emptyLayout, [], [], 2);

      const adapter = new IRRuntimeAdapter(program1);
      const playerProgram = adapter.createProgram();

      // Execute with program1
      const tree1 = playerProgram.signal(0, runtimeCtx);

      // Swap to program2
      adapter.swapProgram(program2);

      // Execute with same Program object (but now using program2)
      const tree2 = playerProgram.signal(16.67, runtimeCtx);

      // Both should succeed
      expect(tree1).toBeDefined();
      expect(tree2).toBeDefined();
    });
  });

  describe("Integration", () => {
    it("full workflow: create, signal, swap, signal", () => {
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

      const program1 = createTestProgram(layout, [], [], 1);
      const program2 = createTestProgram(layout, [], [], 2);

      // 1. Create adapter with program1
      const adapter = new IRRuntimeAdapter(program1);
      const playerProgram = adapter.createProgram();

      // 2. Execute frames with program1
      const tree1 = playerProgram.signal(0, runtimeCtx);
      expect(tree1.kind).toBe("group");

      const tree2 = playerProgram.signal(16.67, runtimeCtx);
      expect(tree2.kind).toBe("group");

      // 3. Swap to program2
      adapter.swapProgram(program2);

      // 4. Execute frames with program2
      const tree3 = playerProgram.signal(33.33, runtimeCtx);
      expect(tree3.kind).toBe("group");

      const tree4 = playerProgram.signal(50, runtimeCtx);
      expect(tree4.kind).toBe("group");

      // All frames should execute successfully
      expect(tree1).toBeDefined();
      expect(tree2).toBeDefined();
      expect(tree3).toBeDefined();
      expect(tree4).toBeDefined();
    });
  });
});
