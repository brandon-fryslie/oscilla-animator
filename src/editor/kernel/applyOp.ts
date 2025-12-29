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
    // Wire Ops
    // =========================================================================
    case 'WireAdd': {
      const existing = doc.connections.find(c => c.id === op.connection.id);
      if (existing !== undefined) {
        return { ok: false, error: `Connection with id '${op.connection.id}' already exists` };
      }
      const fromBlock = doc.blocks.find(b => b.id === op.connection.from.blockId);
      const toBlock = doc.blocks.find(b => b.id === op.connection.to.blockId);
      if (fromBlock === undefined) {
        return { ok: false, error: `Source block '${op.connection.from.blockId}' not found` };
      }
      if (toBlock === undefined) {
        return { ok: false, error: `Target block '${op.connection.to.blockId}' not found` };
      }
      if (op.connection.from.direction !== 'output') {
        return { ok: false, error: `Wire source must be an output (got ${op.connection.from.direction})` };
      }
      if (op.connection.to.direction !== 'input') {
        return { ok: false, error: `Wire target must be an input (got ${op.connection.to.direction})` };
      }
      doc.connections.push(op.connection);
      return { ok: true };
    }

    case 'WireRemove': {
      const index = doc.connections.findIndex(c => c.id === op.connectionId);
      if (index === -1) {
        return { ok: false, error: `Connection '${op.connectionId}' not found` };
      }
      doc.connections.splice(index, 1);
      return { ok: true };
    }

    case 'WireRetarget': {
      const conn = doc.connections.find(c => c.id === op.connectionId);
      if (conn === undefined) {
        return { ok: false, error: `Connection '${op.connectionId}' not found` };
      }
      const newFrom = op.next.from;
      if (newFrom !== undefined) {
        const fromBlock = doc.blocks.find(b => b.id === newFrom.blockId);
        if (fromBlock === undefined) {
          return { ok: false, error: `Source block '${newFrom.blockId}' not found` };
        }
        if (newFrom.direction !== 'output') {
          return { ok: false, error: `Wire source must be an output (got ${newFrom.direction})` };
        }
        (conn as { from: typeof newFrom }).from = newFrom;
      }
      const newTo = op.next.to;
      if (newTo !== undefined) {
        const toBlock = doc.blocks.find(b => b.id === newTo.blockId);
        if (toBlock === undefined) {
          return { ok: false, error: `Target block '${newTo.blockId}' not found` };
        }
        if (newTo.direction !== 'input') {
          return { ok: false, error: `Wire target must be an input (got ${newTo.direction})` };
        }
        (conn as { to: typeof newTo }).to = newTo;
      }
      return { ok: true };
    }

    // =========================================================================
    // Bus Ops
    // =========================================================================
    case 'BusAdd': {
      if (doc.buses === undefined) doc.buses = [];
      const existing = doc.buses.find(b => b.id === op.bus.id);
      if (existing !== undefined) {
        return { ok: false, error: `Bus with id '${op.bus.id}' already exists` };
      }
      doc.buses.push(op.bus);
      return { ok: true };
    }

    case 'BusRemove': {
      if (doc.buses === undefined) {
        return { ok: false, error: `Bus '${op.busId}' not found (no buses defined)` };
      }
      const index = doc.buses.findIndex(b => b.id === op.busId);
      if (index === -1) {
        return { ok: false, error: `Bus '${op.busId}' not found` };
      }
      doc.buses.splice(index, 1);
      return { ok: true };
    }

    case 'BusUpdate': {
      if (doc.buses === undefined) {
        return { ok: false, error: `Bus '${op.busId}' not found (no buses defined)` };
      }
      const bus = doc.buses.find(b => b.id === op.busId);
      if (bus === undefined) {
        return { ok: false, error: `Bus '${op.busId}' not found` };
      }
      Object.assign(bus, op.patch);
      return { ok: true };
    }

    // =========================================================================
    // Binding Ops (Publishers)
    // =========================================================================
    case 'PublisherAdd': {
      if (doc.publishers === undefined) doc.publishers = [];
      const existing = doc.publishers.find(p => p.id === op.publisher.id);
      if (existing !== undefined) {
        return { ok: false, error: `Publisher with id '${op.publisher.id}' already exists` };
      }
      if (doc.buses === undefined) {
        return { ok: false, error: `Bus '${op.publisher.busId}' not found (no buses defined)` };
      }
      const bus = doc.buses.find(b => b.id === op.publisher.busId);
      if (bus === undefined) {
        return { ok: false, error: `Bus '${op.publisher.busId}' not found` };
      }
      const block = doc.blocks.find(b => b.id === op.publisher.from.blockId);
      if (block === undefined) {
        return { ok: false, error: `Source block '${op.publisher.from.blockId}' not found` };
      }
      doc.publishers.push(op.publisher);
      return { ok: true };
    }

    case 'PublisherRemove': {
      if (doc.publishers === undefined) {
        return { ok: false, error: `Publisher '${op.publisherId}' not found (no publishers defined)` };
      }
      const index = doc.publishers.findIndex(p => p.id === op.publisherId);
      if (index === -1) {
        return { ok: false, error: `Publisher '${op.publisherId}' not found` };
      }
      doc.publishers.splice(index, 1);
      return { ok: true };
    }

    case 'PublisherUpdate': {
      if (doc.publishers === undefined) {
        return { ok: false, error: `Publisher '${op.publisherId}' not found (no publishers defined)` };
      }
      const pub = doc.publishers.find(p => p.id === op.publisherId);
      if (pub === undefined) {
        return { ok: false, error: `Publisher '${op.publisherId}' not found` };
      }
      Object.assign(pub, op.patch);
      return { ok: true };
    }

    // =========================================================================
    // Binding Ops (Listeners)
    // =========================================================================
    case 'ListenerAdd': {
      if (doc.listeners === undefined) doc.listeners = [];
      const existing = doc.listeners.find(l => l.id === op.listener.id);
      if (existing !== undefined) {
        return { ok: false, error: `Listener with id '${op.listener.id}' already exists` };
      }
      if (doc.buses === undefined) {
        return { ok: false, error: `Bus '${op.listener.busId}' not found (no buses defined)` };
      }
      const bus = doc.buses.find(b => b.id === op.listener.busId);
      if (bus === undefined) {
        return { ok: false, error: `Bus '${op.listener.busId}' not found` };
      }
      const block = doc.blocks.find(b => b.id === op.listener.to.blockId);
      if (block === undefined) {
        return { ok: false, error: `Target block '${op.listener.to.blockId}' not found` };
      }
      doc.listeners.push(op.listener);
      return { ok: true };
    }

    case 'ListenerRemove': {
      if (doc.listeners === undefined) {
        return { ok: false, error: `Listener '${op.listenerId}' not found (no listeners defined)` };
      }
      const index = doc.listeners.findIndex(l => l.id === op.listenerId);
      if (index === -1) {
        return { ok: false, error: `Listener '${op.listenerId}' not found` };
      }
      doc.listeners.splice(index, 1);
      return { ok: true };
    }

    case 'ListenerUpdate': {
      if (doc.listeners === undefined) {
        return { ok: false, error: `Listener '${op.listenerId}' not found (no listeners defined)` };
      }
      const listener = doc.listeners.find(l => l.id === op.listenerId);
      if (listener === undefined) {
        return { ok: false, error: `Listener '${op.listenerId}' not found` };
      }
      Object.assign(listener, op.patch);
      return { ok: true };
    }

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
          connections: unknown[];
          publishers: unknown[];
          listeners: unknown[];
        };
        exposedPorts: unknown;
      }

      const defWithGraph = def as unknown as DefWithGraph;
      defWithGraph.graph = {
        blocks: op.nextGraph.nodes,
        connections: op.nextGraph.edges,
        publishers: op.nextGraph.publishers ?? [],
        listeners: op.nextGraph.listeners ?? [],
      };
      defWithGraph.exposedPorts = op.nextExposed;
      return { ok: true };
    }

    // =========================================================================
    // Time/Settings Ops
    // =========================================================================
    case 'TimeRootSet': {
      const block = doc.blocks.find(b => b.id === op.blockId);
      if (block === undefined) {
        return { ok: false, error: `Block '${op.blockId}' not found` };
      }

      // Type assertion since timeRootId isn't in the settings type yet
      (doc.settings as Record<string, unknown>).timeRootId = op.blockId;
      return { ok: true };
    }

    case 'PatchSettingsUpdate': {
      Object.assign(doc.settings, op.patch);
      return { ok: true };
    }

    // =========================================================================
    // Asset Ops
    // =========================================================================
    case 'AssetAdd':
    case 'AssetRemove':
    case 'AssetUpdate':
      return { ok: false, error: 'Asset operations not yet implemented (assets not in Patch type)' };
  }
}
