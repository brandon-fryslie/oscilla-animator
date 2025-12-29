/**
 * Pass 1: Normalize Patch
 *
 * Transforms a raw Patch into a NormalizedPatch by:
 * 1. Freezing block IDs to dense numeric indices (stable, sorted)
 * 2. Attaching default sources for unwired inputs without bus listeners
 * 3. Canonicalizing publishers/listeners (sort by sortKey, filter enabled)
 *
 * This is the entry point of the 11-pass compilation pipeline.
 * The normalized patch has a stable structure that later passes can rely on.
 *
 * References:
 * - HANDOFF.md Topic 2: Pass 1 - Normalize Patch
 * - design-docs/12-Compiler-Final/02-IR-Schema.md
 */

import type {
  Patch,
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
  SlotWorld,
} from "../../types";
import type {
  NormalizedPatch,
  BlockIndex,
  ConstId,
  DefaultSourceAttachment,
} from "../ir/patches";
import type { TypeWorld } from "../ir/types";

/**
 * Convert editor SlotWorld to IR TypeWorld.
 * At compile time, 'config' becomes 'scalar' (compile-time constants).
 */
function slotWorldToTypeWorld(slotWorld: SlotWorld): TypeWorld {
  if (slotWorld === "config") {
    return "scalar";
  }
  return slotWorld;
}

/**
 * Normalize a patch for compilation.
 *
 * @param patch - The raw patch from the editor
 * @returns A normalized patch with frozen IDs and canonical structure
 */
export function pass1Normalize(
  patch: Patch
): NormalizedPatch<Block, Connection, Publisher, Listener, Bus> {
  // Step 1: Freeze block IDs to indices (stable sorted order)
  const blockIndexMap = new Map<string, BlockIndex>();
  const sortedBlockIds = patch.blocks.map((b) => b.id).sort();

  let nextBlockIndex = 0;
  for (const blockId of sortedBlockIds) {
    blockIndexMap.set(blockId, nextBlockIndex++ as BlockIndex);
  }

  // Step 2: Identify unwired inputs and create default sources
  const defaultSources: DefaultSourceAttachment[] = [];
  let constIdCounter = 0;

  for (const block of patch.blocks) {
    for (const input of block.inputs) {
      // Check if input has a wire
      const hasWire = patch.connections.some(
        (conn) => conn.to.blockId === block.id && conn.to.slotId === input.id
      );

      // Check if input has a bus listener
      const hasListener = patch.listeners.some(
        (listener) =>
          listener.enabled &&
          listener.to.blockId === block.id &&
          listener.to.slotId === input.id
      );

      // If neither wire nor listener, attach default source
      if (!hasWire && !hasListener && input.defaultSource != null) {
        defaultSources.push({
          blockId: block.id,
          slotId: input.id,
          constId: constIdCounter++ as ConstId,
          type: {
            world: slotWorldToTypeWorld(input.defaultSource.world),
            domain: "float", // Simplified for now - could be derived from slot type
          },
        });
      }
    }
  }

  // Step 3: Canonicalize publishers (enabled only, sorted by sortKey then id)
  const canonicalPublishers = patch.publishers
    .filter((p) => p.enabled)
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.id.localeCompare(b.id);
    });

  // Step 4: Canonicalize listeners (enabled only)
  const canonicalListeners = patch.listeners.filter((l) => l.enabled);

  // Return normalized patch
  return {
    blockIndexMap,
    blocks: patch.blocks,
    wires: patch.connections,
    publishers: canonicalPublishers,
    listeners: canonicalListeners,
    buses: patch.buses,
    defaultSources,
  };
}
