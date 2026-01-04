/**
 * Op Application Logic
 *
 * Applies a single Op to a PatchDocument with full validation and error handling.
 * MUTATES the document in place (for performance) on success.
 * Returns descriptive errors on failure without mutation.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/8-PatchOpsCompleteSet.md
 */

import type { Patch } from '../types';
import type { Op } from './ops';

// =============================================================================
// Result Types
// =============================================================================

export type OpResult =
  | { ok: true }
  | { ok: false; error: string };

// =============================================================================
// Apply Op
// =============================================================================

/**
 * Apply a single op to a patch document.
 * Validates preconditions and returns descriptive errors on failure.
 * Mutates the document in place on success.
 */
export function applyOp(doc: Patch, op: Op): OpResult {
  switch (op.op) {
    // =========================================================================
    // Block Ops
    // =========================================================================
    case 'BlockAdd': {
      const existing = doc.blocks.find(b => b.id === op.block.id);
      if (existing !== undefined) {
        return { ok: false, error: `Block with id '${op.block.id}' already exists` };
      }
      doc.blocks.push(op.block);
      return { ok: true };
    }

    case 'BlockRemove': {
      const index = doc.blocks.findIndex(b => b.id === op.blockId);
      if (index === -1) {
        return { ok: false, error: `Block '${op.blockId}' not found` };
      }
      doc.blocks.splice(index, 1);
      return { ok: true };
    }

    case 'BlockRetype': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) {
        return { ok: false, error: `Block '${op.blockId}' not found` };
      }
      (block as { type: string }).type = op.nextType;
      if (op.remap === undefined || (op.remap.kind === 'schema' && op.remap.schemaId !== undefined && op.remap.schemaId.length > 0)) {
        block.params = {};
      }
      return { ok: true };
    }

    case 'BlockSetLabel': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) {
        return { ok: false, error: `Block '${op.blockId}' not found` };
      }
      block.label = op.label;
      return { ok: true };
    }

    case 'BlockPatchParams': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) {
        return { ok: false, error: `Block '${op.blockId}' not found` };
      }
      Object.assign(block.params, op.patch);
      return { ok: true };
    }

    // =========================================================================
    // Wire Ops (operate on edges array)
    // =========================================================================
    case 'WireAdd': {
      const existing = doc.edges.find(e => e.id === op.edge.id);
      if (existing !== undefined) {
        return { ok: false, error: `Edge with id '${op.edge.id}' already exists` };
      }
      const fromBlock = doc.blocks.find(b => b.id === op.edge.from.blockId);
      const toBlock = doc.blocks.find(b => b.id === op.edge.to.blockId);
      if (fromBlock === undefined) {
        return { ok: false, error: `Source block '${op.edge.from.blockId}' not found` };
      }
      if (toBlock === undefined) {
        return { ok: false, error: `Target block '${op.edge.to.blockId}' not found` };
      }

      // Edge is already in the correct format
      doc.edges.push(op.edge);
      return { ok: true };
    }

    case 'WireRemove': {
      const index = doc.edges.findIndex(e => e.id === op.edgeId);
      if (index === -1) {
        return { ok: false, error: `Edge '${op.edgeId}' not found` };
      }
      doc.edges.splice(index, 1);
      return { ok: true };
    }

    case 'WireRetarget': {
      const edge = doc.edges.find(e => e.id === op.edgeId);
      if (edge === undefined) {
        return { ok: false, error: `Edge '${op.edgeId}' not found` };
      }
      const newFrom = op.next.from;
      if (newFrom !== undefined) {
        const fromBlock = doc.blocks.find(b => b.id === newFrom.blockId);
        if (fromBlock === undefined) {
          return { ok: false, error: `Source block '${newFrom.blockId}' not found` };
        }
        (edge as { from: import('../types').Endpoint }).from = {
          kind: 'port',
          blockId: newFrom.blockId,
          slotId: newFrom.slotId,
        };
      }
      const newTo = op.next.to;
      if (newTo !== undefined) {
        const toBlock = doc.blocks.find(b => b.id === newTo.blockId);
        if (toBlock === undefined) {
          return { ok: false, error: `Target block '${newTo.blockId}' not found` };
        }
        (edge as { to: import('../types').Endpoint }).to = {
          kind: 'port',
          blockId: newTo.blockId,
          slotId: newTo.slotId,
        };
      }
      return { ok: true };
    }

    // Bus Ops - REMOVED (buses are now BusBlocks, use BlockAdd/BlockRemove)
    // Publisher/Listener Ops - REMOVED (use WireAdd/WireRemove for Edges)

    // =========================================================================
    // Composite Ops
    // =========================================================================
    case 'CompositeDefAdd': {
      if (doc.composites === undefined) doc.composites = [];
      const existing = doc.composites.find(c => c.id === op.def.id);
      if (existing !== undefined) {
        return { ok: false, error: `Composite definition with id '${op.def.id}' already exists` };
      }
      doc.composites.push(op.def);
      return { ok: true };
    }

    case 'CompositeDefRemove': {
      if (doc.composites === undefined) {
        return { ok: false, error: `Composite definition '${op.defId}' not found (no composites defined)` };
      }
      const index = doc.composites.findIndex(c => c.id === op.defId);
      if (index === -1) {
        return { ok: false, error: `Composite definition '${op.defId}' not found` };
      }
      doc.composites.splice(index, 1);
      return { ok: true };
    }

    case 'CompositeDefUpdate': {
      if (doc.composites === undefined) {
        return { ok: false, error: `Composite definition '${op.defId}' not found (no composites defined)` };
      }
      const def = doc.composites.find(c => c.id === op.defId);
      if (def === undefined) {
        return { ok: false, error: `Composite definition '${op.defId}' not found` };
      }
      Object.assign(def, op.patch);
      return { ok: true };
    }

    case 'CompositeDefReplaceGraph': {
      if (doc.composites === undefined) {
        return { ok: false, error: `Composite definition '${op.defId}' not found (no composites defined)` };
      }
      const def = doc.composites.find(c => c.id === op.defId);
      if (def === undefined) {
        return { ok: false, error: `Composite definition '${op.defId}' not found` };
      }

      // Type assertion since composites aren't fully in the Patch type yet
      interface DefWithGraph {
        graph: {
          blocks: unknown[];
          edges: unknown[];
        };
        exposedParams: unknown;
      }

      const defWithGraph = def as unknown as DefWithGraph;
      defWithGraph.graph = {
        blocks: op.nextGraph.blocks,
        edges: op.nextGraph.edges,
      };
      defWithGraph.exposedParams = op.nextExposedParams;
      return { ok: true };
    }

    // =========================================================================
    // Time/Settings Ops
    // =========================================================================
    case 'TimeRootSet':
    case 'PatchSettingsUpdate':
      return { ok: false, error: 'Settings operations not yet implemented (settings not in Patch type)' };

    // =========================================================================
    // Asset Ops
    // =========================================================================
    case 'AssetAdd':
    case 'AssetRemove':
    case 'AssetUpdate':
      return { ok: false, error: 'Asset operations not yet implemented (assets not in Patch type)' };
  }
}
