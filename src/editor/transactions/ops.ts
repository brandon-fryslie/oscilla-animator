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
  Lane,
  Composite,
  DefaultSourceState
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
  | 'lanes'
  | 'composites'
  | 'defaultSources';

/**
 * Entity union type - all entities that can be stored in tables.
 */
export type Entity =
  | Block
  | Connection
  | Bus
  | Publisher
  | Listener
  | Lane
  | Composite
  | DefaultSourceState;

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
 * applyOp(op)
 * applyOp(computeInverse(op))
 * // State is now back to original
 * ```
 *
 * Inverse rules:
 * - Add → Remove (with entity payload)
 * - Remove → Add (restore removed entity)
 * - Update → Update (swap prev/next)
 * - SetBlockPosition → SetBlockPosition (swap prev/next)
 * - SetTimeRoot → SetTimeRoot (swap prev/next)
 * - SetTimelineHint → SetTimelineHint (swap prev/next)
 * - Many → Many (reverse array, invert each op)
 *
 * @param op The operation to invert
 * @returns The inverse operation
 */
export function computeInverse(op: Op): Op {
  switch (op.type) {
    case 'Add':
      // Add → Remove (capture entity for restoration)
      return {
        type: 'Remove',
        table: op.table,
        id: op.entity.id,
        removed: op.entity,
      };

    case 'Remove':
      // Remove → Add (restore removed entity)
      return {
        type: 'Add',
        table: op.table,
        entity: op.removed,
      };

    case 'Update':
      // Update → Update (swap prev/next)
      return {
        type: 'Update',
        table: op.table,
        id: op.id,
        prev: op.next,
        next: op.prev,
      };

    case 'SetBlockPosition':
      // SetBlockPosition → SetBlockPosition (swap prev/next)
      return {
        type: 'SetBlockPosition',
        blockId: op.blockId,
        prev: op.next,
        next: op.prev,
      };

    case 'SetTimeRoot':
      // SetTimeRoot → SetTimeRoot (swap prev/next)
      return {
        type: 'SetTimeRoot',
        prev: op.next,
        next: op.prev,
      };

    case 'SetTimelineHint':
      // SetTimelineHint → SetTimelineHint (swap prev/next)
      return {
        type: 'SetTimelineHint',
        prev: op.next,
        next: op.prev,
      };

    case 'Many':
      // Many → Many (reverse array, invert each op)
      // Order matters: inverse of [op1, op2, op3] is [inv(op3), inv(op2), inv(op1)]
      return {
        type: 'Many',
        ops: op.ops.map(computeInverse).reverse(),
      };

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = op;
      throw new Error(`Unknown op type: ${JSON.stringify(_exhaustive)}`);
  }
}

/**
 * Validate that an op is well-formed.
 * Checks:
 * - Entity IDs are present
 * - Remove ops have removed entity
 * - Update ops have both prev and next
 * - Positions are valid numbers
 *
 * @param op The operation to validate
 * @throws Error if op is malformed
 */
export function validateOp(op: Op): void {
  switch (op.type) {
    case 'Add':
      if (!op.entity.id) {
        throw new Error(`Add op missing entity id: ${JSON.stringify(op)}`);
      }
      break;

    case 'Remove':
      if (!op.id) {
        throw new Error(`Remove op missing id: ${JSON.stringify(op)}`);
      }
      if (!op.removed) {
        throw new Error(`Remove op missing removed entity: ${JSON.stringify(op)}`);
      }
      break;

    case 'Update':
      if (!op.id) {
        throw new Error(`Update op missing id: ${JSON.stringify(op)}`);
      }
      if (!op.prev || !op.next) {
        throw new Error(`Update op missing prev/next: ${JSON.stringify(op)}`);
      }
      break;

    case 'SetBlockPosition':
      if (!op.blockId) {
        throw new Error(`SetBlockPosition op missing blockId: ${JSON.stringify(op)}`);
      }
      if (typeof op.prev.x !== 'number' || typeof op.prev.y !== 'number') {
        throw new Error(`SetBlockPosition op has invalid prev position: ${JSON.stringify(op)}`);
      }
      if (typeof op.next.x !== 'number' || typeof op.next.y !== 'number') {
        throw new Error(`SetBlockPosition op has invalid next position: ${JSON.stringify(op)}`);
      }
      break;

    case 'Many':
      // Recursively validate nested ops
      op.ops.forEach(validateOp);
      break;

    // SetTimeRoot and SetTimelineHint are always valid
    case 'SetTimeRoot':
    case 'SetTimelineHint':
      break;

    default:
      const _exhaustive: never = op;
      throw new Error(`Unknown op type: ${JSON.stringify(_exhaustive)}`);
  }
}
