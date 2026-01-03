/**
 * Pass 1: Normalize Patch
 *
 * Transforms a raw Patch into a NormalizedPatch by:
 * 1. Freezing block IDs to dense numeric indices (stable, sorted)
 * 2. Attaching default sources for unwired inputs
 * 3. Canonicalizing edges (sort by sortKey, filter enabled)
 *
 * This is the entry point of the 11-pass compilation pipeline.
 * The normalized patch has a stable structure that later passes can rely on.
 *
 * Sprint: Bus-Block Unification
 * Status: Edges-only mode (legacy Connection/Publisher/Listener deprecated)
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
  ConstId,
  DefaultSourceAttachment,
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
 * Check if an input is connected via an edge.
 */
function hasEdgeToInput(edges: readonly Edge[], blockId: string, slotId: string): boolean {
  return edges.some(e =>
    e.to.kind === 'port' &&
    e.to.blockId === blockId &&
    e.to.slotId === slotId &&
    e.enabled
  );
}

/**
 * Normalize a patch for compilation.
 *
 * @param patch - The raw patch from the editor
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

  // Step 3: Identify unwired inputs and create default sources
  const defaults: DefaultSourceAttachment[] = [];
  const constPool = new Map<ConstId, unknown>();
  let constIdCounter = 0;

  for (const block of patch.blocks) {
    for (const input of block.inputs) {
      // Check if input is connected via edges
      const isConnected = hasEdgeToInput(edges, block.id, input.id);

      // If unconnected and has default source, attach it
      if (!isConnected && input.defaultSource != null) {
        const constId = constIdCounter++ as ConstId;
        defaults.push({
          blockId: block.id,
          slotId: input.id,
          constId,
        });
        // Store the default value in the const pool
        constPool.set(constId, input.defaultSource);
      }
    }
  }

  // Return normalized patch matching canonical schema
  return {
    blockIndexMap,
    blocks: blocksMap,
    edges,
    defaults,
    constPool,
  };
}
