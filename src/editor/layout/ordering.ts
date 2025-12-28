/**
 * Row Ordering
 *
 * Computes deterministic row ordering keys for blocks.
 * Ordering tuple: (column, clusterKey, depth, rolePriority, blockId)
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 6)
 */

import { ROLE_PRIORITY } from './constants';
import type { BlockId, ColumnIndex, Role } from './types';

/**
 * Row ordering tuple for a block.
 */
export interface RowOrderTuple {
  readonly column: ColumnIndex;
  readonly clusterKey: string;
  readonly depth: number;
  readonly rolePriority: number;
  readonly blockId: BlockId;
}

/**
 * Compute row ordering tuple for a block.
 *
 * @param blockId - Block ID
 * @param column - Column index
 * @param clusterKey - Cluster grouping key
 * @param depth - Depth in dependency graph
 * @param role - Block role
 * @returns Row ordering tuple
 */
export function computeRowOrderTuple(
  blockId: BlockId,
  column: ColumnIndex,
  clusterKey: string,
  depth: number,
  role: Role
): RowOrderTuple {
  return {
    column,
    clusterKey,
    depth,
    rolePriority: ROLE_PRIORITY[role],
    blockId,
  };
}

/**
 * Convert row ordering tuple to a stable key string for debugging.
 *
 * Format: "col:C|cluster:K|depth:D|rolePri:R|id:B"
 *
 * @param tuple - Row ordering tuple
 * @returns Row key string
 */
export function tupleToRowKey(tuple: RowOrderTuple): string {
  return `col:${tuple.column}|cluster:${tuple.clusterKey}|depth:${tuple.depth}|rolePri:${tuple.rolePriority}|id:${tuple.blockId}`;
}

/**
 * Compare two row ordering tuples.
 *
 * Returns negative if a < b, positive if a > b, zero if equal.
 * Ordering: column, clusterKey, depth, rolePriority, blockId
 *
 * @param a - First tuple
 * @param b - Second tuple
 * @returns Comparison result
 */
export function compareRowOrderTuples(a: RowOrderTuple, b: RowOrderTuple): number {
  // Compare column
  if (a.column !== b.column) {
    return a.column - b.column;
  }

  // Compare cluster key (lexicographic)
  if (a.clusterKey !== b.clusterKey) {
    return a.clusterKey.localeCompare(b.clusterKey);
  }

  // Compare depth
  if (a.depth !== b.depth) {
    return a.depth - b.depth;
  }

  // Compare role priority
  if (a.rolePriority !== b.rolePriority) {
    return a.rolePriority - b.rolePriority;
  }

  // Compare blockId (tie-breaker)
  return a.blockId.localeCompare(b.blockId);
}

/**
 * Sort blocks by row ordering tuples.
 *
 * @param tuples - Array of row ordering tuples
 * @returns Sorted array of tuples
 */
export function sortByRowOrder(tuples: RowOrderTuple[]): RowOrderTuple[] {
  return [...tuples].sort(compareRowOrderTuples);
}
