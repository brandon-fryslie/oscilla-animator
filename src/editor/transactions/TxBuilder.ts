/**
 * @file Transaction Builder
 * @description The ONLY way to mutate patch state.
 *
 * All mutations flow through runTx(), which:
 * - Creates a TxBuilder
 * - Calls user build function
 * - Commits ops to stores atomically
 * - Computes inverse ops for undo
 * - Emits GraphCommitted event
 *
 * Design principles:
 * - TxBuilder provides safe, high-level mutation API
 * - All ops are captured in order
 * - Inverse ops computed at commit time (when we have "before" state)
 * - MobX reactivity preserved (Update ops mutate in place)
 * - No partial commits (rollback on error)
 *
 * @see design-docs/6-Transactions/3-TxBuilderSpec.md
 */

import { runInAction } from 'mobx';
import type { RootStore } from '../stores/RootStore';
import type { Op, TableName, Entity, Position } from './ops';
import { computeInverse, validateOp } from './ops';
import type { Block, Connection, Bus, Publisher, Listener, Lane, Composite, PortRef } from '../types';

/**
 * Transaction specification.
 */
export interface TxSpec {
  /** Human-readable label for history display */
  readonly label?: string;

  /** Origin of this transaction (for debugging/logging) */
  readonly origin?: 'ui' | 'import' | 'migration' | 'system' | 'remote';
}

/**
 * Transaction result.
 */
export interface TxResult {
  /** Forward ops that were applied */
  readonly ops: Op[];

  /** Inverse ops for undo */
  readonly inverseOps: Op[];
}

/**
 * Transaction builder - accumulates ops during build phase.
 *
 * Provides high-level mutation API that generates primitive ops.
 * All lookups happen against current store state.
 */
