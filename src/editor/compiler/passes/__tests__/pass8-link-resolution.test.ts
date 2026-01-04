/**
 * Tests for Pass 8: Link Resolution
 *
 * After Bus-Block Unification (2026-01-02), all connections are edges (port→port).
 * Pass 7 removed - buses are just blocks.
 */

import { asTypeDesc } from "../../ir/types";
import { describe, it, expect } from "vitest";
import { pass8LinkResolution } from "../pass8-link-resolution";
import { IRBuilderImpl } from "../../ir/IRBuilderImpl";
import type { Block, Edge } from "../../../types";
import type { UnlinkedIRFragments, ValueRefPacked } from "../pass6-block-lowering";
import type { BlockIndex } from "../../ir/patches";

describe("Pass 8: Link Resolution", () => {
  // Helper to create basic UnlinkedIRFragments (replaces IRWithBusRoots)
  function createUnlinkedFragments(): UnlinkedIRFragments {
    return {
      builder: new IRBuilderImpl(),
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
      position: { x: 0, y: 0 },
      params: {},
      form: "primitive",
      role: { kind: "user" },
    };
  }

  // Helper to create an edge from wire format
  function createEdge(from: { block: string; port: string }, to: { block: string; port: string }): Edge {
    return {
      id: `edge-${from.block}-${from.port}-${to.block}-${to.port}`,
      from: { kind: 'port', blockId: from.block, slotId: from.port },
      to: { kind: 'port', blockId: to.block, slotId: to.port },
      enabled: true,
      role: { kind: 'user' },
    };
  }


  describe("Block outputs", () => {
    it("should create BlockOutputRootIR from Pass 6 block outputs", () => {
      const fragments = createUnlinkedFragments();

      // Add some block outputs
      const sigId = fragments.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = fragments.builder.allocValueSlot();
      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

      expect(result.blockOutputRoots).toBeDefined();
      expect(result.blockOutputRoots.refs.length).toBeGreaterThan(0);
    });

    it("should handle multiple blocks with outputs", () => {
      const fragments = createUnlinkedFragments();

      const sig1 = fragments.builder.sigConst(1, asTypeDesc({ world: "signal", domain: "float" }));
      const sig2 = fragments.builder.sigConst(2, asTypeDesc({ world: "signal", domain: "float" }));
      const slot1 = fragments.builder.allocValueSlot();
      const slot2 = fragments.builder.allocValueSlot();

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sig1, slot: slot1 }]]));
      fragments.blockOutputs.set(1 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sig2, slot: slot2 }]]));

      const blocks: Block[] = [
        createBlock("b1", 0, 1),
        createBlock("b2", 0, 1),
      ];

      const result = pass8LinkResolution(fragments, blocks, []);

      expect(result.blockOutputRoots.refs.length).toBeGreaterThan(0);
    });

    it("should handle blocks with multiple outputs", () => {
      const fragments = createUnlinkedFragments();

      const sig1 = fragments.builder.sigConst(1, asTypeDesc({ world: "signal", domain: "float" }));
      const sig2 = fragments.builder.sigConst(2, asTypeDesc({ world: "signal", domain: "float" }));
      const slot1 = fragments.builder.allocValueSlot();
      const slot2 = fragments.builder.allocValueSlot();

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([
        ["out0", { k: "sig", id: sig1, slot: slot1 }],
        ["out1", { k: "sig", id: sig2, slot: slot2 }],
      ]));

      const blocks: Block[] = [createBlock("b1", 0, 2)];

      const result = pass8LinkResolution(fragments, blocks, []);

      expect(result.blockOutputRoots.refs.length).toBeGreaterThan(0);
    });
  });

  describe("Block inputs - edge connections", () => {
    it("should resolve input connected via edge", () => {
      const fragments = createUnlinkedFragments();

      const sigId = fragments.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = fragments.builder.allocValueSlot();
      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [
        createBlock("b1", 0, 1),
        createBlock("b2", 1, 0),
      ];

      const edges: Edge[] = [
        createEdge({ block: "b1", port: "out0" }, { block: "b2", port: "in0" }),
      ];

      const result = pass8LinkResolution(fragments, blocks, edges);

      // Should have input roots
      expect(result.blockInputRoots).toBeDefined();
      // Edge should be resolved (no DanglingConnection error for this specific edge)
      const danglingForEdge = result.errors.filter(
        e => e.code === "DanglingConnection" && e.message.includes("b2:in0")
      );
      expect(danglingForEdge.length).toBe(0);
    });

    it("should report error for invalid edge", () => {
      const fragments = createUnlinkedFragments();

      const blocks: Block[] = [createBlock("b1", 1, 0)];

      const edges: Edge[] = [
        createEdge({ block: "nonexistent", port: "out0" }, { block: "b1", port: "in0" }),
      ];

      const result = pass8LinkResolution(fragments, blocks, edges);

      // Should have DanglingConnection or MissingInput error
      const errors = result.errors.filter(
        e => e.code === "DanglingConnection" || e.code === "MissingInput"
      );
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should preserve errors from Pass 6", () => {
      const fragments: UnlinkedIRFragments = {
        builder: new IRBuilderImpl(),
        blockOutputs: new Map(),
        errors: [
          {
            code: "MissingInput",
            message: "Test error from Pass 6",
          },
        ],
      };

      const result = pass8LinkResolution(fragments, [], []);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe("MissingInput");
    });
  });

  describe("P1 Validation: Output Slot Registration", () => {
    it("should NOT emit error for properly registered signal output", () => {
      const fragments = createUnlinkedFragments();

      // Create a signal and register its slot properly
      const sigId = fragments.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = fragments.builder.allocValueSlot();
      fragments.builder.registerSigSlot(sigId, slot);

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });

    it("should emit error for unregistered signal output", () => {
      const fragments = createUnlinkedFragments();

      // Create a signal but DON'T register its slot
      const sigId = fragments.builder.sigConst(42, asTypeDesc({ world: "signal", domain: "float" }));
      const slot = fragments.builder.allocValueSlot();
      // Missing: fragments.builder.registerSigSlot(sigId, slot);

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "sig", id: sigId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

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
      const fragments = createUnlinkedFragments();

      // Create a field and register its slot properly
      const fieldId = fragments.builder.fieldConst(1.5, asTypeDesc({ world: "field", domain: "float" }));
      const slot = fragments.builder.allocValueSlot();
      fragments.builder.registerFieldSlot(fieldId, slot);

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "field", id: fieldId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });

    it("should emit error for unregistered field output", () => {
      const fragments = createUnlinkedFragments();

      // Create a field but DON'T register its slot
      const fieldId = fragments.builder.fieldConst(1.5, asTypeDesc({ world: "field", domain: "float" }));
      const slot = fragments.builder.allocValueSlot();
      // Missing: fragments.builder.registerFieldSlot(fieldId, slot);

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "field", id: fieldId, slot }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

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
      const fragments = createUnlinkedFragments();

      // Create a scalar constant (automatically registered in const pool)
      const constId = fragments.builder.allocConstId(42);

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([["out0", { k: "scalarConst", constId }]]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });

    it("should NOT emit error for special output", () => {
      const fragments = createUnlinkedFragments();

      // Create a special output (domain handle, no slot registration needed)
      const domainSlot = fragments.builder.domainFromN(100);

      fragments.blockOutputs.set(0 as BlockIndex, createOutputMap([
        ["out0", { k: "special", tag: "domain", id: domainSlot }]
      ]));

      const blocks: Block[] = [createBlock("b1", 0, 1)];

      const result = pass8LinkResolution(fragments, blocks, []);

      // Should NOT have MissingOutputRegistration error
      const outputErrors = result.errors.filter(e => e.code === "MissingOutputRegistration");
      expect(outputErrors.length).toBe(0);
    });
  });

  describe("P1 Validation: Null ValueRef Documentation", () => {
    it("should document that event port null is expected (not an error)", () => {
      const fragments = createUnlinkedFragments();

      // Block b1 has an output, but it's an event (no IR representation)
      fragments.blockOutputs.set(0 as BlockIndex, new Map()); // Empty - no output ref

      const blocks: Block[] = [
        createBlock("b1", 0, 1),
        createBlock("b2", 1, 0),
      ];

      const edges: Edge[] = [
        createEdge({ block: "b1", port: "out0" }, { block: "b2", port: "in0" }),
      ];

      const result = pass8LinkResolution(fragments, blocks, edges);

      // Edge exists but upstream has no ref - this is expected for events
      // Should NOT emit an error for this case
      const danglingErrors = result.errors.filter(e => e.code === "DanglingConnection");
      expect(danglingErrors.length).toBe(0);
    });
  });
});
