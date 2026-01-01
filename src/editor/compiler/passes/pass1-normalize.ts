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
 * Sprint: Phase 0 - Sprint 1: Unify Connections → Edge Type
 * Updates: Now accepts patches with unified edges and passes them through to
 * downstream passes. Continues to support legacy format for backward compatibility.
 *
 * References:
 * - HANDOFF.md Topic 2: Pass 1 - Normalize Patch
 * - design-docs/12-Compiler-Final/02-IR-Schema.md
 * - .agent_planning/phase0-architecture-refactoring/PLAN-2025-12-31-170000-sprint1-connections.md
 */

import type {
  Patch,
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
  SlotWorld,
  Edge,
} from "../../types";
import type {
  NormalizedPatch,
  BlockIndex,
  ConstId,
  DefaultSourceAttachment,
} from "../ir/patches";
import type { TypeWorld } from "../ir/types";
import { asTypeDesc } from "../ir/types";
import { convertFromEdges } from "../../edgeMigration";

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
 * Canonicalize edges: filter enabled, sort publishers by sortKey.
 * This ensures deterministic ordering for bus combines.
 */
function canonicalizeEdges(edges: readonly Edge[]): readonly Edge[] {
  // Filter enabled edges only
  const enabled = edges.filter(e => e.enabled);

  // Sort publisher edges (port→bus) by sortKey for deterministic bus combines
  const publishers = enabled
    .filter(e => e.from.kind === 'port' && e.to.kind === 'bus')
    .sort((a, b) => {
      if ((a.sortKey ?? 0) !== (b.sortKey ?? 0)) {
        return (a.sortKey ?? 0) - (b.sortKey ?? 0);
      }
      return a.id.localeCompare(b.id);
    });

  // Non-publisher edges don't need sorting
  const nonPublishers = enabled.filter(e => !(e.from.kind === 'port' && e.to.kind === 'bus'));

  return [...publishers, ...nonPublishers];
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
): NormalizedPatch<Block, Connection, Publisher, Listener, Bus> {
  // Step 0: Handle edge format (unified or legacy)
  // For backward compatibility, we support both formats during migration
  let connections: Connection[];
  let publishers: Publisher[];
  let listeners: Listener[];
  let edges: Edge[] | undefined;

  if (patch.edges !== undefined && patch.edges !== null && patch.edges.length > 0) {
    // New format: patch has unified edges array
    // Canonicalize edges (filter enabled, sort publishers)
    const canonical = canonicalizeEdges(patch.edges);
    edges = [...canonical];  // Make mutable copy for NormalizedPatch

    // Also convert to legacy format for passes that haven't migrated yet
    const converted = convertFromEdges(patch.edges);
    connections = converted.connections;
    publishers = converted.publishers;
    listeners = converted.listeners;
  } else {
    // Legacy format: patch has separate arrays
    connections = patch.connections ?? [];
    publishers = patch.publishers ?? [];
    listeners = patch.listeners ?? [];
    edges = undefined;
  }

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
      // Check if input is connected
      let isConnected: boolean;

      if (edges !== undefined && edges !== null) {
        // Use unified edges to check connectivity
        isConnected = hasEdgeToInput(edges, block.id, input.id);
      } else {
        // Use legacy arrays to check connectivity
        const hasWire = connections.some(
          (conn) => conn.to.blockId === block.id && conn.to.slotId === input.id
        );
        const hasListener = listeners.some(
          (listener) =>
            listener.enabled &&
            listener.to.blockId === block.id &&
            listener.to.slotId === input.id
        );
        isConnected = hasWire || hasListener;
      }

      // If unconnected and has default source, attach it
      if (!isConnected && input.defaultSource != null) {
        defaultSources.push({
          blockId: block.id,
          slotId: input.id,
          constId: constIdCounter++ as ConstId,
          type: asTypeDesc({
            world: slotWorldToTypeWorld(input.defaultSource.world),
            domain: "float", // Simplified for now - could be derived from slot type
          }),
        });
      }
    }
  }

  // Step 3: Canonicalize legacy publishers (enabled only, sorted by sortKey then id)
  // This is only used if we're in legacy mode
  const canonicalPublishers = publishers
    .filter((p) => p.enabled)
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.id.localeCompare(b.id);
    });

  // Step 4: Canonicalize legacy listeners (enabled only)
  const canonicalListeners = listeners.filter((l) => l.enabled);

  // Return normalized patch with both formats
  return {
    blockIndexMap,
    blocks: patch.blocks,
    edges,  // Pass through unified edges if present
    wires: connections,
    publishers: canonicalPublishers,
    listeners: canonicalListeners,
    buses: patch.buses,
    defaultSources,
  };
}
