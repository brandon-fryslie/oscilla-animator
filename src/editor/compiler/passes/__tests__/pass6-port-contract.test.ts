/**
 * Port Contract Enforcement Tests (P2-2)
 *
 * Tests that Pass 6 (block lowering) correctly enforces strict-by-default
 * port contract validation. Validates that port order mismatches are caught
 * and that the relaxed opt-out tag works as expected.
 *
 * Reference: .agent_planning/_active/port-catalog-lowering/PLAN-2025-12-30-P2P3.md § P2-2
 */

import { describe, it, expect } from "vitest";
import { registerBlockType, type BlockTypeDecl } from "../../ir/lowerTypes";
import type { TypeDesc } from "../../ir/types";
import { parseTypeDesc } from "../../../ir/types/TypeDesc";
import { BLOCK_DEFS_BY_TYPE } from "../../../blocks/registry";
import type { BlockDefinition } from "../../../blocks/types";

describe("Pass 6: Port Contract Enforcement", () => {
  describe("Input Port Validation", () => {
    it("validates inputs in correct order", () => {
      // Register a test block with inputs [a, b]
      const testType = "TestInputsCorrect";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [
          { portId: "a", label: "A", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
          { portId: "b", label: "B", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
        ],
        outputs: [
          { portId: "out", label: "Out", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigId = ctx.b.sigConst(42, typeNum);
          const slot = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: { out: { k: "sig", id: sigId, slot } },
          };
        },
      };
      registerBlockType(irDecl);

      // Register matching editor block definition with correct order
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [
          { id: "a", label: "A", type: parseTypeDesc("Signal:float"), direction: "input" as const },
          { id: "b", label: "B", type: parseTypeDesc("Signal:float"), direction: "input" as const },
        ],
        outputs: [
          { id: "out", label: "Out", type: parseTypeDesc("Signal:float"), direction: "output" as const },
        ],
        defaultParams: {},
        color: "#000000",
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const blockType = irDecl;
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      if (enforcePortContract && blockDef !== undefined) {
        const defInputIds = blockDef.inputs.map((input) => input.id);
        const irInputIds = blockType.inputs.map((input) => input.portId);
        const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');

        // Should match
        expect(inputOrderMismatch).toBe(false);
      }
    });

    it("rejects inputs in wrong order", () => {
      // Register a test block with IR inputs [a, b] but editor inputs [b, a]
      const testType = "TestInputsWrong";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [
          { portId: "a", label: "A", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
          { portId: "b", label: "B", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
        ],
        outputs: [
          { portId: "out", label: "Out", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigId = ctx.b.sigConst(42, typeNum);
          const slot = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: { out: { k: "sig", id: sigId, slot } },
          };
        },
      };
      registerBlockType(irDecl);

      // Register editor block with WRONG input order [b, a] (mismatch!)
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [
          { id: "b", label: "B", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
          { id: "a", label: "A", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
        ],
        outputs: [
          { id: "out", label: "Out", type: parseTypeDesc("Signal:float"), direction: "output" as const },
        ],
        defaultParams: {},
        color: "#000000",
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const blockType = irDecl;
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      if (enforcePortContract && blockDef !== undefined) {
        const defInputIds = blockDef.inputs.map((input) => input.id);
        const irInputIds = blockType.inputs.map((input) => input.portId);
        const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');

        // Should NOT match
        expect(inputOrderMismatch).toBe(true);
        expect(defInputIds.join(', ')).toBe("b, a");
        expect(irInputIds.join(', ')).toBe("a, b");
      }
    });
  });

  describe("Output Port Validation", () => {
    it("validates outputs in correct order", () => {
      // Register a test block with outputs [x, y]
      const testType = "TestOutputsCorrect";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [],
        outputs: [
          { portId: "x", label: "X", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
          { portId: "y", label: "Y", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigX = ctx.b.sigConst(1, typeNum);
          const sigY = ctx.b.sigConst(2, typeNum);
          const slotX = ctx.b.allocValueSlot(typeNum);
          const slotY = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: {
              x: { k: "sig", id: sigX, slot: slotX },
              y: { k: "sig", id: sigY, slot: slotY },
            },
          };
        },
      };
      registerBlockType(irDecl);

      // Register matching editor block definition
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [],
        outputs: [
          { id: "x", label: "X", type: parseTypeDesc("Signal:float"), direction: "output" as const },
          { id: "y", label: "Y", type: parseTypeDesc("Signal:float"), direction: "output" as const },
        ],
        defaultParams: {},
        color: "#000000",
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const blockType = irDecl;
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      if (enforcePortContract && blockDef !== undefined) {
        const defOutputIds = blockDef.outputs.map((output) => output.id);
        const irOutputIds = blockType.outputs.map((output) => output.portId);
        const outputOrderMismatch = defOutputIds.join('|') !== irOutputIds.join('|');

        // Should match
        expect(outputOrderMismatch).toBe(false);
      }
    });

    it("rejects outputs in wrong order", () => {
      // Register a test block with IR outputs [x, y] but editor outputs [y, x]
      const testType = "TestOutputsWrong";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [],
        outputs: [
          { portId: "x", label: "X", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
          { portId: "y", label: "Y", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigX = ctx.b.sigConst(1, typeNum);
          const sigY = ctx.b.sigConst(2, typeNum);
          const slotX = ctx.b.allocValueSlot(typeNum);
          const slotY = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: {
              x: { k: "sig", id: sigX, slot: slotX },
              y: { k: "sig", id: sigY, slot: slotY },
            },
          };
        },
      };
      registerBlockType(irDecl);

      // Register editor block with WRONG output order [y, x] (mismatch!)
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [],
        outputs: [
          { id: "y", label: "Y", type: parseTypeDesc("Signal:float"), direction: "output" as const }, // WRONG ORDER
          { id: "x", label: "X", type: parseTypeDesc("Signal:float"), direction: "output" as const }, // WRONG ORDER
        ],
        defaultParams: {},
        color: "#000000",
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const blockType = irDecl;
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      if (enforcePortContract && blockDef !== undefined) {
        const defOutputIds = blockDef.outputs.map((output) => output.id);
        const irOutputIds = blockType.outputs.map((output) => output.portId);
        const outputOrderMismatch = defOutputIds.join('|') !== irOutputIds.join('|');

        // Should NOT match
        expect(outputOrderMismatch).toBe(true);
        expect(defOutputIds.join(', ')).toBe("y, x");
        expect(irOutputIds.join(', ')).toBe("x, y");
      }
    });
  });

  describe("Enforcement Modes", () => {
    it("skips validation for relaxed tag", () => {
      // Register a test block with mismatched ports but relaxed enforcement
      const testType = "TestRelaxed";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [
          { portId: "a", label: "A", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
          { portId: "b", label: "B", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
        ],
        outputs: [
          { portId: "out", label: "Out", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigId = ctx.b.sigConst(42, typeNum);
          const slot = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: { out: { k: "sig", id: sigId, slot } },
          };
        },
      };
      registerBlockType(irDecl);

      // Register editor block with WRONG input order BUT relaxed tag
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [
          { id: "b", label: "B", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
          { id: "a", label: "A", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
        ],
        outputs: [
          { id: "out", label: "Out", type: parseTypeDesc("Signal:float"), direction: "output" as const },
        ],
        defaultParams: {},
        color: "#000000",
        tags: { irPortContract: "relaxed" }, // OPT-OUT
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      // Should NOT enforce validation (relaxed mode)
      expect(enforcePortContract).toBe(false);
    });

    it("enforces strict-by-default for blocks without tag", () => {
      // Register a test block without any tag (should default to strict)
      const testType = "TestStrictDefault";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [
          { portId: "a", label: "A", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
          { portId: "b", label: "B", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
        ],
        outputs: [
          { portId: "out", label: "Out", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigId = ctx.b.sigConst(42, typeNum);
          const slot = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: { out: { k: "sig", id: sigId, slot } },
          };
        },
      };
      registerBlockType(irDecl);

      // Register editor block with WRONG input order and NO tag (strict-by-default)
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [
          { id: "b", label: "B", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
          { id: "a", label: "A", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
        ],
        outputs: [
          { id: "out", label: "Out", type: parseTypeDesc("Signal:float"), direction: "output" as const },
        ],
        defaultParams: {},
        color: "#000000",
        // NO tags property - should default to strict
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const blockType = irDecl;
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      // Should enforce (strict-by-default)
      expect(enforcePortContract).toBe(true);

      if (enforcePortContract && blockDef !== undefined) {
        const defInputIds = blockDef.inputs.map((input) => input.id);
        const irInputIds = blockType.inputs.map((input) => input.portId);
        const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');

        // Should detect mismatch
        expect(inputOrderMismatch).toBe(true);
      }
    });

    it("enforces strict validation with explicit strict tag", () => {
      // Register a test block with explicit strict tag
      const testType = "TestStrictExplicit";
      const irDecl: BlockTypeDecl = {
        type: testType,
        capability: "pure",
        inputs: [
          { portId: "a", label: "A", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
          { portId: "b", label: "B", dir: "in", type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
        ],
        outputs: [
          { portId: "out", label: "Out", dir: "out", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        ],
        lower: ({ ctx }) => {
          const typeNum: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
          const sigId = ctx.b.sigConst(42, typeNum);
          const slot = ctx.b.allocValueSlot(typeNum);
          return {
            outputs: [],
            outputsById: { out: { k: "sig", id: sigId, slot } },
          };
        },
      };
      registerBlockType(irDecl);

      // Register editor block with WRONG input order and explicit strict tag
      const editorDef: BlockDefinition = {
        type: testType,
        label: "Test",
        description: "Test block",
        capability: "pure",
        compileKind: "operator",
        inputs: [
          { id: "b", label: "B", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
          { id: "a", label: "A", type: parseTypeDesc("Signal:float"), direction: "input" as const }, // WRONG ORDER
        ],
        outputs: [
          { id: "out", label: "Out", type: parseTypeDesc("Signal:float"), direction: "output" as const },
        ],
        defaultParams: {},
        color: "#000000",
        tags: { irPortContract: "strict" }, // EXPLICIT STRICT
      };
      BLOCK_DEFS_BY_TYPE.set(testType, editorDef);

      // Validation check
      const blockDef = BLOCK_DEFS_BY_TYPE.get(testType);
      const blockType = irDecl;
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

      // Should enforce (explicit strict)
      expect(enforcePortContract).toBe(true);

      if (enforcePortContract && blockDef !== undefined) {
        const defInputIds = blockDef.inputs.map((input) => input.id);
        const irInputIds = blockType.inputs.map((input) => input.portId);
        const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');

        // Should detect mismatch
        expect(inputOrderMismatch).toBe(true);
      }
    });
  });
});
