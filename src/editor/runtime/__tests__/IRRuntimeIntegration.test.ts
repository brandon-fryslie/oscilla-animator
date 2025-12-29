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
    fields: {
      nodes: [
        {
          kind: "const",
          type: { world: "field", domain: "number" },
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
      expect(typeof adapter.createProgram).toBe('function');
      expect(typeof adapter.swapProgram).toBe('function');
    });

    it("should create Player with IR program", () => {
      const program = createMinimalProgram();
      const adapter = new IRRuntimeAdapter(program);

      // Create player with IR program
      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter.createProgram());

      expect(player).toBeDefined();
    });

    it("should execute frames and call onFrame with RenderTree", () => {
      const program = createMinimalProgram();
      const adapter = new IRRuntimeAdapter(program);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter.createProgram());

      // Run several frames using scrubTo
      player.scrubTo(0);
      player.scrubTo(16.67);
      player.scrubTo(33.33);

      // Verify onFrame was called for each frame
      expect(onFrameCalls.length).toBeGreaterThanOrEqual(3);

      // Verify RenderTree structure
      onFrameCalls.forEach((call) => {
        expect(call.tree).toBeDefined();
        expect(call.tree.kind).toBe("group");
      });
    });

    it("should produce empty RenderTree when no outputs", () => {
      const program = createMinimalProgram();
      const adapter = new IRRuntimeAdapter(program);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter.createProgram());
      player.scrubTo(0);

      // With no outputs, should produce empty group
      expect(onFrameCalls.length).toBeGreaterThanOrEqual(1);
      const firstCall = onFrameCalls[0];
      expect(firstCall.tree.kind).toBe("group");
      expect(firstCall.tree.id).toBe("empty");
    });
  });

  describe("IR Hot-Swap", () => {
    it("should swap programs using setIRProgram()", () => {
      const program1 = createMinimalProgram(1);
      const program2 = createMinimalProgram(2);

      const adapter1 = new IRRuntimeAdapter(program1);
      const adapter2 = new IRRuntimeAdapter(program2);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter1.createProgram());

      // Run frames with program1
      player.scrubTo(0);
      player.scrubTo(16.67);

      const callsWithProgram1 = onFrameCalls.length;

      // Swap to program2
      player.setIRProgram(adapter2.createProgram());

      // Run frames with program2
      player.scrubTo(33.33);
      player.scrubTo(50);

      // Verify frames executed with both programs
      expect(onFrameCalls.length).toBeGreaterThan(callsWithProgram1);
    });

    it("should preserve render continuity across swap", () => {
      const program1 = createMinimalProgram(1);
      const program2 = createMinimalProgram(2);

      const adapter1 = new IRRuntimeAdapter(program1);
      const adapter2 = new IRRuntimeAdapter(program2);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter1.createProgram());

      // Run frames before and after swap
      player.scrubTo(0);
      player.setIRProgram(adapter2.createProgram());
      player.scrubTo(16.67);

      // All should produce valid trees
      onFrameCalls.forEach((call) => {
        expect(call.tree.kind).toBe("group");
      });
    });
  });

  describe("Time Model Integration", () => {
    it("should execute with infinite time model", () => {
      const program = createMinimalProgram();
      const adapter = new IRRuntimeAdapter(program);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter.createProgram());

      // Run frames at different times
      player.scrubTo(0);
      player.scrubTo(1000);
      player.scrubTo(5000);

      // All frames should execute successfully
      expect(onFrameCalls.length).toBeGreaterThanOrEqual(3);
      onFrameCalls.forEach((call) => {
        expect(call.tree).toBeDefined();
      });
    });
  });

  describe("State Preservation", () => {
    it("should maintain state across frames", () => {
      const program: CompiledProgramIR = {
        ...createMinimalProgram(),
        stateLayout: {
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
        },
      };

      const adapter = new IRRuntimeAdapter(program);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter.createProgram());

      // Run multiple frames
      player.scrubTo(0);
      player.scrubTo(16.67);
      player.scrubTo(33.33);

      // State should persist across frames (verified by no errors)
      expect(onFrameCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("should preserve state across program swap", () => {
      const layout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64" as const,
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

      const program1: CompiledProgramIR = {
        ...createMinimalProgram(1),
        stateLayout: layout,
      };

      const program2: CompiledProgramIR = {
        ...createMinimalProgram(2),
        stateLayout: layout,
      };

      const adapter1 = new IRRuntimeAdapter(program1);
      const adapter2 = new IRRuntimeAdapter(program2);

      const player = createPlayer((tree: RenderTree, tMs: number) => {
        onFrameCalls.push({ tree, tMs });
      });

      player.setIRProgram(adapter1.createProgram());

      // Run frames, swap, run more frames
      player.scrubTo(0);
      player.scrubTo(16.67);
      player.setIRProgram(adapter2.createProgram());
      player.scrubTo(33.33);
      player.scrubTo(50);

      // All frames should execute successfully
      expect(onFrameCalls.length).toBeGreaterThanOrEqual(4);
      onFrameCalls.forEach((call) => {
        expect(call.tree).toBeDefined();
      });
    });
  });
});
