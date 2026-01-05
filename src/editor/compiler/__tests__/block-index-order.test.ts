/**
 * Block Index Ordering Tests
 *
 * Tests that verify blocks are assigned indices in their original array order.
 *
 * Design decision: Block indices use original array order (not sorted) because:
 * - All blocks are identical (no priority classes)
 * - Cycles will be supported (no valid topological order exists)
 * - Index assignment just needs to be consistent within a single compile
 */

import { describe, it, expect } from "vitest";
import { pass1Normalize } from "../passes/pass1-normalize";
import type { Patch, Block, BlockRole } from "../../types";

// Import block compilers to trigger registerBlockType() calls
import "../blocks/index";

describe("Block Index Ordering", () => {
  /**
   * Helper to create a minimal block
   */
  function createBlock(id: string, type: string = "InfiniteTimeRoot"): Block {
    const role: BlockRole = { kind: "user", meta: {} };
    return {
      id,
      type,
      label: type,
      params: {},
      position: { x: 0, y: 0 },
      form: "primitive" as const,
      role,
    };
  }

  it("should assign block indices in original array order", () => {
    // Create blocks with IDs in non-alphabetical order
    const patch: Patch = {
      id: "test",
      blocks: [
        createBlock("z-block"),
        createBlock("a-block"),
        createBlock("m-block"),
      ],
      edges: [],
      buses: [],
    };

    const normalized = pass1Normalize(patch);

    // Block indices should match original array order
    expect(normalized.blockIndexMap.get("z-block")).toBe(0);
    expect(normalized.blockIndexMap.get("a-block")).toBe(1);
    expect(normalized.blockIndexMap.get("m-block")).toBe(2);
  });

  it("should be able to look up blocks by index using original array", () => {
    const patch: Patch = {
      id: "test",
      blocks: [
        createBlock("z-block"),
        createBlock("a-block"),
        createBlock("m-block"),
      ],
      edges: [],
      buses: [],
    };

    const normalized = pass1Normalize(patch);

    // blocks[index] should work correctly with original array
    const zIndex = normalized.blockIndexMap.get("z-block")!;
    const aIndex = normalized.blockIndexMap.get("a-block")!;
    const mIndex = normalized.blockIndexMap.get("m-block")!;

    expect(patch.blocks[zIndex].id).toBe("z-block");
    expect(patch.blocks[aIndex].id).toBe("a-block");
    expect(patch.blocks[mIndex].id).toBe("m-block");
  });

  it("should handle single block correctly", () => {
    const patch: Patch = {
      id: "test",
      blocks: [createBlock("only-block")],
      edges: [],
      buses: [],
    };

    const normalized = pass1Normalize(patch);

    expect(normalized.blockIndexMap.get("only-block")).toBe(0);
    expect(normalized.blockIndexMap.size).toBe(1);
  });

  it("should handle empty blocks array", () => {
    const patch: Patch = {
      id: "test",
      blocks: [],
      edges: [],
      buses: [],
    };

    const normalized = pass1Normalize(patch);

    expect(normalized.blockIndexMap.size).toBe(0);
  });
});
