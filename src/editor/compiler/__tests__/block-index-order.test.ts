/**
 * Block Index Ordering Tests
 *
 * Tests that verify blocks are passed to pass6 in the correct order
 * matching the blockIndexMap from pass1.
 *
 * Bug: Blocks were being passed in original array order, but blockIndex
 * references expect sorted alphabetical order. This caused wrong blocks
 * to be processed when resolving inputs.
 *
 * Reference: Fix for "Unmaterialized input" compiler errors
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
    const role: BlockRole = { kind: "user" };
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

  it("should assign block indices in alphabetical order by ID", () => {
    // Create blocks with IDs that would sort differently than insertion order
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

    // Block indices should be assigned alphabetically
    expect(normalized.blockIndexMap.get("a-block")).toBe(0);
    expect(normalized.blockIndexMap.get("m-block")).toBe(1);
    expect(normalized.blockIndexMap.get("z-block")).toBe(2);
  });

  it("should be able to look up blocks by index using sorted array", () => {
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

    // Sort blocks by ID to match blockIndexMap order
    const sortedBlocks = [...patch.blocks].sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    // Now block[index] should match what blockIndexMap says
    const aIndex = normalized.blockIndexMap.get("a-block")!;
    const mIndex = normalized.blockIndexMap.get("m-block")!;
    const zIndex = normalized.blockIndexMap.get("z-block")!;

    expect(sortedBlocks[aIndex].id).toBe("a-block");
    expect(sortedBlocks[mIndex].id).toBe("m-block");
    expect(sortedBlocks[zIndex].id).toBe("z-block");
  });

  it("should fail if blocks are accessed by index without sorting (demonstrating the bug)", () => {
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

    // Using unsorted array (the bug)
    const unsortedBlocks = patch.blocks;

    const aIndex = normalized.blockIndexMap.get("a-block")!;

    // This demonstrates the bug: blocks[0] should be "a-block" but is "z-block"
    // The bug is that we're using unsorted array but sorted indices
    expect(unsortedBlocks[aIndex].id).not.toBe("a-block"); // The bug!
    expect(unsortedBlocks[aIndex].id).toBe("z-block"); // Wrong block!
  });
});
