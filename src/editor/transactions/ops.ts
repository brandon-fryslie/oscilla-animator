/**
 * @file Transaction Operations
 * @description Primitive operations for the transaction system.
 *
 * All mutations to patch state must be expressible as Ops.
 * Each Op has a computable inverse for undo/redo.
 *
 * Design principles:
 * - Ops are plain data (JSON-serializable)
 * - No MobX observables, functions, or classes
 * - Entity IDs are sufficient for lookups
 * - Remove ops capture full entity state
 * - Update ops capture both prev and next states
 *
 * @see design-docs/6-Transactions/2-Ops.md
 */

import type {
  Block,
  Connection,
  Bus,
  Publisher,
  Listener,
  Composite,
  DefaultSourceState,
  Edge,
} from '../types';

/**
 * Table names for entity collections in patch state.
 */
export type TableName =
  | 'blocks'
  | 'connections'
  | 'buses'
  | 'publishers'
  | 'listeners'
  | 'composites'
  | 'defaultSources'
  | 'edges';

/**
 * Entity union type - all entities that can be stored in tables.
 */
export type Entity =
  | Block
  | Connection
  | Bus
  | Publisher
  | Listener
  | Composite
  | DefaultSourceState
  | Edge;

/**
 * Position for block layout.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/**
 * Primitive operation types for patch mutations.
 *
 * This is the complete set of operations needed to express all
 * mutations to patch state. Higher-level operations (macro insertion,
 * block replacement) decompose into these primitives.
 */
export type Op =
  | { readonly type: 'Add'; readonly table: TableName; readonly entity: Entity }
  | { readonly type: 'Remove'; readonly table: TableName; readonly id: string; readonly removed: Entity }
  | { readonly type: 'Update'; readonly table: TableName; readonly id: string; readonly prev: Entity; readonly next: Entity }
  | { readonly type: 'SetBlockPosition'; readonly blockId: string; readonly prev: Position; readonly next: Position }
  | { readonly type: 'SetTimeRoot'; readonly prev: string | undefined; readonly next: string | undefined }
  | { readonly type: 'SetTimelineHint'; readonly prev: unknown; readonly next: unknown }
  | { readonly type: 'Many'; readonly ops: Op[] };

/**
 * Compute the inverse of an operation.
 *
 * Applying op then its inverse restores the original state:
 * ```
 * state1 -> op -> state2
 * state2 -> inverse(op) -> state1
 * ```
 *
 * Used by HistoryStore.undo() to construct undo operations.
 */
export function computeInverse(op: Op): Op {
  switch (op.type) {
    case 'Add':
      return {
        type: 'Remove',
        table: op.table,
        id: (op.entity as { id: string }).id,
        removed: op.entity,
      };

    case 'Remove':
      return {
        type: 'Add',
        table: op.table,
        entity: op.removed,
      };

    case 'Update':
      return {
        type: 'Update',
        table: op.table,
        id: op.id,
        prev: op.next,
        next: op.prev,
      };

    case 'SetBlockPosition':
      return {
        type: 'SetBlockPosition',
        blockId: op.blockId,
        prev: op.next,
        next: op.prev,
      };

    case 'SetTimeRoot':
      return {
        type: 'SetTimeRoot',
        prev: op.next,
        next: op.prev,
      };

    case 'SetTimelineHint':
      return {
        type: 'SetTimelineHint',
        prev: op.next,
        next: op.prev,
      };

    case 'Many':
      return {
        type: 'Many',
        ops: op.ops.map(computeInverse).reverse(),
      };

    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown op type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Validate an operation.
 * @throws if op is malformed
 */
export function validateOp(op: Op): void {
  switch (op.type) {
    case 'Add':
      if (!op.table) throw new Error('Add op missing table');
      if (!op.entity) throw new Error('Add op missing entity');
      if (!(op.entity as { id?: string }).id) throw new Error('Add op entity missing id');
      break;

    case 'Remove':
      if (!op.table) throw new Error('Remove op missing table');
      if (!op.id) throw new Error('Remove op missing id');
      if (!op.removed) throw new Error('Remove op missing removed entity');
      break;

    case 'Update':
      if (!op.table) throw new Error('Update op missing table');
      if (!op.id) throw new Error('Update op missing id');
      if (!op.prev) throw new Error('Update op missing prev state');
      if (!op.next) throw new Error('Update op missing next state');
      break;

    case 'SetBlockPosition':
      if (!op.blockId) throw new Error('SetBlockPosition op missing blockId');
      if (!op.prev) throw new Error('SetBlockPosition op missing prev position');
      if (!op.next) throw new Error('SetBlockPosition op missing next position');
      break;

    case 'SetTimeRoot':
      // prev and next can be undefined
      break;

    case 'SetTimelineHint':
      // prev and next can be unknown
      break;

    case 'Many':
      if (!Array.isArray(op.ops)) throw new Error('Many op missing ops array');
      for (const nestedOp of op.ops) {
        validateOp(nestedOp);
      }
      break;

    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown op type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
