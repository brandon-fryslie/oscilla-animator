/**
 * Pass 1 Normalize Tests
 *
 * Tests for the pass1Normalize function.
 * Verifies block ID freezing, default source attachment, and edge canonicalization.
 *
 * TODO: Update tests for Edge-only architecture (Bus-Block unification)
 */

import { describe, it, expect } from "vitest";
import { pass1Normalize } from "../pass1-normalize";
import type {
  Patch,
  Block,
  // Connection,
  // Publisher,
  // Listener,
  // Bus,
  Slot,
  Edge,
} from "../../../types";

// Helper to create a minimal patch
function createPatch(overrides?: Partial<Patch>): Patch {
  return {
    version: 1,
    blocks: [],
    edges: [],
    defaultSources: [],
    settings: {
      seed: 0,
      speed: 1,
    },
    ...overrides,
  };
}

// Helper to create a minimal block
function createBlock(id: string, overrides?: Partial<Block>): Block {
  return {
    id,
    type: "test-block",
    label: `Block ${id}`,
    inputs: [],
    outputs: [],
    params: {},
    category: "Other",
    ...overrides,
  };
}

// Helper to create a slot
function createSlot(
  id: string,
  direction: "input" | "output",
  overrides?: Partial<Slot>
): Slot {
  return {
    id,
    label: id,
    type: "Signal<float>",
    direction,
    ...overrides,
  } as Slot;
}

// Helper to create an edge
function createEdge(
  fromBlock: string,
  fromSlot: string,
  toBlock: string,
  toSlot: string
): Edge {
  return {
    id: `${fromBlock}.${fromSlot}->${toBlock}.${toSlot}`,
    from: { kind: 'port', blockId: fromBlock, slotId: fromSlot },
    to: { kind: 'port', blockId: toBlock, slotId: toSlot },
    enabled: true,
  };
}

describe("pass1Normalize", () => {
  describe("Block ID Freezing", () => {
    it("freezes block IDs to indices in stable sorted order", () => {
      const patch = createPatch({
        blocks: [
          createBlock("block-3"),
          createBlock("block-1"),
          createBlock("block-2"),
        ],
      });

      const normalized = pass1Normalize(patch);

      // Sorted order: block-1 (0), block-2 (1), block-3 (2)
      expect(normalized.blockIndexMap.get("block-1")).toBe(0);
      expect(normalized.blockIndexMap.get("block-2")).toBe(1);
      expect(normalized.blockIndexMap.get("block-3")).toBe(2);
    });

    it("creates dense indices starting from 0", () => {
      const patch = createPatch({
        blocks: [createBlock("a"), createBlock("b"), createBlock("c")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.blockIndexMap.get("a")).toBe(0);
      expect(normalized.blockIndexMap.get("b")).toBe(1);
      expect(normalized.blockIndexMap.get("c")).toBe(2);
    });
  });

  describe("Default Source Attachment", () => {
    it("attaches default sources for unwired inputs", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
            ],
          }),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaults).toHaveLength(1);
      const ds = normalized.defaults[0];
      expect(ds.blockId).toBe("b1");
      expect(ds.slotId).toBe("in1");
      expect(ds.constId).toBe(0);

      // Verify the default value is stored in the const pool
      const defaultValue = normalized.constPool.get(ds.constId) as { world: string; value: number };
      expect(defaultValue).toBeDefined();
      expect(defaultValue.world).toBe("signal");
      expect(defaultValue.value).toBe(0.5);
    });

    it("does not attach default sources for wired inputs", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "output")],
          }),
          createBlock("b2", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
            ],
          }),
        ],
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaults).toHaveLength(0);
    });

    it("does not attach default sources for inputs with connected edges", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "output")],
          }),
          createBlock("b2", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
            ],
          }),
        ],
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      const normalized = pass1Normalize(patch);

      // Input is wired, so no default source should be attached
      expect(normalized.defaults).toHaveLength(0);
    });

    it("assigns sequential constId to default sources", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
              createSlot("in2", "input", {
                defaultSource: {
                  world: "signal",
                  value: 1.0,
                },
              }),
            ],
          }),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaults).toHaveLength(2);
      expect(normalized.defaults[0].constId).toBe(0);
      expect(normalized.defaults[1].constId).toBe(1);
    });
  });

  describe("Edge Canonicalization", () => {
    it("preserves enabled edges", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", { outputs: [createSlot("out1", "output")] }),
          createBlock("b2", { inputs: [createSlot("in1", "input")] }),
        ],
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.edges?.length).toBe(1);
      expect(normalized.edges?.[0]?.enabled).toBe(true);
    });

    it("filters disabled edges", () => {
      const disabledEdge = createEdge("b1", "out1", "b2", "in1");
      (disabledEdge as { enabled: boolean }).enabled = false;

      const patch = createPatch({
        blocks: [
          createBlock("b1", { outputs: [createSlot("out1", "output")] }),
          createBlock("b2", { inputs: [createSlot("in1", "input")] }),
        ],
        edges: [disabledEdge],
      });

      const normalized = pass1Normalize(patch);

      // Disabled edges are filtered during normalization
      expect(normalized.edges).toHaveLength(0);
    });
  });

  describe("Preserves Patch Structure", () => {
    it("preserves blocks and edges", () => {
      const patch = createPatch({
        blocks: [createBlock("b1"), createBlock("b2")],
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.blocks.size).toBe(2);
      expect(normalized.edges).toHaveLength(1);
    });
  });
});
