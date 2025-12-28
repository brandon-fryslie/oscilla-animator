/**
 * Grid Placement
 *
 * Initial grid layout positioning.
 * Places blocks in columns based on row ordering with cluster gaps.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 7)
 */

import { BLOCK_SIZES, clusterGap, colGap, vGap } from './constants';
import { columnToRoles } from './columns';
import type { BlockId, ColumnIndex, ColumnLayoutMeta, DensityMode } from './types';

/**
 * Block placement data.
 */
export interface BlockPlacement {
  readonly blockId: BlockId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly column: ColumnIndex;
  readonly clusterKey: string;
}

/**
 * Column state during placement.
 */
interface ColumnState {
  readonly columnIndex: ColumnIndex;
  readonly x: number;
  readonly width: number;
  currentY: number;
  lastClusterKey: string | null;
  placements: BlockPlacement[];
}

/**
 * Compute fixed column x positions and widths.
 *
 * @param columns - Column indices used in layout
 * @param density - Density mode
 * @returns Array of column metadata
 */
export function computeColumnPositions(
  columns: ColumnIndex[],
  density: DensityMode
): ColumnLayoutMeta[] {
  const blockWidth = BLOCK_SIZES[density].w;

  // Sort columns
  const sortedColumns = [...columns].sort((a, b) => a - b);

  const columnMetas: ColumnLayoutMeta[] = [];
  let currentX = 0;

  for (const columnIndex of sortedColumns) {
    const roles = columnToRoles(columnIndex);

    columnMetas.push({
      columnIndex,
      x: currentX,
      width: blockWidth,
      roles,
    });

    currentX += blockWidth + colGap;
  }

  return columnMetas;
}

/**
 * Place blocks in grid layout.
 *
 * Blocks are ordered by row ordering tuple within each column.
 * Cluster gaps are inserted when cluster key changes.
 *
 * @param orderedBlocks - Blocks with ordering metadata
 * @param density - Density mode
 * @returns Block placements and column metadata
 */
export function placeBlocksInGrid(
  orderedBlocks: Array<{
    blockId: BlockId;
    column: ColumnIndex;
    clusterKey: string;
    w: number;
    h: number;
  }>,
  density: DensityMode
): {
  placements: Map<BlockId, BlockPlacement>;
  columns: ColumnLayoutMeta[];
} {
  // Determine which columns are used
  const usedColumns = new Set<ColumnIndex>();
  for (const block of orderedBlocks) {
    usedColumns.add(block.column);
  }

  // Compute column positions
  const columnMetas = computeColumnPositions(Array.from(usedColumns), density);

  // Build column state map
  const columnStates = new Map<ColumnIndex, ColumnState>();
  for (const meta of columnMetas) {
    columnStates.set(meta.columnIndex, {
      columnIndex: meta.columnIndex,
      x: meta.x,
      width: meta.width,
      currentY: 0,
      lastClusterKey: null,
      placements: [],
    });
  }

  // Place blocks
  for (const block of orderedBlocks) {
    const columnState = columnStates.get(block.column);
    if (!columnState) continue;

    // Add cluster gap if cluster key changes
    if (
      columnState.lastClusterKey !== null &&
      columnState.lastClusterKey !== block.clusterKey
    ) {
      columnState.currentY += clusterGap;
    }

    // Place block
    const placement: BlockPlacement = {
      blockId: block.blockId,
      x: columnState.x,
      y: columnState.currentY,
      w: block.w,
      h: block.h,
      column: block.column,
      clusterKey: block.clusterKey,
    };

    columnState.placements.push(placement);
    columnState.currentY += block.h + vGap;
    columnState.lastClusterKey = block.clusterKey;
  }

  // Collect all placements
  const placements = new Map<BlockId, BlockPlacement>();
  for (const columnState of columnStates.values()) {
    for (const placement of columnState.placements) {
      placements.set(placement.blockId, placement);
    }
  }

  return { placements, columns: columnMetas };
}

/**
 * Compute world-space bounding box for all placements.
 *
 * @param placements - Block placements
 * @returns Bounding rectangle
 */
export function computeBounds(placements: Map<BlockId, BlockPlacement>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (placements.size === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const placement of placements.values()) {
    minX = Math.min(minX, placement.x);
    minY = Math.min(minY, placement.y);
    maxX = Math.max(maxX, placement.x + placement.w);
    maxY = Math.max(maxY, placement.y + placement.h);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
