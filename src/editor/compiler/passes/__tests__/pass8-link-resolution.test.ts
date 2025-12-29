/**
 * Tests for Pass 8: Link Resolution
 */

import { describe, it, expect } from "vitest";
import { pass8LinkResolution } from "../pass8-link-resolution";
import { IRBuilderImpl } from "../../ir/IRBuilderImpl";
import type { Block } from "../../../types";
import type { IRWithBusRoots, ValueRefPacked } from "../pass7-bus-lowering";
import type { CompilerConnection } from "../../types";
import type { BlockIndex } from "../../ir/patches";

describe("Pass 8: Link Resolution", () => {
  // Helper to create a basic IRWithBusRoots
  function createIRWithBusRoots(): IRWithBusRoots {
    return {
      builder: new IRBuilderImpl(),
      busRoots: new Map(),
      blockOutputs: new Map(),
      errors: [],
    };
  }

  // Helper to create output map for a block
  function createOutputMap(entries: [string, ValueRefPacked][]): Map<string, ValueRefPacked> {
    return new Map(entries);
  }

  // Helper to create a basic block
  function createBlock(id: string, inputCount: number, outputCount: number): Block {
    return {
      id,
      label: `Block ${id}`,
      type: "TestBlock",
      params: {},
      category: "Other" as const,
      inputs: Array.from({ length: inputCount }, (_, i) => ({
        id: `in${i}`,
        label: `Input ${i}`,
        direction: "input" as const,
        type: "Signal<float>" as const,
      })),
      outputs: Array.from({ length: outputCount }, (_, i) => ({
        id: `out${i}`,
        label: `Output ${i}`,
        direction: "output" as const,
        type: "Signal<float>" as const,
      })),
    };
  }

  describe("Block outputs", () => {
    it("should create BlockOutputRootIR from Pass 6 block outputs", () => {
      const ir = createIRWithBusRoots();

      // Add some block outputs
      const sigId = ir.builder.sigConst(42, { world: "signal", domain: "float" });
      const slot = ir.builder.allocValueSlot();
      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      expect(result.blockOutputRoots).toBeDefined();
      expect(result.blockOutputRoots.refs.length).toBeGreaterThan(0);
      // Will have UnresolvedPort warnings for inputs (expected in Sprint 2)
    });

    it("should handle multiple blocks with outputs", () => {
      const ir = createIRWithBusRoots();

      const sig1 = ir.builder.sigConst(1, { world: "signal", domain: "float" });
      const sig2 = ir.builder.sigConst(2, { world: "signal", domain: "float" });
      const slot1 = ir.builder.allocValueSlot();
      const slot2 = ir.builder.allocValueSlot();

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sig1, slot: slot1 }]]));
      ir.blockOutputs.set(1 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sig2, slot: slot2 }]]));

      const blocks: Block[] = [
        createBlock("b1", 0, 1),
        createBlock("b2", 0, 1),
      ];

      const result = pass8LinkResolution(ir, blocks, [], []);

      expect(result.blockOutputRoots.refs.length).toBeGreaterThan(0);
    });

    it("should handle blocks with multiple outputs", () => {
      const ir = createIRWithBusRoots();

      const sig1 = ir.builder.sigConst(1, { world: "signal", domain: "float" });
      const sig2 = ir.builder.sigConst(2, { world: "signal", domain: "float" });
      const slot1 = ir.builder.allocValueSlot();
      const slot2 = ir.builder.allocValueSlot();

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([
        ["out0", { k: "sig", id: sig1, slot: slot1 }],
        ["out1", { k: "sig", id: sig2, slot: slot2 }],
      ]));

      const blocks: Block[] = [createBlock("b1", 0, 2)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      expect(result.blockOutputRoots.refs.length).toBeGreaterThan(0);
    });
  });

  describe("Block inputs - wire connections", () => {
    it("should resolve input connected via wire", () => {
      const ir = createIRWithBusRoots();

      const sigId = ir.builder.sigConst(42, { world: "signal", domain: "float" });
      const slot = ir.builder.allocValueSlot();
      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [
        createBlock("b1", 0, 1),
        createBlock("b2", 1, 0),
      ];

      const wires: CompilerConnection[] = [
        {
          from: { block: "b1", port: "out0" },
          to: { block: "b2", port: "in0" },
        },
      ];

      const result = pass8LinkResolution(ir, blocks, wires, []);

      // Should have input roots
      expect(result.blockInputRoots).toBeDefined();
      // Wire should be resolved (no DanglingConnection error for this specific wire)
      const danglingForWire = result.errors.filter(
        e => e.code === "DanglingConnection" && e.message.includes("b2:in0")
      );
      expect(danglingForWire.length).toBe(0);
    });

    it("should report error for invalid wire", () => {
      const ir = createIRWithBusRoots();

      const blocks: Block[] = [createBlock("b1", 1, 0)];

      const wires: CompilerConnection[] = [
        {
          from: { block: "nonexistent", port: "out0" },
          to: { block: "b1", port: "in0" },
        },
      ];

      const result = pass8LinkResolution(ir, blocks, wires, []);

      // Should have DanglingConnection or UnresolvedPort error
      const errors = result.errors.filter(
        e => e.code === "DanglingConnection" || e.code === "UnresolvedPort"
      );
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should preserve errors from Pass 7", () => {
      const ir: IRWithBusRoots = {
        builder: new IRBuilderImpl(),
        busRoots: new Map(),
        blockOutputs: new Map(),
        errors: [
          {
            code: "BusLoweringFailed",
            message: "Test error from Pass 7",
          },
        ],
      };

      const result = pass8LinkResolution(ir, [], [], []);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe("BusLoweringFailed");
    });
  });
});
