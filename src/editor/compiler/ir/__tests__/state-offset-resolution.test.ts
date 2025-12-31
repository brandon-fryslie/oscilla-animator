/**
 * State Offset Resolution Integration Test
 *
 * Tests the automatic resolution of state IDs to numeric offsets during compilation.
 * This is a critical feature that bridges compile-time state allocation (string IDs)
 * to runtime state access (numeric offsets).
 *
 * Sprint 1: State ID Resolution in buildSchedule
 * References:
 * - .agent_planning/signal-runtime-stateful/PLAN-2025-12-30-031559.md
 * - .agent_planning/signal-runtime-stateful/DOD-2025-12-30-031559.md Sprint 1
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../IRBuilderImpl";
import { buildCompiledProgram } from "../buildSchedule";
import type { SignalExprIR } from "../signalExpr";
import type { TypeDesc } from "../types";
import type { TimeModelIR } from "../schedule";

const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
const triggerType: TypeDesc = { world: "signal", domain: "trigger", category: "core", busEligible: true };

// Helper to create a minimal time model
const createTimeModel = (): TimeModelIR => ({
  kind: "infinite",
  windowMs: 10000,
});

describe("State Offset Resolution", () => {
  describe("resolveStateOffsets()", () => {
    it("automatically assigns state offsets during compilation", () => {
      const builder = new IRBuilderImpl();

      // Simulate lowering a stateful block (e.g., PulseDivider)
      // 1. Allocate state
      const stateId = builder.allocStateId(
        numberType,
        -1,
        "pulseDivider_lastSubPhase"
      );

      // 2. Create a stateful signal expression
      const input = builder.sigConst(0.5, numberType);
      const statefulSigId = builder.sigStateful(
        "pulseDivider",
        input,
        stateId,
        triggerType,
        { divisions: 4 } // Note: NO stateOffset here!
      );

      // 3. Register output slot
      const outputSlot = builder.allocValueSlot(triggerType);
      builder.registerSigSlot(statefulSigId, outputSlot);

      // Build IR
      const builderIR = {
        signalIR: { nodes: builder["sigExprs"] },
        fieldIR: { nodes: [] },
        eventIR: { nodes: [] },
        constants: builder.getConstPool(),
        stateLayout: builder["stateLayout"],
        transformChains: [],
        renderSinks: [],
        domains: [],
        cameras: [],
        debugIndex: {
          sigExprSource: new Map(),
          fieldExprSource: new Map(),
          eventExprSource: new Map(),
          slotSource: new Map(),
        },
        debugProbes: [],
        timeModel: createTimeModel(),
        slotMeta: [],
        sigValueSlots: [undefined, undefined, outputSlot],
        fieldValueSlots: [],
        eventValueSlots: [],
        nextValueSlot: outputSlot + 1,
        busRoots: [],
      };

      // Compile program (this should resolve state offsets)
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        42
      );

      // Verify that state offset was automatically assigned
      const statefulNode = compiled.signalTable!.nodes[statefulSigId] as Extract<
        SignalExprIR,
        { kind: "stateful" }
      >;

      expect(statefulNode.kind).toBe("stateful");
      expect(statefulNode.stateId).toBe(stateId);
      expect(statefulNode.params).toBeDefined();
      expect(statefulNode.params?.stateOffset).toBe(0); // First state = offset 0
      expect(statefulNode.params?.divisions).toBe(4); // Other params preserved
    });

    it("assigns sequential offsets for multiple stateful operations", () => {
      const builder = new IRBuilderImpl();

      // Simulate multiple stateful blocks
      const state1 = builder.allocStateId(numberType, 0, "integrate_acc");
      const state2 = builder.allocStateId(numberType, -1, "pulseDivider_last");
      const state3 = builder.allocStateId(numberType, 0, "sampleHold_value");

      const input = builder.sigConst(1.0, numberType);

      // Create three stateful operations
      const sig1 = builder.sigStateful("integrate", input, state1, numberType);
      const sig2 = builder.sigStateful("pulseDivider", input, state2, triggerType);
      const sig3 = builder.sigStateful("sampleHold", input, state3, numberType);

      // Build IR
      const builderIR = {
        signalIR: { nodes: builder["sigExprs"] },
        fieldIR: { nodes: [] },
        eventIR: { nodes: [] },
        constants: builder.getConstPool(),
        stateLayout: builder["stateLayout"],
        transformChains: [],
        renderSinks: [],
        domains: [],
        cameras: [],
        debugIndex: {
          sigExprSource: new Map(),
          fieldExprSource: new Map(),
          eventExprSource: new Map(),
          slotSource: new Map(),
        },
        debugProbes: [],
        timeModel: createTimeModel(),
        slotMeta: [],
        sigValueSlots: [],
        fieldValueSlots: [],
        eventValueSlots: [],
        nextValueSlot: 0,
        busRoots: [],
      };

      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 42);

      // Verify sequential offsets
      const node1 = compiled.signalTable!.nodes[sig1] as Extract<
        SignalExprIR,
        { kind: "stateful" }
      >;
      const node2 = compiled.signalTable!.nodes[sig2] as Extract<
        SignalExprIR,
        { kind: "stateful" }
      >;
      const node3 = compiled.signalTable!.nodes[sig3] as Extract<
        SignalExprIR,
        { kind: "stateful" }
      >;

      expect(node1.params?.stateOffset).toBe(0);
      expect(node2.params?.stateOffset).toBe(1);
      expect(node3.params?.stateOffset).toBe(2);
    });

    it("throws error when stateful node references unknown stateId", () => {
      const builder = new IRBuilderImpl();

      // Create stateful node with stateId but don't allocate state
      const input = builder.sigConst(1.0, numberType);

      // Manually create a broken stateful node
      const statefulNode: SignalExprIR = {
        kind: "stateful",
        type: numberType,
        op: "integrate",
        input,
        stateId: "nonexistent_state_id",
      };
      builder["sigExprs"].push(statefulNode);

      const builderIR = {
        signalIR: { nodes: builder["sigExprs"] },
        fieldIR: { nodes: [] },
        eventIR: { nodes: [] },
        constants: builder.getConstPool(),
        stateLayout: builder["stateLayout"], // Empty - no state allocated
        transformChains: [],
        renderSinks: [],
        domains: [],
        cameras: [],
        debugIndex: {
          sigExprSource: new Map(),
          fieldExprSource: new Map(),
          eventExprSource: new Map(),
          slotSource: new Map(),
        },
        debugProbes: [],
        timeModel: createTimeModel(),
        slotMeta: [],
        sigValueSlots: [],
        fieldValueSlots: [],
        eventValueSlots: [],
        nextValueSlot: 0,
        busRoots: [],
      };

      // Should throw StateRefMissingDecl error
      expect(() => {
        buildCompiledProgram(builderIR, "test-patch", 1, 42);
      }).toThrow(/StateRefMissingDecl.*nonexistent_state_id/);
    });

    it("preserves existing params when adding stateOffset", () => {
      const builder = new IRBuilderImpl();

      const stateId = builder.allocStateId(numberType, 0, "slew_prev");
      const input = builder.sigConst(100, numberType);

      // Create stateful node with custom params
      const slewSig = builder.sigStateful(
        "slew",
        input,
        stateId,
        numberType,
        { rate: 10, customParam: 42 } // Custom params
      );

      const builderIR = {
        signalIR: { nodes: builder["sigExprs"] },
        fieldIR: { nodes: [] },
        eventIR: { nodes: [] },
        constants: builder.getConstPool(),
        stateLayout: builder["stateLayout"],
        transformChains: [],
        renderSinks: [],
        domains: [],
        cameras: [],
        debugIndex: {
          sigExprSource: new Map(),
          fieldExprSource: new Map(),
          eventExprSource: new Map(),
          slotSource: new Map(),
        },
        debugProbes: [],
        timeModel: createTimeModel(),
        slotMeta: [],
        sigValueSlots: [],
        fieldValueSlots: [],
        eventValueSlots: [],
        nextValueSlot: 0,
        busRoots: [],
      };

      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 42);

      const slewNode = compiled.signalTable!.nodes[slewSig] as Extract<
        SignalExprIR,
        { kind: "stateful" }
      >;

      // Verify all params preserved + stateOffset added
      expect(slewNode.params).toEqual({
        rate: 10,
        customParam: 42,
        stateOffset: 0,
      });
    });
  });

  describe("Determinism", () => {
    it("produces identical state offsets for same input", () => {
      // Compile the same IR 10 times
      const offsets: number[][] = [];

      for (let i = 0; i < 10; i++) {
        const builder = new IRBuilderImpl();

        // Create same structure each time
        const state1 = builder.allocStateId(numberType, 0, "state_a");
        const state2 = builder.allocStateId(numberType, 0, "state_b");
        const state3 = builder.allocStateId(numberType, 0, "state_c");

        const input = builder.sigConst(1.0, numberType);
        const sig1 = builder.sigStateful("integrate", input, state1, numberType);
        const sig2 = builder.sigStateful("integrate", input, state2, numberType);
        const sig3 = builder.sigStateful("integrate", input, state3, numberType);

        const builderIR = {
          signalIR: { nodes: builder["sigExprs"] },
          fieldIR: { nodes: [] },
          eventIR: { nodes: [] },
          constants: builder.getConstPool(),
          stateLayout: builder["stateLayout"],
          transformChains: [],
          renderSinks: [],
          domains: [],
          cameras: [],
          debugIndex: {
            sigExprSource: new Map(),
            fieldExprSource: new Map(),
            eventExprSource: new Map(),
            slotSource: new Map(),
          },
          debugProbes: [],
          timeModel: createTimeModel(),
          slotMeta: [],
          sigValueSlots: [],
          fieldValueSlots: [],
          eventValueSlots: [],
          nextValueSlot: 0,
          busRoots: [],
        };

        const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 42);

        const node1 = compiled.signalTable!.nodes[sig1] as Extract<
          SignalExprIR,
          { kind: "stateful" }
        >;
        const node2 = compiled.signalTable!.nodes[sig2] as Extract<
          SignalExprIR,
          { kind: "stateful" }
        >;
        const node3 = compiled.signalTable!.nodes[sig3] as Extract<
          SignalExprIR,
          { kind: "stateful" }
        >;

        offsets.push([
          node1.params?.stateOffset ?? -1,
          node2.params?.stateOffset ?? -1,
          node3.params?.stateOffset ?? -1,
        ]);
      }

      // All compilations should produce identical offsets
      const first = offsets[0];
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]).toEqual(first);
      }

      // Verify offsets are sequential (0, 1, 2)
      expect(first).toEqual([0, 1, 2]);
    });
  });

  describe("State Layout Alignment", () => {
    it("converts StateLayoutEntry to StateCellLayout with correct offsets", () => {
      const builder = new IRBuilderImpl();

      const state1 = builder.allocStateId(numberType, 0, "state_a");
      const state2 = builder.allocStateId(numberType, 1, "state_b");

      const builderIR = {
        signalIR: { nodes: [] },
        fieldIR: { nodes: [] },
        eventIR: { nodes: [] },
        constants: [],
        stateLayout: builder["stateLayout"],
        transformChains: [],
        renderSinks: [],
        domains: [],
        cameras: [],
        debugIndex: {
          sigExprSource: new Map(),
          fieldExprSource: new Map(),
          eventExprSource: new Map(),
          slotSource: new Map(),
        },
        debugProbes: [],
        timeModel: createTimeModel(),
        slotMeta: [],
        sigValueSlots: [],
        fieldValueSlots: [],
        eventValueSlots: [],
        nextValueSlot: 0,
        busRoots: [],
      };

      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 42);

      // Verify state layout cells
      expect(compiled.stateLayout.cells).toHaveLength(2);
      expect(compiled.stateLayout.cells[0].stateId).toBe(state1);
      expect(compiled.stateLayout.cells[0].offset).toBe(0);
      expect(compiled.stateLayout.cells[1].stateId).toBe(state2);
      expect(compiled.stateLayout.cells[1].offset).toBe(1);

      // Verify state layout totals
      expect(compiled.stateLayout.f64Size).toBe(2);
    });
  });
});
