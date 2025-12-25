/**
 * Op Application Logic
 *
 * applies a single Op to a PatchDocument.
 * MUTATES the document in place (for performance).
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/8-PatchOpsCompleteSet.md
 */

import type { Patch } from '../types';
import type { Op } from './ops';

export function applyOp(doc: Patch, op: Op): void {
  switch (op.op) {
    // =========================================================================
    // Block Ops
    // =========================================================================
    case 'BlockAdd': {
      doc.blocks.push(op.block);
      break;
    }
    case 'BlockRemove': {
      const index = doc.blocks.findIndex(b => b.id === op.blockId);
      if (index !== -1) {
        doc.blocks.splice(index, 1);
      }
      break;
    }
    case 'BlockRetype': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block !== null && block !== undefined) {
        // block.type is readonly in type def but mutable in practice/store
        (block as { type: string }).type = op.nextType;
        // Remap params if provided
        // TODO: Implement param remapping logic
      }
      break;
    }
    case 'BlockSetLabel': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block !== null && block !== undefined) {
        block.label = op.label;
      }
      break;
    }
    case 'BlockPatchParams': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block !== null && block !== undefined) {
        Object.assign(block.params, op.patch);
      }
      break;
    }

    // =========================================================================
    // Wire Ops
    // =========================================================================
    case 'WireAdd': {
      doc.connections.push(op.connection);
      break;
    }
    case 'WireRemove': {
      const index = doc.connections.findIndex(c => c.id === op.connectionId);
      if (index !== -1) {
        doc.connections.splice(index, 1);
      }
      break;
    }
    case 'WireRetarget': {
      const conn = doc.connections.find(c => c.id === op.connectionId);
      if (conn !== null && conn !== undefined) {
        if (op.next.from !== undefined) {
          (conn as { from: typeof op.next.from }).from = op.next.from;
        }
        if (op.next.to !== undefined) {
          (conn as { to: typeof op.next.to }).to = op.next.to;
        }
      }
      break;
    }

    // =========================================================================
    // Bus Ops
    // =========================================================================
    case 'BusAdd': {
      if (doc.buses === undefined) doc.buses = [];
      doc.buses.push(op.bus);
      break;
    }
    case 'BusRemove': {
      if (doc.buses !== undefined) {
        const index = doc.buses.findIndex(b => b.id === op.busId);
        if (index !== -1) {
          doc.buses.splice(index, 1);
        }
      }
      break;
    }
    case 'BusUpdate': {
      const bus = doc.buses?.find(b => b.id === op.busId);
      if (bus !== null && bus !== undefined) {
        Object.assign(bus, op.patch);
      }
      break;
    }

    // =========================================================================
    // Binding Ops
    // =========================================================================
    case 'PublisherAdd': {
      if (doc.publishers === undefined) doc.publishers = [];
      doc.publishers.push(op.publisher);
      break;
    }
    case 'PublisherRemove': {
      if (doc.publishers !== undefined) {
        const index = doc.publishers.findIndex(p => p.id === op.publisherId);
        if (index !== -1) {
          doc.publishers.splice(index, 1);
        }
      }
      break;
    }
    case 'PublisherUpdate': {
      const pub = doc.publishers?.find(p => p.id === op.publisherId);
      if (pub !== null && pub !== undefined) {
        Object.assign(pub, op.patch);
      }
      break;
    }
    case 'ListenerAdd': {
      if (doc.listeners === undefined) doc.listeners = [];
      doc.listeners.push(op.listener);
      break;
    }
    case 'ListenerRemove': {
      if (doc.listeners !== undefined) {
        const index = doc.listeners.findIndex(l => l.id === op.listenerId);
        if (index !== -1) {
          doc.listeners.splice(index, 1);
        }
      }
      break;
    }
    case 'ListenerUpdate': {
      const listener = doc.listeners?.find(l => l.id === op.listenerId);
      if (listener !== null && listener !== undefined) {
        Object.assign(listener, op.patch);
      }
      break;
    }

    // =========================================================================
    // Composite Ops
    // =============================================================================
    case 'CompositeDefAdd': {
      if (doc.composites === undefined) doc.composites = [];
      doc.composites.push(op.def);
      break;
    }
    case 'CompositeDefRemove': {
      if (doc.composites !== undefined) {
        const index = doc.composites.findIndex(c => c.id === op.defId);
        if (index !== -1) {
          doc.composites.splice(index, 1);
        }
      }
      break;
    }
    case 'CompositeDefUpdate': {
      const def = doc.composites?.find(c => c.id === op.defId);
      if (def !== null && def !== undefined) {
        Object.assign(def, op.patch);
      }
      break;
    }
    case 'CompositeDefReplaceGraph': {
      const def = doc.composites?.find(c => c.id === op.defId);
      if (def !== null && def !== undefined) {
        // TODO: Implement full graph replacement logic
        // This is complex, requires updating blocks/connections/bindings inside the definition
      }
      break;
    }

    // =========================================================================
    // Time/Settings Ops
    // =========================================================================
    case 'TimeRootSet': {
      // TimeRoot is now just a block, this op might trigger UI updates or validation
      // No explicit field in Patch to set TimeRoot ID (it's derived), but maybe settings?
      // If Patch has a dedicated timeRootId field, update it.
      // Currently Patch doesn't have it. It's derived.
      // So this op might just be a marker or validated constraint.
      break;
    }
    case 'PatchSettingsUpdate': {
      Object.assign(doc.settings, op.patch);
      break;
    }

    // =========================================================================
    // Asset Ops
    // =========================================================================
    // TODO: Implement Asset ops when Assets are added to Patch type
  }
}
