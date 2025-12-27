/**
 * Op Inversion Logic
 *
 * Generates inverse operations for undo support.
 * Must capture "before state" for destructive ops.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md
 */

import type { Patch } from '../types';
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
      if (!block) return null; // Block doesn't exist, can't capture state

      return {
        op: 'BlockAdd',
        block: { ...block }, // Shallow clone
      };
    }

    case 'BlockRetype': {
      // Inverse is retype back to original type (need to capture old type and params)
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (!block) return null;

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
      if (!block) return null;

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
      if (!block) return null;

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
        connectionId: op.connection.id,
      };
    }

    case 'WireRemove': {
      // Inverse of remove is add (need to capture the connection)
      const conn = doc.connections.find(c => c.id === op.connectionId);
      if (!conn) return null;

      return {
        op: 'WireAdd',
        connection: { ...conn }, // Shallow clone
      };
    }

    case 'WireRetarget': {
      // Inverse is retarget back to original endpoints
      const conn = doc.connections.find(c => c.id === op.connectionId);
      if (!conn) return null;

      const next: { from?: typeof conn.from; to?: typeof conn.to } = {};
      if (op.next.from) next.from = conn.from;
      if (op.next.to) next.to = conn.to;

      return {
        op: 'WireRetarget',
        connectionId: op.connectionId,
        next,
      };
    }

    // =========================================================================
    // Bus Ops
    // =========================================================================
    case 'BusAdd': {
      // Inverse of add is remove
      return {
        op: 'BusRemove',
        busId: op.bus.id,
      };
    }

    case 'BusRemove': {
      // Inverse of remove is add (need to capture the bus)
      const bus = doc.buses?.find(b => b.id === op.busId);
      if (!bus) return null;

      return {
        op: 'BusAdd',
        bus: { ...bus }, // Shallow clone
      };
    }

    case 'BusUpdate': {
      // Inverse is patch back to original values
      const bus = doc.buses?.find(b => b.id === op.busId);
      if (!bus) return null;

      const oldValues: any = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = (bus as any)[key];
      }

      return {
        op: 'BusUpdate',
        busId: op.busId,
        patch: oldValues,
      };
    }

    // =========================================================================
    // Binding Ops (Publishers)
    // =========================================================================
    case 'PublisherAdd': {
      // Inverse of add is remove
      return {
        op: 'PublisherRemove',
        publisherId: op.publisher.id,
      };
    }

    case 'PublisherRemove': {
      // Inverse of remove is add (need to capture the publisher)
      const pub = doc.publishers?.find(p => p.id === op.publisherId);
      if (!pub) return null;

      return {
        op: 'PublisherAdd',
        publisher: { ...pub }, // Shallow clone
      };
    }

    case 'PublisherUpdate': {
      // Inverse is patch back to original values
      const pub = doc.publishers?.find(p => p.id === op.publisherId);
      if (!pub) return null;

      const oldValues: any = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = (pub as any)[key];
      }

      return {
        op: 'PublisherUpdate',
        publisherId: op.publisherId,
        patch: oldValues,
      };
    }

    // =========================================================================
    // Binding Ops (Listeners)
    // =========================================================================
    case 'ListenerAdd': {
      // Inverse of add is remove
      return {
        op: 'ListenerRemove',
        listenerId: op.listener.id,
      };
    }

    case 'ListenerRemove': {
      // Inverse of remove is add (need to capture the listener)
      const listener = doc.listeners?.find(l => l.id === op.listenerId);
      if (!listener) return null;

      return {
        op: 'ListenerAdd',
        listener: { ...listener }, // Shallow clone
      };
    }

    case 'ListenerUpdate': {
      // Inverse is patch back to original values
      const listener = doc.listeners?.find(l => l.id === op.listenerId);
      if (!listener) return null;

      const oldValues: any = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = (listener as any)[key];
      }

      return {
        op: 'ListenerUpdate',
        listenerId: op.listenerId,
        patch: oldValues,
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
      if (!def) return null;

      return {
        op: 'CompositeDefAdd',
        def: { ...def }, // Shallow clone (may need deep clone for graph)
      };
    }

    case 'CompositeDefUpdate': {
      // Inverse is patch back to original values
      const def = doc.composites?.find(c => c.id === op.defId);
      if (!def) return null;

      const oldValues: any = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = (def as any)[key];
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
      if (!def) return null;

      const oldGraph = (def as any).graph;
      const oldExposed = (def as any).exposedPorts;

      return {
        op: 'CompositeDefReplaceGraph',
        defId: op.defId,
        nextGraph: {
          nodes: oldGraph?.blocks || [],
          edges: oldGraph?.connections || [],
          publishers: oldGraph?.publishers || [],
          listeners: oldGraph?.listeners || [],
        },
        nextExposed: oldExposed || { inputs: [], outputs: [] },
      };
    }

    // =========================================================================
    // Time/Settings Ops
    // =========================================================================
    case 'TimeRootSet': {
      // Inverse is set back to previous time root
      // Note: We need to track what the previous time root was
      // For now, capture it from settings if it exists
      const oldTimeRootId = (doc.settings as any).timeRootId;

      if (!oldTimeRootId) {
        // No previous time root set - this is not perfectly invertible
        // We'd need a special "unset" operation or null support
        return null;
      }

      return {
        op: 'TimeRootSet',
        blockId: oldTimeRootId,
      };
    }

    case 'PatchSettingsUpdate': {
      // Inverse is patch back to original values
      const oldValues: any = {};
      for (const key of Object.keys(op.patch)) {
        oldValues[key] = (doc.settings as any)[key];
      }

      return {
        op: 'PatchSettingsUpdate',
        patch: oldValues,
      };
    }

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