export class TxBuilder {
  private ops: Op[] = [];
  private root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
  }

  // ===========================================================================
  // Primitive Op Emitters
  // ===========================================================================

  /**
   * Add an entity to a table.
   * @throws if entity with same id already exists
   */
  add(table: TableName, entity: Entity): void {
    // Validate entity has id
    if (!entity.id) {
      throw new Error(`Cannot add entity without id to table ${table}`);
    }

    // Check for duplicate id
    const existing = this.lookup(table, entity.id);
    if (existing) {
      throw new Error(`Entity with id ${entity.id} already exists in table ${table}`);
    }

    this.ops.push({
      type: 'Add',
      table,
      entity,
    });
  }

  /**
   * Remove an entity from a table.
   * Captures the removed entity for inverse.
   * @throws if entity doesn't exist
   */
  remove(table: TableName, id: string): void {
    const removed = this.lookup(table, id);
    if (!removed) {
      throw new Error(`Entity with id ${id} not found in table ${table}`);
    }

    this.ops.push({
      type: 'Remove',
      table,
      id,
      removed,
    });
  }

  /**
   * Replace an entity with a new version.
   * Captures both prev and next states for inverse.
   * @throws if entity doesn't exist
   */
  replace(table: TableName, id: string, next: Entity): void {
    const prev = this.lookup(table, id);
    if (!prev) {
      throw new Error(`Entity with id ${id} not found in table ${table}`);
    }

    if (next.id !== id) {
      throw new Error(`Cannot replace entity ${id} with entity ${next.id} (id mismatch)`);
    }

    this.ops.push({
      type: 'Update',
      table,
      id,
      prev,
      next,
    });
  }

  /**
   * Set block position in layout.
   * Captures prev position for inverse.
   * @throws if block doesn't exist or position is invalid
   */
  setBlockPosition(blockId: string, next: Position): void {
    const prev = this.root.viewStore.blockPositions.get(blockId);
    if (!prev) {
      throw new Error(`No position found for block ${blockId}`);
    }

    if (typeof next.x !== 'number' || typeof next.y !== 'number') {
      throw new Error(`Invalid position for block ${blockId}: ${JSON.stringify(next)}`);
    }

    this.ops.push({
      type: 'SetBlockPosition',
      blockId,
      prev,
      next,
    });
  }

  /**
   * Set the time root block.
   * Captures prev value for inverse.
   */
  setTimeRoot(next: string | undefined): void {
    const prev = this.root.patchStore.blocks.find(b => b.type.startsWith('TimeRoot:'))?.id;

    this.ops.push({
      type: 'SetTimeRoot',
      prev,
      next,
    });
  }

  /**
   * Set timeline hint for player.
   * Captures prev value for inverse.
   */
  setTimelineHint(next: unknown): void {
    // Timeline hint is currently stored in settings (if at all)
    const prev = undefined; // TODO: read from settings when implemented

    this.ops.push({
      type: 'SetTimelineHint',
      prev,
      next,
    });
  }

  /**
   * Group multiple ops together.
   * Useful for organizing complex operations.
   */
  many(fn: () => void): void {
    const startIndex = this.ops.length;
    fn();
    const endIndex = this.ops.length;

    // Extract ops added during fn
    const nestedOps = this.ops.slice(startIndex, endIndex);

    // Remove nested ops from main list
    this.ops.length = startIndex;

    // Add as Many op
    this.ops.push({
      type: 'Many',
      ops: nestedOps,
    });
  }

  // ===========================================================================
  // Lookup Helpers (Read-only access to current state)
  // ===========================================================================

  private lookup(table: TableName, id: string): Entity | undefined {
    switch (table) {
      case 'blocks':
        return this.root.patchStore.blocks.find(b => b.id === id);
      case 'connections':
        return this.root.patchStore.connections.find(c => c.id === id);
      case 'buses':
        return this.root.busStore.buses.find(b => b.id === id);
      case 'publishers':
        return this.root.busStore.publishers.find(p => p.id === id);
      case 'listeners':
        return this.root.busStore.listeners.find(l => l.id === id);
      case 'lanes':
        return this.root.viewStore.lanes.find(l => l.id === id);
      case 'composites':
        return this.root.compositeStore.composites.find(c => c.id === id);
      case 'defaultSources':
        return this.root.defaultSourceStore.sources.get(id);
      default:
        const _exhaustive: never = table;
        throw new Error(`Unknown table: ${_exhaustive}`);
    }
  }

  /**
   * Get all connections involving a block.
   */
  getConnectionsForBlock(blockId: string): Connection[] {
    return this.root.patchStore.connections.filter(
      c => c.from.blockId === blockId || c.to.blockId === blockId
    );
  }

  /**
   * Get all publishers for a block.
   */
  getPublishersForBlock(blockId: string): Publisher[] {
    return this.root.busStore.publishers.filter(p => p.from.blockId === blockId);
  }

  /**
   * Get all listeners for a block.
   */
  getListenersForBlock(blockId: string): Listener[] {
    return this.root.busStore.listeners.filter(l => l.to.blockId === blockId);
  }

  /**
   * Get all listeners for a specific input port.
   */
  getListenersForPort(blockId: string, slotId: string): Listener[] {
    return this.root.busStore.listeners.filter(
      l => l.to.blockId === blockId && l.to.slotId === slotId
    );
  }

  /**
   * Get all connections to a specific input port.
   */
  getConnectionsToPort(blockId: string, slotId: string): Connection[] {
    return this.root.patchStore.connections.filter(
      c => c.to.blockId === blockId && c.to.slotId === slotId
    );
  }

  // ===========================================================================
  // Commit
  // ===========================================================================

  /**
   * Commit all ops to stores and compute inverses.
   * This is called internally by runTx() - user code doesn't call this.
   */
  commit(): TxResult {
    // Validate all ops before applying
    this.ops.forEach(validateOp);

    // Compute inverse ops BEFORE applying (we need current state)
    const inverseOps = this.ops.map(computeInverse).reverse();

    // Apply ops in a single MobX action for atomic update
    runInAction(() => {
      this.ops.forEach(op => this.applyOp(op));
    });

    return {
      ops: this.ops,
      inverseOps,
    };
  }

  /**
   * Apply a single op to stores.
   * This is the low-level mutation that actually changes state.
   */
  private applyOp(op: Op): void {
    switch (op.type) {
      case 'Add':
        this.applyAdd(op.table, op.entity);
        break;

      case 'Remove':
        this.applyRemove(op.table, op.id);
        break;

      case 'Update':
        this.applyUpdate(op.table, op.id, op.next);
        break;

      case 'SetBlockPosition':
        this.applySetBlockPosition(op.blockId, op.next);
        break;

      case 'SetTimeRoot':
        this.applySetTimeRoot(op.next);
        break;

      case 'SetTimelineHint':
        this.applySetTimelineHint(op.next);
        break;

      case 'Many':
        op.ops.forEach(nestedOp => this.applyOp(nestedOp));
        break;

      default:
        const _exhaustive: never = op;
        throw new Error(`Unknown op type: ${JSON.stringify(_exhaustive)}`);
    }
  }

  private applyAdd(table: TableName, entity: Entity): void {
    switch (table) {
      case 'blocks':
        this.root.patchStore.blocks.push(entity as Block);
        break;
      case 'connections':
        this.root.patchStore.connections.push(entity as Connection);
        break;
      case 'buses':
        this.root.busStore.buses.push(entity as Bus);
        break;
      case 'publishers':
        this.root.busStore.publishers.push(entity as Publisher);
        break;
      case 'listeners':
        this.root.busStore.listeners.push(entity as Listener);
        break;
      case 'lanes':
        this.root.viewStore.lanes.push(entity as Lane);
        break;
      case 'composites':
        this.root.compositeStore.composites.push(entity as Composite);
        break;
      case 'defaultSources':
        this.root.defaultSourceStore.sources.set(entity.id, entity as any);
        break;
      default:
        const _exhaustive: never = table;
        throw new Error(`Unknown table: ${_exhaustive}`);
    }
  }

  private applyRemove(table: TableName, id: string): void {
    switch (table) {
      case 'blocks':
        this.root.patchStore.blocks = this.root.patchStore.blocks.filter(b => b.id !== id);
        break;
      case 'connections':
        this.root.patchStore.connections = this.root.patchStore.connections.filter(c => c.id !== id);
        break;
      case 'buses':
        this.root.busStore.buses = this.root.busStore.buses.filter(b => b.id !== id);
        break;
      case 'publishers':
        this.root.busStore.publishers = this.root.busStore.publishers.filter(p => p.id !== id);
        break;
      case 'listeners':
        this.root.busStore.listeners = this.root.busStore.listeners.filter(l => l.id !== id);
        break;
      case 'lanes':
        this.root.viewStore.lanes = this.root.viewStore.lanes.filter(l => l.id !== id);
        break;
      case 'composites':
        this.root.compositeStore.composites = this.root.compositeStore.composites.filter(c => c.id !== id);
        break;
      case 'defaultSources':
        this.root.defaultSourceStore.sources.delete(id);
        break;
      default:
        const _exhaustive: never = table;
        throw new Error(`Unknown table: ${_exhaustive}`);
    }
  }

  private applyUpdate(table: TableName, id: string, next: Entity): void {
    // Update mutates entity in place to preserve MobX reactivity
    switch (table) {
      case 'blocks': {
        const block = this.root.patchStore.blocks.find(b => b.id === id);
        if (block) {
          Object.assign(block, next);
        }
        break;
      }
      case 'connections': {
        const conn = this.root.patchStore.connections.find(c => c.id === id);
        if (conn) {
          Object.assign(conn, next);
        }
        break;
      }
      case 'buses': {
        const bus = this.root.busStore.buses.find(b => b.id === id);
        if (bus) {
          Object.assign(bus, next);
        }
        break;
      }
      case 'publishers': {
        const pub = this.root.busStore.publishers.find(p => p.id === id);
        if (pub) {
          Object.assign(pub, next);
        }
        break;
      }
      case 'listeners': {
        const listener = this.root.busStore.listeners.find(l => l.id === id);
        if (listener) {
          Object.assign(listener, next);
        }
        break;
      }
      case 'lanes': {
        const lane = this.root.viewStore.lanes.find(l => l.id === id);
        if (lane) {
          Object.assign(lane, next);
        }
        break;
      }
      case 'composites': {
        const composite = this.root.compositeStore.composites.find(c => c.id === id);
        if (composite) {
          Object.assign(composite, next);
        }
        break;
      }
      case 'defaultSources': {
        const source = this.root.defaultSourceStore.sources.get(id);
        if (source) {
          Object.assign(source, next);
        }
        break;
      }
      default:
        const _exhaustive: never = table;
        throw new Error(`Unknown table: ${_exhaustive}`);
    }
  }

  private applySetBlockPosition(blockId: string, next: Position): void {
    this.root.viewStore.blockPositions.set(blockId, next);
  }

  private applySetTimeRoot(next: string | undefined): void {
    // TimeRoot is currently implicit (first TimeRoot: block)
    // This is a placeholder for when we have explicit time root tracking
    // For now, this is a no-op
  }

  private applySetTimelineHint(next: unknown): void {
    // Timeline hint storage is not yet implemented
    // This is a placeholder for future functionality
  }
}

