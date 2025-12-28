/**
 * Pass 6 Block Lowering Tests
 *
 * Tests for the pass6BlockLowering function.
 * Verifies Artifact→IR translation for all artifact types.
 */

import { describe, it, expect } from "vitest";
import { pass6BlockLowering } from "../pass6-block-lowering";
import type { Artifact, RuntimeCtx, Vec2, Field } from "../../types";
import type { Block, SlotType } from "../../../types";
import type { AcyclicOrLegalGraph, BlockIndex, SCC } from "../../ir/patches";

// Helper to create a block
function createBlock(
  id: string,
  type: string = "TestBlock",
  outputs: string[] = ["out"]
): Block {
  return {
    id,
    type,
    label: `Block ${id}`,
    inputs: [],
    outputs: outputs.map((name) => ({
      id: name,
      name,
      label: name,
      type: "Signal<number>" as SlotType,
      direction: "output" as const,
    })),
    params: {},
    category: "Other",
  };
}

// Helper to create trivial SCC
function createTrivialSCC(blockIndex: number): SCC {
  return {
    nodes: [{ kind: "BlockEval", blockIndex: blockIndex as BlockIndex }],
    hasStateBoundary: true,
  };
}

// Helper to create AcyclicOrLegalGraph
function createGraph(
  blocks: Block[],
  sccs: SCC[]
): { validated: AcyclicOrLegalGraph; blocks: Block[] } {
  return {
    validated: {
      graph: { nodes: [], edges: [] },
      sccs,
      errors: [],
      timeModel: { kind: "infinite", windowMs: 30000 },
    },
    blocks,
  };
}

describe("pass6BlockLowering", () => {
  describe("Scalar Artifacts", () => {
    it("translates Scalar:number to constant signal", () => {
      const block = createBlock("b1", "Constant");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out", { kind: "Scalar:number", value: 42 }],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      expect(result.blockOutputs.size).toBe(1);

      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.size).toBe(1);
      expect(outputs!.get("out")?.k).toBe("sig");
    });

    it("translates Scalar:vec2 to constant signal", () => {
      const block = createBlock("b1", "Vec2Constant");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out", { kind: "Scalar:vec2", value: { x: 10, y: 20 } }],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("sig");
    });

    it("translates Scalar:color to constant signal", () => {
      const block = createBlock("b1", "ColorConstant");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out", { kind: "Scalar:color", value: "#ff0000" }],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("sig");
    });
  });

  describe("Signal Artifacts", () => {
    it("translates Signal:number to placeholder signal", () => {
      const block = createBlock("b1", "Oscillator");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        [
          "b1:out",
          {
            kind: "Signal:number",
            value: (_t: number, _ctx: RuntimeCtx) => Math.sin(_t / 1000),
          },
        ],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("sig");
    });

    it("translates Signal:phase to placeholder signal", () => {
      const block = createBlock("b1", "Phase");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        [
          "b1:out",
          {
            kind: "Signal:phase",
            value: (_t: number, _ctx: RuntimeCtx) => (_t / 3000) % 1,
          },
        ],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("sig");
    });

    it("translates Signal:vec2 to placeholder signal", () => {
      const block = createBlock("b1", "Position");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        [
          "b1:out",
          {
            kind: "Signal:vec2",
            value: (_t: number, _ctx: RuntimeCtx) =>
              ({ x: _t, y: _t } as Vec2),
          },
        ],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("sig");
    });
  });

  describe("Field Artifacts", () => {
    it("translates Field:number to placeholder field", () => {
      const block = createBlock("b1", "FieldMap");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      // Create a minimal Field-like structure (use unknown cast to bypass type checks)
      const mockField = { n: 10 } as unknown as Field<number>;

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out", { kind: "Field:number", value: mockField }],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("field");
    });

    it("translates Field:vec2 to placeholder field", () => {
      const block = createBlock("b1", "Positions");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const mockField = { n: 10 } as unknown as Field<Vec2>;

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out", { kind: "Field:vec2", value: mockField }],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.get("out")?.k).toBe("field");
    });
  });

  describe("Special Artifacts", () => {
    it("skips RenderTreeProgram (no IR representation)", () => {
      const block = createBlock("b1", "Renderer");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        [
          "b1:out",
          {
            kind: "RenderTreeProgram",
            value: {
              signal: (_t: number, _ctx: RuntimeCtx) => ({
                kind: "group" as const,
                id: "root",
                children: [],
              }),
              event: (_ev: any) => [],
            },
          },
        ],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      // RenderTreeProgram doesn't create IR nodes
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeUndefined(); // No outputs stored
    });
  });

  describe("Multiple Outputs", () => {
    it("handles block with multiple output ports", () => {
      const block = createBlock("b1", "Splitter", ["out1", "out2", "out3"]);
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out1", { kind: "Scalar:number", value: 1 }],
        ["b1:out2", { kind: "Scalar:number", value: 2 }],
        ["b1:out3", { kind: "Scalar:number", value: 3 }],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeDefined();
      expect(outputs!.size).toBe(3);
      expect(Array.from(outputs!.values()).every((ref) => ref.k === "sig")).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("continues when artifact missing from compiledPortMap", () => {
      const block = createBlock("b1", "Test");
      const { validated, blocks } = createGraph([block], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>();
      // No artifacts - simulates compilation failure or unused output

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      // Should not error - just skip the block
      expect(result.errors).toHaveLength(0);
      const outputs = result.blockOutputs.get(0 as BlockIndex);
      expect(outputs).toBeUndefined();
    });

    it("handles invalid block index gracefully", () => {
      const { validated } = createGraph([], [createTrivialSCC(0)]);

      const compiledPortMap = new Map<string, Artifact>();

      const result = pass6BlockLowering(validated, [], compiledPortMap);

      // Should report error about invalid block index
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe("BlockMissing");
    });
  });

  describe("Integration", () => {
    it("preserves existing closure compilation (integration smoke test)", () => {
      // This test verifies Pass 6 is additive - doesn't break existing compilation
      const block1 = createBlock("b1", "Constant");
      const block2 = createBlock("b2", "Identity");

      const { validated, blocks } = createGraph(
        [block1, block2],
        [createTrivialSCC(0), createTrivialSCC(1)]
      );

      const compiledPortMap = new Map<string, Artifact>([
        ["b1:out", { kind: "Scalar:number", value: 42 }],
        [
          "b2:out",
          {
            kind: "Signal:number",
            value: (_t: number, _ctx: RuntimeCtx) => _t,
          },
        ],
      ]);

      const result = pass6BlockLowering(validated, blocks, compiledPortMap);

      // Both blocks should have IR
      expect(result.errors).toHaveLength(0);
      expect(result.blockOutputs.size).toBe(2);
      expect(result.blockOutputs.get(0 as BlockIndex)).toBeDefined();
      expect(result.blockOutputs.get(1 as BlockIndex)).toBeDefined();

      // Original compiledPortMap is unchanged
      expect(compiledPortMap.get("b1:out")).toEqual({
        kind: "Scalar:number",
        value: 42,
      });
    });
  });
});
