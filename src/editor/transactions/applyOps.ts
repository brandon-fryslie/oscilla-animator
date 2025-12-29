/**
 * @file Apply Ops
 * @description Apply operation sequences to store state.
 *
 * This module provides the low-level op application logic used by:
 * - TxBuilder.commit() (for forward ops during transaction)
 * - HistoryStore.undo() (for inverse ops)
 * - HistoryStore.redo() (for forward ops)
 *
 * Design principles:
 * - Ops are applied in order (sequence matters)
 * - MobX reactivity is preserved (mutations happen in place)
 * - No validation (ops are assumed to be valid)
 * - Caller is responsible for MobX action context
 *
 * @see design-docs/6-Transactions/2-Ops.md
 */

import { runInAction } from 'mobx';
import type { Op, TableName, Entity } from './ops';
import type { RootStore } from '../stores/RootStore';
import type { Block, Connection, Bus, Publisher, Listener, Composite, DefaultSourceState } from '../types';

/**
 * Apply a sequence of ops to the store.
 * Wraps the application in a MobX action for atomic updates.
 *
 * @param ops Array of operations to apply
 * @param store Root store to apply operations to
 */
export function applyOps(ops: Op[], store: RootStore): void {
  runInAction(() => {
    for (const op of ops) {
      applyOp(op, store);
    }
  });
}

/**
 * Apply a single operation to the store.
 * This is the low-level mutation that actually changes state.
 *
 * @param op The operation to apply
 * @param store Root store
 */
function applyOp(op: Op, store: RootStore): void {
  switch (op.type) {
    case 'Add':
      applyAdd(op.table, op.entity, store);
      break;

    case 'Remove':
      applyRemove(op.table, op.id, store);
      break;

    case 'Update':
      applyUpdate(op.table, op.id, op.next, store);
      break;

    case 'SetBlockPosition':
      applySetBlockPosition(op.blockId, op.next, store);
      break;

    case 'SetTimeRoot':
      applySetTimeRoot(op.next, store);
      break;

    case 'SetTimelineHint':
      applySetTimelineHint(op.next, store);
      break;

    case 'Many':
      // Recursively apply nested ops
      for (const nestedOp of op.ops) {
        applyOp(nestedOp, store);
      }
      break;

    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown op type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Add an entity to a table.
 */
function applyAdd(table: TableName, entity: Entity, store: RootStore): void {
  switch (table) {
    case 'blocks':
      store.patchStore.blocks.push(entity as Block);
      break;
    case 'connections':
      store.patchStore.connections.push(entity as Connection);
      break;
    case 'buses':
      store.busStore.buses.push(entity as Bus);
      break;
    case 'publishers':
      store.busStore.publishers.push(entity as Publisher);
      break;
    case 'listeners':
      store.busStore.listeners.push(entity as Listener);
      break;
    case 'composites':
      store.compositeStore.composites.push(entity as Composite);
      break;
    case 'defaultSources':
      store.defaultSourceStore.sources.set(entity.id, entity as DefaultSourceState);
      break;
    default: {
      const _exhaustive: never = table;
      throw new Error(`Unknown table: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Remove an entity from a table.
 */
function applyRemove(table: TableName, id: string, store: RootStore): void {
  switch (table) {
    case 'blocks':
      store.patchStore.blocks = store.patchStore.blocks.filter(b => b.id !== id);
      break;
    case 'connections':
      store.patchStore.connections = store.patchStore.connections.filter(c => c.id !== id);
      break;
    case 'buses':
      store.busStore.buses = store.busStore.buses.filter(b => b.id !== id);
      break;
    case 'publishers':
      store.busStore.publishers = store.busStore.publishers.filter(p => p.id !== id);
      break;
    case 'listeners':
      store.busStore.listeners = store.busStore.listeners.filter(l => l.id !== id);
      break;
    case 'composites':
      store.compositeStore.composites = store.compositeStore.composites.filter(c => c.id !== id);
      break;
    case 'defaultSources':
      store.defaultSourceStore.sources.delete(id);
      break;
    default: {
      const _exhaustive: never = table;
      throw new Error(`Unknown table: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Update an entity in a table.
 * Mutates the entity in place to preserve MobX reactivity.
 */
function applyUpdate(table: TableName, id: string, next: Entity, store: RootStore): void {
  switch (table) {
    case 'blocks': {
      const block = store.patchStore.blocks.find(b => b.id === id);
      if (block) {
        Object.assign(block, next);
      }
      break;
    }
    case 'connections': {
      const conn = store.patchStore.connections.find(c => c.id === id);
      if (conn) {
        Object.assign(conn, next);
      }
      break;
    }
    case 'buses': {
      const bus = store.busStore.buses.find(b => b.id === id);
      if (bus) {
        Object.assign(bus, next);
      }
      break;
    }
    case 'publishers': {
      const pub = store.busStore.publishers.find(p => p.id === id);
      if (pub) {
        Object.assign(pub, next);
      }
      break;
    }
    case 'listeners': {
      const listener = store.busStore.listeners.find(l => l.id === id);
      if (listener) {
        Object.assign(listener, next);
      }
      break;
    }
    case 'composites': {
      const composite = store.compositeStore.composites.find(c => c.id === id);
      if (composite) {
        Object.assign(composite, next);
      }
      break;
    }
    case 'defaultSources': {
      const source = store.defaultSourceStore.sources.get(id);
      if (source) {
        Object.assign(source, next);
      }
      break;
    }
    default: {
      const _exhaustive: never = table;
      throw new Error(`Unknown table: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Set block position in layout.
 * NOTE: Currently disabled - ViewStateStore doesn't have blockPositions yet.
 * This will be enabled when ViewStateStore is migrated to use transactions.
 */
function applySetBlockPosition(_blockId: string, _next: { x: number; y: number }, _store: RootStore): void {
  // TODO: Enable when ViewStateStore has blockPositions Map
  // store.viewStore.blockPositions.set(blockId, next);
}

/**
 * Set the time root block.
 */
function applySetTimeRoot(_next: string | undefined, _store: RootStore): void {
  // TimeRoot is currently implicit (first TimeRoot: block)
  // This is a placeholder for when we have explicit time root tracking
  // For now, this is a no-op
}

/**
 * Set timeline hint for player.
 */
function applySetTimelineHint(_next: unknown, _store: RootStore): void {
  // Timeline hint storage is not yet implemented
  // This is a placeholder for future functionality
}
