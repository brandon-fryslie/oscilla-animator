/**
 * Tests for Pass 8: Link Resolution
 */

import { asTypeDesc } from "../../ir/types";
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
      const sigId = ir.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
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

      const sig1 = ir.builder.sigConst(1, asTypeDesc({ world: "signal", domain: "float" }));
      const sig2 = ir.builder.sigConst(2, asTypeDesc({ world: "signal", domain: "float" }));
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

      const sig1 = ir.builder.sigConst(1, asTypeDesc({ world: "signal", domain: "float" }));
      const sig2 = ir.builder.sigConst(2, asTypeDesc({ world: "signal", domain: "float" }));
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

      const sigId = ir.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
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

  describe("P1 Validation: Output Slot Registration", () => {
    it("should NOT emit error for properly registered signal output", () => {
      const ir = createIRWithBusRoots();

      // Create a signal and register its slot properly
      const sigId = ir.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = ir.builder.allocValueSlot();
      ir.builder.registerSigSlot(sigId, slot);

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });

    it("should emit error for unregistered signal output", () => {
      const ir = createIRWithBusRoots();

      // Create a signal but DON'T register its slot
      const sigId = ir.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = ir.builder.allocValueSlot();
      // Missing: ir.builder.registerSigSlot(sigId, slot);

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBeGreaterThan(0);

      // Check error message quality
      const error = outputErrors[0];
      expect(error.message).toContain("Block 'Block b1'");
      expect(error.message).toContain("output 'Output 0'");
      expect(error.message).toContain("registerSigSlot");
    });

    it("should NOT emit error for properly registered field output", () => {
      const ir = createIRWithBusRoots();

      // Create a field and register its slot properly
      const fieldId = ir.builder.fieldConst(1.5, asTypeDesc({ world: "field", domain: "float" }));
      const slot = ir.builder.allocValueSlot();
      ir.builder.registerFieldSlot(fieldId, slot);

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "field", id: fieldId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });

    it("should emit error for unregistered field output", () => {
      const ir = createIRWithBusRoots();

      // Create a field but DON'T register its slot
      const fieldId = ir.builder.fieldConst(1.5, asTypeDesc({ world: "field", domain: "float" }));
      const slot = ir.builder.allocValueSlot();
      // Missing: ir.builder.registerFieldSlot(fieldId, slot);

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "field", id: fieldId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBeGreaterThan(0);

      // Check error message quality
      const error = outputErrors[0];
      expect(error.message).toContain("Block 'Block b1'");
      expect(error.message).toContain("output 'Output 0'");
      expect(error.message).toContain("registerFieldSlot");
    });

    it("should NOT emit error for scalarConst output", () => {
      const ir = createIRWithBusRoots();

      // Create a scalar constant (automatically registered in const pool)
      const constId = ir.builder.allocConstId(42);

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "scalarConst", constId }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });

    it("should NOT emit error for special output", () => {
      const ir = createIRWithBusRoots();

      // Create a special output (domain handle, no slot registration needed)
      const domainSlot = ir.builder.domainFromN(100);

      ir.blockOutputs.set(0 as BlockIndex, createOutputMap([
        ["out0", { k: "special", tag: "domain", id: domainSlot }]
      ]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });
  });

  describe("P1 Validation: Null ValueRef Documentation", () => {
    it("should document that event port null is expected (not an error)", () => {
      const ir = createIRWithBusRoots();

      // Block b1 has an output, but it's an event (no IR representation)
      ir.blockOutputs.set(0 as BlockIndex, new Map()); // Empty - no output ref

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

      // Wire exists but upstream has no ref - this is expected for events
      // Should NOT emit an error for this case
      const danglingErrors = result.errors.filter(e => e.code === "DanglingConnection");
      expect(danglingErrors.length).toBe(0);
    });
  });

  describe("P1 Validation: Bus Publisher Validation", () => {
    // Note: Bus publisher validation is documented as TODO in the implementation.
    // It requires modifying pass7 to track publisher counts.
    // For now, we rely on pass7's existing validation logic for empty buses.

    it("should handle buses with publishers (no error)", () => {
      const ir = createIRWithBusRoots();

      // Add a bus root (implicitly has publishers from pass7)
      const sigId = ir.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = ir.builder.allocValueSlot();
      ir.builder.registerSigSlot(sigId, slot);
      ir.busRoots.set(0, { k: "sig", id: sigId, slot });

      const blocks: Block[] = [];

      const result = pass8LinkResolution(ir, blocks, [], []);

      // Should NOT have BusWithoutPublisher error (validation not yet implemented)
      const busErrors = result.errors.filter(e => e.code === "BusWithoutPublisher");
      expect(busErrors.length).toBe(0);
    });
  });
});
