/**
 * Pass 1: Normalize Patch
 *
 * Transforms a raw Patch into a NormalizedPatch by:
 * 1. Freezing block IDs to dense numeric indices (stable, sorted)
 * 2. Canonicalizing edges (sort by sortKey, filter enabled)
 *
 * This is the entry point of the 11-pass compilation pipeline.
 * The normalized patch has a stable structure that later passes can rely on.
 *
 * Sprint: Bus-Block Unification
 * Status: Edges-only mode (legacy Connection/Publisher/Listener deprecated)
 *
 * Note: Default source materialization removed from this pass.
 * Default sources are now materialized by GraphNormalizer before compilation.
 *
 * References:
 * - HANDOFF.md Topic 2: Pass 1 - Normalize Patch
 * - design-docs/12-Compiler-Final/02-IR-Schema.md
 */

import type {
  Patch,
  Edge,
} from "../../types";
import type {
  NormalizedPatch,
  BlockIndex,
} from "../ir/patches";

/**
 * Canonicalize edges: filter enabled, sort uniformly by sortKey.
 *
 * All edges are sorted deterministically for consistent bus combine order.
 * After Sprint 2 migration, all edges are port→port. Publisher edges
 * (to BusBlock.in) are sorted like any other edge.
 */
function canonicalizeEdges(edges: readonly Edge[]): readonly Edge[] {
  return edges
    .filter(e => e.enabled)
    .sort((a, b) => {
      if ((a.sortKey ?? 0) !== (b.sortKey ?? 0)) {
        return (a.sortKey ?? 0) - (b.sortKey ?? 0);
      }
      return a.id.localeCompare(b.id);
    });
}

/**
 * Normalize a patch for compilation.
 *
 * @param patch - The raw patch from the editor (already includes structural blocks from GraphNormalizer)
 * @returns A normalized patch with frozen IDs and canonical structure
 */
export function pass1Normalize(
  patch: Patch
): NormalizedPatch {
  // Canonicalize edges (filter enabled, sort by sortKey)
  const canonicalEdges = canonicalizeEdges(patch.edges);
  const edges = [...canonicalEdges];

  // Step 1: Freeze block IDs to indices (stable sorted order)
  const blockIndexMap = new Map<string, BlockIndex>();
  const sortedBlockIds = patch.blocks.map((b) => b.id).sort();

  let nextBlockIndex = 0;
  for (const blockId of sortedBlockIds) {
    blockIndexMap.set(blockId, nextBlockIndex++ as BlockIndex);
  }

  // Step 2: Create blocks Map (keyed by block id)
  const blocksMap = new Map<string, unknown>();
  for (const block of patch.blocks) {
    blocksMap.set(block.id, block);
  }

  // Return normalized patch matching canonical schema
  // Note: defaults and constPool removed - default sources are now
  // materialized as structural blocks by GraphNormalizer
  return {
    blockIndexMap,
    blocks: blocksMap,
    edges,
  };
}
