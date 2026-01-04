/**
 * Op Inversion Logic
 *
 * Generates inverse operations for undo support.
 * Must capture "before state" for destructive ops.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md
 */

import type { Patch, Block, Edge } from '../types';
import type { Op } from './ops';

/**
 * Generate the inverse of an op given the current document state.
 * The inverse op, when applied, will undo the effect of the original op.
 *
 * IMPORTANT: This must be called BEFORE applyOp() to capture the before-state
 * for operations that need it (remove, update, retype).
 *
 * @param doc - Current patch document (before the op is applied)
 * @param op - The op to invert
 * @returns The inverse op, or null if the op is not invertible
 */
export function invertOp(doc: Patch, op: Op): Op | null {
  switch (op.op) {
    // =========================================================================
    // Block Ops
    // =========================================================================
    case 'BlockAdd': {
      // Inverse of add is remove
      return {
        op: 'BlockRemove',
        blockId: op.block.id,
      };
    }

    case 'BlockRemove': {
      // Inverse of remove is add (need to capture the block before removal)
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) return null; // Block doesn't exist, can't capture state

      return {
        op: 'BlockAdd',
        block: { ...block }, // Shallow clone
      };
    }

    case 'BlockRetype': {
      // Inverse is retype back to original type (need to capture old type and params)
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) return null;

      return {
        op: 'BlockRetype',
        blockId: op.blockId,
        nextType: block.type,
        // Capture old params by using schema remap
        remap: { kind: 'byKey' },
      };
    }

    case 'BlockSetLabel': {
      // Inverse is set label back to original
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) return null;

      return {
        op: 'BlockSetLabel',
        blockId: op.blockId,
        label: block.label,
      };
    }

    case 'BlockPatchParams': {
      // Inverse is patch back to original values
      // Need to capture the values being overwritten
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) return null;

      const oldValues: Record<string, unknown> = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = block.params[key];
      }

      return {
        op: 'BlockPatchParams',
        blockId: op.blockId,
        patch: oldValues,
      };
    }

    // =========================================================================
    // Wire Ops
    // =========================================================================
    case 'WireAdd': {
      // Inverse of add is remove
      return {
        op: 'WireRemove',
        edgeId: op.edge.id,
      };
    }

    case 'WireRemove': {
      // Inverse of remove is add (need to capture the edge)
      const edge = doc.edges.find(e => e.id === op.edgeId);
      if (edge === undefined) return null;

      // Edge is already in correct format
      return {
        op: 'WireAdd',
        edge: { ...edge }, // Shallow clone
      };
    }

    case 'WireRetarget': {
      // Inverse is retarget back to original endpoints
      const edge = doc.edges.find(e => e.id === op.edgeId);
      if (edge === undefined) return null;

      // Convert Edge endpoints to PortRef format
      const next: { from?: import('../types').PortRef; to?: import('../types').PortRef } = {};
      if (op.next.from !== undefined) {
        next.from = { blockId: edge.from.blockId, slotId: edge.from.slotId, direction: 'output' };
      }
      if (op.next.to !== undefined) {
        next.to = { blockId: edge.to.blockId, slotId: edge.to.slotId, direction: 'input' };
      }

      return {
        op: 'WireRetarget',
        edgeId: op.edgeId,
        next,
      };
    }

    // =========================================================================
    // Composite Ops
    // =========================================================================
    case 'CompositeDefAdd': {
      // Inverse of add is remove
      return {
        op: 'CompositeDefRemove',
        defId: op.def.id,
      };
    }

    case 'CompositeDefRemove': {
      // Inverse of remove is add (need to capture the definition)
      const def = doc.composites?.find(c => c.id === op.defId);
      if (def === undefined) return null;

      return {
        op: 'CompositeDefAdd',
        def: { ...def }, // Shallow clone (may need deep clone for graph)
      };
    }

    case 'CompositeDefUpdate': {
      // Inverse is patch back to original values
      const def = doc.composites?.find(c => c.id === op.defId);
      if (def === undefined) return null;

      const oldValues: Record<string, unknown> = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = (def as unknown as Record<string, unknown>)[key];
      }

      return {
        op: 'CompositeDefUpdate',
        defId: op.defId,
        patch: oldValues,
      };
    }

    case 'CompositeDefReplaceGraph': {
      // Inverse is replace back to original graph
      const def = doc.composites?.find(c => c.id === op.defId);
      if (def === undefined) return null;

      // Type assertion since composites aren't fully in the Patch type yet
      interface DefWithGraph {
        graph?: {
          blocks?: Block[];
          edges?: Edge[];
        };
        exposedParams?: Record<string, { blockId: string; paramName: string }>;
      }

      const defWithGraph = def as unknown as DefWithGraph;
      const oldGraph = defWithGraph.graph;
      const oldExposed = defWithGraph.exposedParams;

      return {
        op: 'CompositeDefReplaceGraph',
        defId: op.defId,
        nextGraph: {
          blocks: oldGraph?.blocks ?? [],
          edges: oldGraph?.edges ?? [],
        },
        nextExposedParams: oldExposed ?? {},
      };
    }

    // =========================================================================
    // Time/Settings Ops
    // =========================================================================
    case 'TimeRootSet':
    case 'PatchSettingsUpdate':
      // Settings not yet implemented - can't invert
      return null;

    // =========================================================================
    // Asset Ops
    // =========================================================================
    case 'AssetAdd':
    case 'AssetRemove':
    case 'AssetUpdate':
      // Assets not yet implemented - can't invert
      return null;

    default: {
      // TypeScript exhaustiveness check
      void op;
      return null;
    }
  }
}
