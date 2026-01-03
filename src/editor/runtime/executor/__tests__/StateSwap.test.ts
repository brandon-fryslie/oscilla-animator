/**
 * StateSwap Tests
 *
 * Tests for hot-swap state preservation across program recompilation.
 *
 * Tests the core algorithm for preserving state when swapping from
 * oldProgram → newProgram, matching state cells by stable keys.
 *
 * References:
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §9
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-102151.md §2A
 */

import { describe, it, expect } from "vitest";
import { preserveState, buildStableKeyMap } from "../StateSwap";
import { createRuntimeState } from "../RuntimeState";
import type { CompiledProgramIR, StateLayout } from "../../../compiler/ir";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create minimal program for testing
 */
function createTestProgram(stateLayout: StateLayout): CompiledProgramIR {
  return {
    irVersion: 1,
    patchId: "test-patch",
    seed: 42,
    timeModel: { kind: "infinite", windowMs: 10000 },
    types: { typeIds: [] },
    signalExprs: { nodes: [] },
    fieldExprs: { nodes: [] },
    eventExprs: { nodes: [] },
    constants: {
      json: [42.0, 100.0, 3.14],
    },
    stateLayout,
    slotMeta: [],
    render: { sinks: [] },
    cameras: { cameras: [], cameraIdToIndex: {} },
    meshes: { meshes: [], meshIdToIndex: {} },
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
    debugIndex: {
      stepToBlock: new Map<string, string>(),
      slotToBlock: new Map<number, string>(),
    },
  };
}

// ============================================================================
// StableKey Construction Tests
// ============================================================================

