/**
 * @file Transaction Builder
 * @description The ONLY way to mutate patch state.
 *
 * All mutations flow through runTx(), which:
 * - Creates a TxBuilder
 * - Calls user build function
 * - Commits ops to stores atomically
 * - Computes inverse ops for undo
 * - Records revision in HistoryStore
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

import type { RootStore } from '../stores/RootStore';
import type { Op, TableName, Entity, Position } from './ops';
import { computeInverse, validateOp } from './ops';
import { applyOps } from './applyOps';
import type { Connection, Publisher, Listener, Lane } from '../types';
import type { GraphDiffSummary } from '../events/types';

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
   *
   * NOTE: Currently disabled - ViewStateStore doesn't have blockPositions yet.
   * This will be enabled when ViewStateStore is migrated to use transactions.
   */
  setBlockPosition(blockId: string, next: Position): void {
    // TODO: Enable when ViewStateStore has blockPositions Map
    // const prev = this.root.viewStore.blockPositions.get(blockId);
    // if (!prev) {
    //   throw new Error(`No position found for block ${blockId}`);
    // }

    if (typeof next.x !== 'number' || typeof next.y !== 'number') {
      throw new Error(`Invalid position for block ${blockId}: ${JSON.stringify(next)}`);
    }

    // For now, emit op but it won't apply (see applyOps.ts)
    const prev = { x: 0, y: 0 }; // Placeholder

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

  /**
   * Get all publishers for a bus.
   */
  getPublishersForBus(busId: string): Publisher[] {
    return this.root.busStore.publishers.filter(p => p.busId === busId);
  }

  /**
   * Get all listeners for a bus.
   */
  getListenersForBus(busId: string): Listener[] {
    return this.root.busStore.listeners.filter(l => l.busId === busId);
  }

  /**
   * Get default sources for a block.
   */
  getDefaultSourcesForBlock(blockId: string): string[] {
    const slotMap = (this.root.defaultSourceStore as any).blockSlotIndex.get(blockId);
    if (!slotMap) return [];
    return Array.from(slotMap.values());
  }

  /**
   * Get lanes containing a block.
   */
  getLanesContainingBlock(blockId: string): Lane[] {
    return this.root.viewStore.lanes.filter(l => l.blockIds.includes(blockId));
  }

  // ===========================================================================
  // Cascade Helpers
  // ===========================================================================

  /**
   * Remove a block and all its dependencies in correct order.
   *
   * Removal order:
   * 1. All connections to/from the block
   * 2. All bus publishers from the block
   * 3. All bus listeners to the block
   * 4. All default sources for the block's inputs
   * 5. Block from all lanes
   * 6. The block itself
   *
   * This generates a Many op containing all sub-ops.
   * The inverse will recreate everything in reverse order.
   *
   * @param blockId The block ID to remove
   * @throws if block doesn't exist
   */
  removeBlockCascade(blockId: string): void {
    // Verify block exists
    const block = this.lookup('blocks', blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found for cascade removal`);
    }

    this.many(() => {
      // 1. Remove all connections to/from this block
      const connections = this.getConnectionsForBlock(blockId);
      for (const conn of connections) {
        this.remove('connections', conn.id);
      }

      // 2. Remove all publishers from this block
      const publishers = this.getPublishersForBlock(blockId);
      for (const pub of publishers) {
        this.remove('publishers', pub.id);
      }

      // 3. Remove all listeners to this block
      const listeners = this.getListenersForBlock(blockId);
      for (const listener of listeners) {
        this.remove('listeners', listener.id);
      }

      // 4. Remove default sources for this block's inputs
      const defaultSources = this.getDefaultSourcesForBlock(blockId);
      for (const dsId of defaultSources) {
        this.remove('defaultSources', dsId);
      }

      // 5. Remove block from all lanes
      const lanes = this.getLanesContainingBlock(blockId);
      for (const lane of lanes) {
        const updatedLane: Lane = {
          ...lane,
          blockIds: lane.blockIds.filter(id => id !== blockId),
        };
        this.replace('lanes', lane.id, updatedLane);
      }

      // 6. Remove the block itself
      this.remove('blocks', blockId);
    });
  }

  /**
   * Remove a bus and all its routing in correct order.
   *
   * Removal order:
   * 1. All publishers on this bus
   * 2. All listeners on this bus
   * 3. The bus itself
   *
   * This generates a Many op containing all sub-ops.
   * The inverse will recreate everything in reverse order.
   *
   * @param busId The bus ID to remove
   * @throws if bus doesn't exist
   */
  removeBusCascade(busId: string): void {
    // Verify bus exists
    const bus = this.lookup('buses', busId);
    if (!bus) {
      throw new Error(`Bus ${busId} not found for cascade removal`);
    }

    this.many(() => {
      // 1. Remove all publishers on this bus
      const publishers = this.getPublishersForBus(busId);
      for (const pub of publishers) {
        this.remove('publishers', pub.id);
      }

      // 2. Remove all listeners on this bus
      const listeners = this.getListenersForBus(busId);
      for (const listener of listeners) {
        this.remove('listeners', listener.id);
      }

      // 3. Remove the bus itself
      this.remove('buses', busId);
    });
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

    // Apply ops using shared applyOps function
    applyOps(this.ops, this.root);

    return {
      ops: this.ops,
      inverseOps,
    };
  }
}

/**
 * Run a transaction - the ONLY way to mutate patch state.
 *
 * Creates a TxBuilder, calls the build function, commits ops,
 * records revision in history, and emits GraphCommitted event.
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

    // Record revision in history
    store.historyStore.addRevision(
      result.ops,
      result.inverseOps,
      spec.label ?? 'Edit'
    );

    // Increment patch revision
    store.patchStore.patchRevision++;

    // Emit GraphCommitted event
    store.events.emit({
      type: 'GraphCommitted',
      patchId: store.patchStore.patchId,
      patchRevision: store.patchStore.patchRevision,
      reason: 'userEdit',
      label: spec.label,
      diffSummary: computeDiffSummary(result.ops),
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
function computeDiffSummary(ops: Op[]): GraphDiffSummary {
  let blocksAdded = 0;
  let blocksRemoved = 0;
  let busesAdded = 0;
  let busesRemoved = 0;
  let bindingsChanged = 0;
  let timeRootChanged = false;

  const countOp = (op: Op): void => {
    switch (op.type) {
      case 'Add':
        if (op.table === 'blocks') blocksAdded++;
        if (op.table === 'buses') busesAdded++;
        if (op.table === 'connections' || op.table === 'publishers' || op.table === 'listeners') {
          bindingsChanged++;
        }
        break;
      case 'Remove':
        if (op.table === 'blocks') blocksRemoved++;
        if (op.table === 'buses') busesRemoved++;
        if (op.table === 'connections' || op.table === 'publishers' || op.table === 'listeners') {
          bindingsChanged++;
        }
        break;
      case 'SetTimeRoot':
        timeRootChanged = true;
        break;
      case 'Many':
        op.ops.forEach(countOp);
        break;
    }
  };

  ops.forEach(countOp);

  return {
    blocksAdded,
    blocksRemoved,
    busesAdded,
    busesRemoved,
    bindingsChanged,
    timeRootChanged,
  };
}
