/**
 * Role and Column Assignment
 *
 * Maps block roles to column indices.
 * Stable, deterministic mapping.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 2)
 */

import type { Role, ColumnIndex } from './types';

/**
 * Map role to column index.
 *
 * Column assignment:
 * - Column 0: time, identity, io
 * - Column 1: state, operator
 * - Column 2: render
 * - Column 3+: reserved for future use
 *
 * @param role - Block role
 * @returns Column index
 */
export function roleToColumn(role: Role): ColumnIndex {
  switch (role) {
    case 'time':
    case 'identity':
    case 'io':
      return 0;

    case 'state':
    case 'operator':
      return 1;

    case 'render':
      return 2;
  }
}

/**
 * Get all roles assigned to a column.
 *
 * @param column - Column index
 * @returns Array of roles in this column
 */
export function columnToRoles(column: ColumnIndex): Role[] {
  switch (column) {
    case 0:
      return ['time', 'identity', 'io'];
    case 1:
      return ['state', 'operator'];
    case 2:
      return ['render'];
    default:
      return []; // Reserved columns
  }
}