/**
 * Run a transaction - the ONLY way to mutate patch state.
 *
 * Creates a TxBuilder, calls the build function, commits ops,
 * and emits GraphCommitted event.
 *
 * @param store Root store
 * @param spec Transaction specification
 * @param build Build function that generates ops
 * @returns Transaction result with ops and inverse ops
 *
 * @example
 * ```ts
 * runTx(rootStore, { label: 'Add Block' }, tx => {
 *   tx.add('blocks', newBlock);
 *   tx.setBlockPosition(newBlock.id, { x: 100, y: 100 });
 * });
 * ```
 */
export function runTx(
  store: RootStore,
  spec: TxSpec,
  build: (tx: TxBuilder) => void
): TxResult {
  const tx = new TxBuilder(store);

  try {
    // Build phase: user code generates ops
    build(tx);

    // Commit phase: apply ops and compute inverses
    const result = tx.commit();

    // Increment patch revision
    store.patchStore.patchRevision++;

    // Emit GraphCommitted event
    store.events.emit({
      type: 'GraphCommitted',
      reason: 'user-edit',
      label: spec.label,
      diff: computeDiffSummary(result.ops),
      patchRevision: store.patchStore.patchRevision,
    });

    return result;
  } catch (error) {
    // Failed transaction - no partial commits
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * Compute diff summary from ops for event payload.
 */
function computeDiffSummary(ops: Op[]): {
  blocksAdded: number;
  blocksRemoved: number;
  connectionsAdded: number;
  connectionsRemoved: number;
} {
  let blocksAdded = 0;
  let blocksRemoved = 0;
  let connectionsAdded = 0;
  let connectionsRemoved = 0;

  const countOp = (op: Op): void => {
    switch (op.type) {
      case 'Add':
        if (op.table === 'blocks') blocksAdded++;
        if (op.table === 'connections') connectionsAdded++;
        break;
      case 'Remove':
        if (op.table === 'blocks') blocksRemoved++;
        if (op.table === 'connections') connectionsRemoved++;
        break;
      case 'Many':
        op.ops.forEach(countOp);
        break;
    }
  };

  ops.forEach(countOp);

  return { blocksAdded, blocksRemoved, connectionsAdded, connectionsRemoved };
}