describe("StateSwap - buildStableKeyMap", () => {
  it("builds map for single state cell", () => {
    const stateLayout: StateLayout = {
      cells: [
        {
          stateId: "state-1",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "node-integrate-1",
          role: "accumulator",
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const map = buildStableKeyMap(stateLayout);

    expect(map.size).toBe(1);

    const key = "node-integrate-1:accumulator";
    expect(map.has(key)).toBe(true);

    const cell = map.get(key);
    expect(cell).toBeDefined();
    expect(cell?.stateId).toBe("state-1");
    expect(cell?.storage).toBe("f64");
    expect(cell?.offset).toBe(0);
    expect(cell?.size).toBe(1);
  });

  it("builds map for multiple state cells", () => {
    const stateLayout: StateLayout = {
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
          size: 8,
          nodeId: "node-2",
          role: "ringBuffer",
        },
        {
          stateId: "state-3",
          storage: "i32",
          offset: 0,
          size: 1,
          nodeId: "node-3",
          role: "counter",
        },
      ],
      f64Size: 9,
      f32Size: 0,
      i32Size: 1,
    };

    const map = buildStableKeyMap(stateLayout);

    expect(map.size).toBe(3);
    expect(map.has("node-1:accumulator")).toBe(true);
    expect(map.has("node-2:ringBuffer")).toBe(true);
    expect(map.has("node-3:counter")).toBe(true);
  });

  it("handles empty state layout", () => {
    const stateLayout: StateLayout = {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    };

    const map = buildStableKeyMap(stateLayout);

    expect(map.size).toBe(0);
  });

  it("creates unique keys for same role in different nodes", () => {
    const stateLayout: StateLayout = {
      cells: [
        {
          stateId: "state-1",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "integrate-1",
          role: "accumulator",
        },
        {
          stateId: "state-2",
          storage: "f64",
          offset: 1,
          size: 1,
          nodeId: "integrate-2",
          role: "accumulator",
        },
      ],
      f64Size: 2,
      f32Size: 0,
      i32Size: 0,
    };

    const map = buildStableKeyMap(stateLayout);

    expect(map.size).toBe(2);
    expect(map.get("integrate-1:accumulator")?.stateId).toBe("state-1");
    expect(map.get("integrate-2:accumulator")?.stateId).toBe("state-2");
  });
});

// ============================================================================
// State Preservation Tests - Matching Keys
// ============================================================================

describe("StateSwap - preserveState - Matching Keys", () => {
  it("preserves state for matching single cell", () => {
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
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    // Set old state value
    oldRuntime.state.f64[0] = 99.5;

    // Preserve state
    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // Verify state preserved
    expect(newRuntime.state.f64[0]).toBe(99.5);
  });

  it("preserves state for multiple matching cells", () => {
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
        {
          stateId: "state-3",
          storage: "i32",
          offset: 0,
          size: 1,
          nodeId: "node-3",
          role: "counter",
        },
      ],
      f64Size: 2,
      f32Size: 0,
      i32Size: 1,
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
        {
          stateId: "state-2",
          storage: "f64",
          offset: 1,
          size: 1,
          nodeId: "node-2",
          role: "value",
        },
        {
          stateId: "state-3",
          storage: "i32",
          offset: 0,
          size: 1,
          nodeId: "node-3",
          role: "counter",
        },
      ],
      f64Size: 2,
      f32Size: 0,
      i32Size: 1,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    // Set old state values
    oldRuntime.state.f64[0] = 1.1;
    oldRuntime.state.f64[1] = 2.2;
    oldRuntime.state.i32[0] = 42;

    // Preserve state
    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // Verify all states preserved
    expect(newRuntime.state.f64[0]).toBe(1.1);
    expect(newRuntime.state.f64[1]).toBe(2.2);
    expect(newRuntime.state.i32[0]).toBe(42);
  });

  it("preserves multi-element ring buffer state", () => {
    const oldLayout: StateLayout = {
      cells: [
        {
          stateId: "delay-buffer",
          storage: "f64",
          offset: 0,
          size: 4,
          nodeId: "delay-1",
          role: "ringBuffer",
        },
      ],
      f64Size: 4,
      f32Size: 0,
      i32Size: 0,
    };

    const newLayout: StateLayout = {
      cells: [
        {
          stateId: "delay-buffer",
          storage: "f64",
          offset: 0,
          size: 4,
          nodeId: "delay-1",
          role: "ringBuffer",
        },
      ],
      f64Size: 4,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    // Fill ring buffer with values
    oldRuntime.state.f64[0] = 10.0;
    oldRuntime.state.f64[1] = 20.0;
    oldRuntime.state.f64[2] = 30.0;
    oldRuntime.state.f64[3] = 40.0;

    // Preserve state
    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // Verify all buffer elements preserved
    expect(newRuntime.state.f64[0]).toBe(10.0);
    expect(newRuntime.state.f64[1]).toBe(20.0);
    expect(newRuntime.state.f64[2]).toBe(30.0);
    expect(newRuntime.state.f64[3]).toBe(40.0);
  });

  it("preserves state across different storage types", () => {
    const oldLayout: StateLayout = {
      cells: [
        {
          stateId: "s1",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "n1",
          role: "a",
        },
        {
          stateId: "s2",
          storage: "f32",
          offset: 0,
          size: 1,
          nodeId: "n2",
          role: "b",
        },
        {
          stateId: "s3",
          storage: "i32",
          offset: 0,
          size: 1,
          nodeId: "n3",
          role: "c",
        },
      ],
      f64Size: 1,
      f32Size: 1,
      i32Size: 1,
    };

    const newLayout = { ...oldLayout };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    oldRuntime.state.f64[0] = 1.1;
    oldRuntime.state.f32[0] = 2.2;
    oldRuntime.state.i32[0] = 33;

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    expect(newRuntime.state.f64[0]).toBe(1.1);
    expect(newRuntime.state.f32[0]).toBeCloseTo(2.2);
    expect(newRuntime.state.i32[0]).toBe(33);
  });
});

// ============================================================================
// State Preservation Tests - New Keys (Initialize with Defaults)
// ============================================================================

