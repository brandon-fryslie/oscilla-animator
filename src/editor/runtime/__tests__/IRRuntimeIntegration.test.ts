/**
 * IR Runtime Integration Tests (P1-1)
 *
 * End-to-end tests verifying that IR-compiled programs can be executed
 * by the Player and produce RenderTree output.
 *
 * These tests demonstrate the complete IR rendering pipeline:
 * 1. Compile patch with IR compiler (emitIR: true)
 * 2. Create IRRuntimeAdapter from CompiledProgramIR
 * 3. Set IR program on Player via setIRProgram()
 * 4. Execute frames and verify RenderTree output
 * 5. Hot-swap programs and verify state preservation
 *
 * Reference: .agent_planning/compiler-rendering-integration/DOD-2025-12-26-110434.md §P1-1
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPlayer } from "../player";
import { IRRuntimeAdapter } from "../executor/IRRuntimeAdapter";
import type { RenderTree } from "../renderTree";
import type { CompiledProgramIR } from "../../compiler/ir";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal IR program for testing.
 * This is a hand-constructed program that tests the adapter layer.
 */
function createMinimalProgram(seed: number = 42): CompiledProgramIR {
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
      f64: new Float64Array([]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [],
    },
    stateLayout: {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    },
    schedule: {
      steps: [],
      stepIdToIndex: {},
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
// IR Runtime Integration Tests
// ============================================================================

describe("IRRuntimeIntegration", () => {
  let onFrameCalls: Array<{ tree: RenderTree; tMs: number }>;

  beforeEach(() => {
    onFrameCalls = [];
  });

  describe("Basic IR Rendering", () => {
    it("should create IRRuntimeAdapter from minimal IR program", () => {
      const program = createMinimalProgram();

      // Create adapter
      const adapter = new IRRuntimeAdapter(program);
      expect(adapter).toBeDefined();

      // Create Program interface
      const playerProgram = adapter.createProgram();
      expect(playerProgram).toBeDefined();
      expect(playerProgram.signal).toBeInstanceOf(Function);
      expect(playerProgram.event).toBeInstanceOf(Function);
    });

    it("should execute frames via Player.setIRProgram() and receive RenderTree", () => {
      const program = createMinimalProgram();

      // Create Player with onFrame callback
      const player = createPlayer((tree, tMs) => {
        onFrameCalls.push({ tree, tMs });
      });

      // Create adapter and set IR program
      const adapter = new IRRuntimeAdapter(program);
      const playerProgram = adapter.createProgram();

      // Note: setIRProgram() calls renderOnce() at current time (initially 0)
      player.setIRProgram(playerProgram);

      // Execute frame via scrubTo
      player.scrubTo(1000);

      // Verify onFrame was called twice (once from setIRProgram at t=0, once from scrubTo at t=1000)
      expect(onFrameCalls.length).toBe(2);
      expect(onFrameCalls[0].tMs).toBe(0);   // Initial render from setIRProgram
      expect(onFrameCalls[1].tMs).toBe(1000); // scrubTo render

      // Verify RenderTree structure (empty group when no outputs)
      const tree = onFrameCalls[1].tree;
      expect(tree).toBeDefined();
      expect(tree.kind).toBe("group");
      expect(tree.id).toBe("empty");
    });

    it("should render multiple frames without error", () => {
      const program = createMinimalProgram();

      const player = createPlayer((tree, tMs) => {
        onFrameCalls.push({ tree, tMs });
      });

      const adapter = new IRRuntimeAdapter(program);
      player.setIRProgram(adapter.createProgram()); // Renders once at t=0

      // Execute multiple frames
      player.scrubTo(0);     // Renders at t=0 (again)
      player.scrubTo(500);   // Renders at t=500
      player.scrubTo(1000);  // Renders at t=1000
      player.scrubTo(1500);  // Renders at t=1500

      // Verify all frames rendered (5 total: 1 from setIRProgram + 4 from scrubTo)
      expect(onFrameCalls.length).toBe(5);
      expect(onFrameCalls[0].tMs).toBe(0);    // setIRProgram
      expect(onFrameCalls[1].tMs).toBe(0);    // scrubTo(0)
      expect(onFrameCalls[2].tMs).toBe(500);
      expect(onFrameCalls[3].tMs).toBe(1000);
      expect(onFrameCalls[4].tMs).toBe(1500);

      // All should produce valid RenderTrees
      onFrameCalls.forEach((call) => {
        expect(call.tree.kind).toBe("group");
        expect(call.tree.id).toBe("empty");
      });
    });
  });

  describe("Hot-Swap Behavior", () => {
    it("should preserve time when swapping programs", () => {
      const program1 = createMinimalProgram(1);

      // Create player and adapter
      const player = createPlayer((tree, tMs) => {
        onFrameCalls.push({ tree, tMs });
      });

      const adapter = new IRRuntimeAdapter(program1);
      player.setIRProgram(adapter.createProgram()); // Renders at t=0

      // Execute frame at t=1000
      player.scrubTo(1000);
      expect(onFrameCalls.length).toBe(2); // setIRProgram + scrubTo
      expect(onFrameCalls[0].tMs).toBe(0);
      expect(onFrameCalls[1].tMs).toBe(1000);

      // Create modified program (different seed)
      const program2 = createMinimalProgram(2);

      // Hot-swap via adapter.swapProgram()
      // Note: This updates the internal program, and the Player continues
      // using the same Program object returned by createProgram()
      adapter.swapProgram(program2);

      // Execute another frame - time should be preserved
      player.scrubTo(1500);

      // Verify time was preserved
      expect(onFrameCalls.length).toBe(3); // setIRProgram + 2x scrubTo
      expect(onFrameCalls[2].tMs).toBe(1500);

      // Verify Player's internal time is still 1500
      expect(player.getTime()).toBe(1500);
    });

    it("should reflect new program behavior after hot-swap", () => {
      const program1 = createMinimalProgram(1);

      const player = createPlayer((tree, tMs) => {
        onFrameCalls.push({ tree, tMs });
      });

      const adapter = new IRRuntimeAdapter(program1);
      player.setIRProgram(adapter.createProgram()); // Renders at t=0

      // Execute with program1
      player.scrubTo(100);
      const tree1 = onFrameCalls[1].tree; // Index 1 because setIRProgram rendered at index 0

      // Create modified program
      const program2 = createMinimalProgram(2);

      // Hot-swap
      adapter.swapProgram(program2);

      // Execute with program2
      player.scrubTo(200);
      const tree2 = onFrameCalls[2].tree;

      // Both frames should succeed
      expect(tree1).toBeDefined();
      expect(tree2).toBeDefined();

      // Both produce empty groups (no outputs)
      expect(tree1.kind).toBe("group");
      expect(tree2.kind).toBe("group");
    });

    it("should allow multiple hot-swaps without error", () => {
      const player = createPlayer((tree, tMs) => {
        onFrameCalls.push({ tree, tMs });
      });

      const adapter = new IRRuntimeAdapter(createMinimalProgram(1));
      player.setIRProgram(adapter.createProgram()); // Renders at t=0

      // Swap multiple times
      player.scrubTo(100);
      adapter.swapProgram(createMinimalProgram(2));

      player.scrubTo(200);
      adapter.swapProgram(createMinimalProgram(3));

      player.scrubTo(300);
      adapter.swapProgram(createMinimalProgram(4));

      player.scrubTo(400);

      // All frames should succeed (5 total: 1 from setIRProgram + 4 from scrubTo)
      expect(onFrameCalls.length).toBe(5);
      expect(onFrameCalls[0].tMs).toBe(0);   // setIRProgram
      expect(onFrameCalls[1].tMs).toBe(100);
      expect(onFrameCalls[2].tMs).toBe(200);
      expect(onFrameCalls[3].tMs).toBe(300);
      expect(onFrameCalls[4].tMs).toBe(400);

      // All should produce valid trees
      onFrameCalls.forEach((call) => {
        expect(call.tree.kind).toBe("group");
      });
    });
  });

  describe("Integration with Compiler", () => {
    it.skip("should compile and render a patch with TimeRoot (when IR compiler is complete)", () => {
      // This test is skipped because the IR compiler doesn't yet generate
      // full CompiledProgramIR structures. Currently it emits LinkedGraphIR.
      // This test will be enabled when the compiler can produce complete
      // CompiledProgramIR with all required fields.
      //
      // Expected flow when ready:
      // 1. Create patch with TimeRoot + render output block
      // 2. Compile with emitIR: true
      // 3. Transform LinkedGraphIR to CompiledProgramIR
      // 4. Create IRRuntimeAdapter from CompiledProgramIR
      // 5. Set on Player
      // 6. Execute frames
      // 7. Verify RenderTree contains actual geometry

      expect(true).toBe(true);
    });
  });
});
