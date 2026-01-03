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
 * Sprint 3: Bus-Block Unification
 * - 'buses' table ops now convert Bus ↔ BusBlock and operate on patchStore.blocks
 *
 * Phase 0.5: Connection → Edge Migration Complete
 * - 'connections' table is an alias for 'edges' (backward compatibility)
 * - All new code uses 'edges' table
 *
 * @see design-docs/6-Transactions/2-Ops.md
 */

import { runInAction } from 'mobx';
import type { Op, TableName, Entity } from './ops';
import type { RootStore } from '../stores/RootStore';
import type { Block, Bus, Composite, DefaultSourceState, Edge } from '../types';
import { convertBusToBlock, convertBlockToBus } from '../bus-block/conversion';

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
 *
 * Sprint 3: Bus-Block Unification
 * - 'buses' table: Convert Bus → BusBlock and add to patchStore.blocks
 *
 * Phase 0.5: Connection → Edge Migration Complete
 * - 'connections' table: Legacy alias for 'edges' table (backward compatibility)
 * - Entity is always Edge type (Connection type is deprecated)
 */
function applyAdd(table: TableName, entity: Entity, store: RootStore): void {
  switch (table) {
    case 'blocks':
      store.patchStore.blocks.push(entity as Block);
      break;
    case 'connections':
      // Legacy compatibility: 'connections' table is an alias for 'edges'
      // All connection entities are now stored in patchStore.edges
      store.patchStore.edges.push(entity as Edge);
      break;
    case 'buses': {
      // Convert Bus → BusBlock and add to patchStore.blocks
      const bus = entity as Bus;
      const busBlock = convertBusToBlock(bus);
      store.patchStore.blocks.push(busBlock);
      break;
    }
    case 'composites':
      store.compositeStore.composites.push(entity as Composite);
      break;
    case 'defaultSources':
      store.defaultSourceStore.sources.set((entity as DefaultSourceState).id, entity as DefaultSourceState);
      break;
    case 'edges':
      store.patchStore.edges.push(entity as Edge);
      break;
    default: {
      const _exhaustive: never = table;
      throw new Error(`Unknown table: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Remove an entity from a table.
 *
 * Sprint 3: Bus-Block Unification
 * - 'buses' table: Remove BusBlock from patchStore.blocks (match by busId in params)
 *
 * Phase 0.5: Connection → Edge Migration Complete
 * - 'connections' table: Legacy alias for 'edges' table (backward compatibility)
 */
function applyRemove(table: TableName, id: string, store: RootStore): void {
  switch (table) {
    case 'blocks':
      store.patchStore.blocks = store.patchStore.blocks.filter(b => b.id !== id);
      break;
    case 'connections':
      // Legacy compatibility: 'connections' table is an alias for 'edges'
      store.patchStore.edges = store.patchStore.edges.filter(c => c.id !== id);
      break;
    case 'buses': {
      // Remove BusBlock from patchStore.blocks (block ID = bus ID)
      store.patchStore.blocks = store.patchStore.blocks.filter(b =>
        !(b.type === 'BusBlock' && b.id === id)
      );
      break;
    }
    case 'composites':
      store.compositeStore.composites = store.compositeStore.composites.filter(c => c.id !== id);
      break;
    case 'defaultSources':
      store.defaultSourceStore.sources.delete(id);
      break;
    case 'edges':
      store.patchStore.edges = store.patchStore.edges.filter(e => e.id !== id);
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
 *
 * Sprint 3: Bus-Block Unification
 * - 'buses' table: Find BusBlock, convert to Bus, apply updates, convert back, update BusBlock
 *
 * Phase 0.5: Connection → Edge Migration Complete
 * - 'connections' table: Legacy alias for 'edges' table (backward compatibility)
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
      // Legacy compatibility: 'connections' table is an alias for 'edges'
      const conn = store.patchStore.edges.find(c => c.id === id);
      if (conn) {
        Object.assign(conn, next);
      }
      break;
    }
    case 'buses': {
      // Find BusBlock by ID (block ID = bus ID)
      const busBlock = store.patchStore.blocks.find(b =>
        b.type === 'BusBlock' && b.id === id
      );
      if (busBlock) {
        // Convert current BusBlock → Bus
        const currentBus = convertBlockToBus(busBlock);
        // Apply updates to Bus
        const updatedBus = { ...currentBus, ...(next as Partial<Bus>) };
        // Convert back to BusBlock
        const updatedBusBlock = convertBusToBlock(updatedBus);
        // Update the BusBlock in place
        Object.assign(busBlock, updatedBusBlock);
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
    case 'edges': {
      const edge = store.patchStore.edges.find(e => e.id === id);
      if (edge) {
        Object.assign(edge, next);
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