describe("StateSwap - preserveState - New Keys", () => {
  it("initializes new cell with default from const pool", () => {
    const oldLayout: StateLayout = {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    };

    const newLayout: StateLayout = {
      cells: [
        {
          stateId: "state-new",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "node-new",
          role: "accumulator",
          initialConstId: 0, // Should use const pool value 42.0
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // New cell should be initialized with const pool value
    expect(newRuntime.state.f64[0]).toBe(42.0);
  });

  it("initializes new cell with zero when no initialConstId", () => {
    const oldLayout: StateLayout = {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    };

    const newLayout: StateLayout = {
      cells: [
        {
          stateId: "state-new",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "node-new",
          role: "value",
          // No initialConstId - should default to zero
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    expect(newRuntime.state.f64[0]).toBe(0);
  });

  it("preserves existing cells and initializes new cells", () => {
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
          initialConstId: 1, // const pool value 100.0
        },
      ],
      f64Size: 2,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    oldRuntime.state.f64[0] = 77.7;

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // Existing cell preserved
    expect(newRuntime.state.f64[0]).toBe(77.7);
    // New cell initialized with const pool default
    expect(newRuntime.state.f64[1]).toBe(100.0);
  });

  it("initializes all elements of new multi-element cell", () => {
    const oldLayout: StateLayout = {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    };

    const newLayout: StateLayout = {
      cells: [
        {
          stateId: "buffer-new",
          storage: "f64",
          offset: 0,
          size: 3,
          nodeId: "delay-new",
          role: "ringBuffer",
          initialConstId: 2, // const pool value 3.14
        },
      ],
      f64Size: 3,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // All elements should be initialized with const pool value
    expect(newRuntime.state.f64[0]).toBe(3.14);
    expect(newRuntime.state.f64[1]).toBe(3.14);
    expect(newRuntime.state.f64[2]).toBe(3.14);
  });
});

// ============================================================================
// State Preservation Tests - Removed Keys (Drop Silently)
// ============================================================================

describe("StateSwap - preserveState - Removed Keys", () => {
  it("drops removed cell without error", () => {
    const oldLayout: StateLayout = {
      cells: [
        {
          stateId: "state-removed",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "node-removed",
          role: "value",
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const newLayout: StateLayout = {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    oldRuntime.state.f64[0] = 999.0;

    // Should not throw - removed cells are silently dropped
    expect(() => {
      preserveState(oldRuntime, newRuntime, oldProgram, newProgram);
    }).not.toThrow();

    // New runtime has no cells
    expect(newRuntime.state.f64.length).toBe(0);
  });

  it("preserves some cells and drops others", () => {
    const oldLayout: StateLayout = {
      cells: [
        {
          stateId: "state-keep",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "node-keep",
          role: "value",
        },
        {
          stateId: "state-remove",
          storage: "f64",
          offset: 1,
          size: 1,
          nodeId: "node-remove",
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
          stateId: "state-keep",
          storage: "f64",
          offset: 0,
          size: 1,
          nodeId: "node-keep",
          role: "value",
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    oldRuntime.state.f64[0] = 11.1;
    oldRuntime.state.f64[1] = 22.2; // This will be dropped

    expect(() => {
      preserveState(oldRuntime, newRuntime, oldProgram, newProgram);
    }).not.toThrow();

    // Kept cell preserved
    expect(newRuntime.state.f64[0]).toBe(11.1);
    // Removed cell not present in new runtime
    expect(newRuntime.state.f64.length).toBe(1);
  });
});

// ============================================================================
// State Preservation Tests - Layout Hash Mismatch (Re-initialize)
// ============================================================================

describe("StateSwap - preserveState - Layout Changes", () => {
  it("re-initializes cell when size changes (layout hash mismatch)", () => {
    const oldLayout: StateLayout = {
      cells: [
        {
          stateId: "state-1",
          storage: "f64",
          offset: 0,
          size: 2, // Old size: 2 elements
          nodeId: "delay-1",
          role: "ringBuffer",
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
          size: 4, // New size: 4 elements (layout changed)
          nodeId: "delay-1",
          role: "ringBuffer",
          initialConstId: 0, // Re-initialize with 42.0
        },
      ],
      f64Size: 4,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    oldRuntime.state.f64[0] = 10.0;
    oldRuntime.state.f64[1] = 20.0;

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // Size changed - should re-initialize, not preserve
    expect(newRuntime.state.f64[0]).toBe(42.0);
    expect(newRuntime.state.f64[1]).toBe(42.0);
    expect(newRuntime.state.f64[2]).toBe(42.0);
    expect(newRuntime.state.f64[3]).toBe(42.0);
  });

  it("re-initializes cell when storage type changes", () => {
    const oldLayout: StateLayout = {
      cells: [
        {
          stateId: "state-1",
          storage: "f32", // Old storage: f32
          offset: 0,
          size: 1,
          nodeId: "node-1",
          role: "value",
        },
      ],
      f64Size: 0,
      f32Size: 1,
      i32Size: 0,
    };

    const newLayout: StateLayout = {
      cells: [
        {
          stateId: "state-1",
          storage: "f64", // New storage: f64 (layout changed)
          offset: 0,
          size: 1,
          nodeId: "node-1",
          role: "value",
          initialConstId: 0, // Re-initialize with 42.0
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    };

    const oldProgram = createTestProgram(oldLayout);
    const newProgram = createTestProgram(newLayout);

    const oldRuntime = createRuntimeState(oldProgram);
    const newRuntime = createRuntimeState(newProgram);

    oldRuntime.state.f32[0] = 99.9;

    preserveState(oldRuntime, newRuntime, oldProgram, newProgram);

    // Storage type changed - should re-initialize
    expect(newRuntime.state.f64[0]).toBe(42.0);
  });
});
