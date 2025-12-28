/**
 * Proximity Enforcement
 *
 * Reorders blocks within columns to bring connected blocks closer together.
 * Respects cluster boundaries and depth ordering constraints.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 8)
 */

import {
  maxProximityIterations,
  minImprovementEpsilon,
  moveBudgetPerPass,
  Ysnap,
} from './constants';
import type { BlockId, BlockPlacement, DirectBinding } from './types';

/**
 * Edge with priority for proximity enforcement.
 */
interface PrioritizedEdge {
  readonly edge: DirectBinding;
  readonly priority: number;
}

/**
 * Compute edge priority for proximity enforcement.
 *
 * Higher priority edges are processed first.
 * Priority order:
 * 1. Edges involving focused block
 * 2. Edges ordered by (to.depth, from.blockId, to.blockId, from.portId, to.portId)
 *
 * @param edge - Direct binding
 * @param focusedBlockId - Focused block ID (if any)
 * @param depths - Map from BlockId to depth
 * @returns Priority value (higher = more important)
 */
function computeEdgePriority(
  edge: DirectBinding,
  focusedBlockId: BlockId | undefined,
  depths: Map<BlockId, number>
): number {
  // Focused block edges have highest priority
  if (focusedBlockId !== undefined) {
    if (edge.to.blockId === focusedBlockId) {
      return 1000000; // Very high priority
    }
    if (edge.from.blockId === focusedBlockId) {
      return 999999; // Also very high
    }
  }

  // Otherwise, priority based on consumer depth (lower depth = higher priority)
  const toDepth = depths.get(edge.to.blockId) ?? 0;
  return 1000 - toDepth; // Invert so lower depth = higher priority
}

/**
 * Sort edges by priority for proximity enforcement.
 *
 * @param edges - Direct bindings
 * @param focusedBlockId - Focused block ID (if any)
 * @param depths - Map from BlockId to depth
 * @returns Sorted array of edges
 */
export function sortEdgesByPriority(
  edges: DirectBinding[],
  focusedBlockId: BlockId | undefined,
  depths: Map<BlockId, number>
): DirectBinding[] {
  const prioritized: PrioritizedEdge[] = edges.map((edge) => ({
    edge,
    priority: computeEdgePriority(edge, focusedBlockId, depths),
  }));

  // Sort by priority (descending), then by edge properties for determinism
  prioritized.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }

    // Tie-breaker: sort by edge properties
    if (a.edge.to.blockId !== b.edge.to.blockId) {
      return a.edge.to.blockId.localeCompare(b.edge.to.blockId);
    }
    if (a.edge.from.blockId !== b.edge.from.blockId) {
      return a.edge.from.blockId.localeCompare(b.edge.from.blockId);
    }
    if (a.edge.to.portId !== b.edge.to.portId) {
      return a.edge.to.portId.localeCompare(b.edge.to.portId);
    }
    return a.edge.from.portId.localeCompare(b.edge.from.portId);
  });

  return prioritized.map((p) => p.edge);
}

/**
 * Compute total edge length.
 *
 * @param edges - Direct bindings
 * @param placements - Block placements
 * @returns Total edge length
 */
function computeTotalEdgeLength(
  edges: DirectBinding[],
  placements: Map<BlockId, BlockPlacement>
): number {
  let total = 0;

  for (const edge of edges) {
    const fromPlacement = placements.get(edge.from.blockId);
    const toPlacement = placements.get(edge.to.blockId);

    if (fromPlacement && toPlacement) {
      // Compute distance (center to center for simplicity)
      const fromCenterY = fromPlacement.y + fromPlacement.h / 2;
      const toCenterY = toPlacement.y + toPlacement.h / 2;
      const dx = toPlacement.x - fromPlacement.x;
      const dy = toCenterY - fromCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      total += distance;
    }
  }

  return total;
}

/**
 * Attempt to reorder a block within its column to bring it closer to target.
 *
 * Respects constraints:
 * - Cannot cross cluster boundaries
 * - Cannot violate depth ordering within cluster
 *
 * @param blockId - Block to reorder
 * @param targetY - Target Y position
 * @param placements - Current placements (mutated)
 * @param clusterKeys - Map from BlockId to cluster key
 * @param depths - Map from BlockId to depth
 * @returns True if reordering succeeded
 */
function attemptReorder(
  blockId: BlockId,
  targetY: number,
  placements: Map<BlockId, BlockPlacement>,
  clusterKeys: Map<BlockId, string>,
  depths: Map<BlockId, number>
): boolean {
  const placement = placements.get(blockId);
  if (!placement) return false;

  const column = placement.column;
  const clusterKey = clusterKeys.get(blockId);
  const depth = depths.get(blockId) ?? 0;

  // Get all blocks in the same column
  const columnBlocks: BlockPlacement[] = [];
  for (const p of placements.values()) {
    if (p.column === column) {
      columnBlocks.push(p);
    }
  }

  // Sort by current Y position
  columnBlocks.sort((a, b) => a.y - b.y);

  // Find blocks in the same cluster
  const clusterBlocks = columnBlocks.filter((p) => clusterKeys.get(p.blockId) === clusterKey);

  // Find current index
  const currentIndex = clusterBlocks.findIndex((p) => p.blockId === blockId);
  if (currentIndex === -1) return false;

  // Find target index (closest to targetY within cluster)
  let targetIndex = currentIndex;
  let minDistance = Math.abs(clusterBlocks[currentIndex].y - targetY);

  for (let i = 0; i < clusterBlocks.length; i++) {
    const distance = Math.abs(clusterBlocks[i].y - targetY);
    if (distance < minDistance) {
      minDistance = distance;
      targetIndex = i;
    }
  }

  // If already at best position, nothing to do
  if (targetIndex === currentIndex) return false;

  // Check depth constraint: cannot move before blocks with smaller depth
  for (let i = Math.min(currentIndex, targetIndex); i <= Math.max(currentIndex, targetIndex); i++) {
    if (i !== currentIndex) {
      const otherDepth = depths.get(clusterBlocks[i].blockId) ?? 0;
      if (targetIndex < currentIndex && otherDepth > depth) {
        // Moving up but would cross a deeper block
        return false;
      }
      if (targetIndex > currentIndex && otherDepth < depth) {
        // Moving down but would cross a shallower block
        return false;
      }
    }
  }

  // Perform reordering by swapping
  const temp = clusterBlocks[currentIndex];
  clusterBlocks.splice(currentIndex, 1);
  clusterBlocks.splice(targetIndex, 0, temp);

  // Rebuild column with new ordering
  // First, remove old cluster blocks from columnBlocks
  const otherBlocks = columnBlocks.filter((p) => clusterKeys.get(p.blockId) !== clusterKey);

  // Merge back in sorted order
  const newColumnBlocks = [...otherBlocks];
  for (const block of clusterBlocks) {
    newColumnBlocks.push(block);
  }
  newColumnBlocks.sort((a, b) => {
    // Sort by cluster key first
    const aCluster = clusterKeys.get(a.blockId) ?? '';
    const bCluster = clusterKeys.get(b.blockId) ?? '';
    if (aCluster !== bCluster) {
      return aCluster.localeCompare(bCluster);
    }
    // Within cluster, maintain new order
    const aIdx = clusterBlocks.findIndex((p) => p.blockId === a.blockId);
    const bIdx = clusterBlocks.findIndex((p) => p.blockId === b.blockId);
    if (aIdx !== -1 && bIdx !== -1) {
      return aIdx - bIdx;
    }
    // Fallback to original order
    return a.y - b.y;
  });

  // Recalculate Y positions
  let currentY = 0;
  let lastCluster: string | null = null;

  for (const block of newColumnBlocks) {
    const cluster = clusterKeys.get(block.blockId);

    // Add cluster gap if cluster changed
    if (lastCluster !== null && cluster !== lastCluster) {
      currentY += 24; // clusterGap
    }

    // Update placement
    const newPlacement: BlockPlacement = {
      ...block,
      y: currentY,
    };

    placements.set(block.blockId, newPlacement);
    currentY += block.h + 12; // vGap
    lastCluster = cluster ?? null;
  }

  return true;
}

/**
 * Enforce proximity for direct bindings.
 *
 * Attempts to reorder blocks within columns to reduce edge lengths.
 * Stops after budget exhausted, max iterations, or no improvement.
 *
 * @param edges - Direct bindings
 * @param placements - Block placements (mutated)
 * @param clusterKeys - Map from BlockId to cluster key
 * @param depths - Map from BlockId to depth
 * @param focusedBlockId - Focused block ID (if any)
 * @returns Statistics about proximity enforcement
 */
export function enforceProximity(
  edges: DirectBinding[],
  placements: Map<BlockId, BlockPlacement>,
  clusterKeys: Map<BlockId, string>,
  depths: Map<BlockId, number>,
  focusedBlockId?: BlockId
): {
  iterations: number;
  movesMade: number;
  initialLength: number;
  finalLength: number;
} {
  const initialLength = computeTotalEdgeLength(edges, placements);
  let movesMade = 0;
  let iterations = 0;

  // Sort edges by priority
  const sortedEdges = sortEdgesByPriority(edges, focusedBlockId, depths);

  for (let iter = 0; iter < maxProximityIterations; iter++) {
    iterations++;
    let movesThisIteration = 0;
    const lengthBefore = computeTotalEdgeLength(edges, placements);

    // Process edges in priority order
    for (const edge of sortedEdges) {
      if (movesMade >= moveBudgetPerPass) {
        break; // Budget exhausted
      }

      const fromPlacement = placements.get(edge.from.blockId);
      const toPlacement = placements.get(edge.to.blockId);

      if (!fromPlacement || !toPlacement) continue;

      // Compute vertical distance
      const fromCenterY = fromPlacement.y + fromPlacement.h / 2;
      const toCenterY = toPlacement.y + toPlacement.h / 2;
      const dy = Math.abs(toCenterY - fromCenterY);

      // If within snap tolerance, skip
      if (dy <= Ysnap) continue;

      // Same column: try to bring consumer next to producer
      if (fromPlacement.column === toPlacement.column) {
        const targetY = fromPlacement.y + fromPlacement.h + 12; // vGap
        if (attemptReorder(edge.to.blockId, targetY, placements, clusterKeys, depths)) {
          movesThisIteration++;
          movesMade++;
        }
      }
      // Different columns: try to align vertically
      else {
        const targetY = fromCenterY - toPlacement.h / 2; // Center-align
        if (attemptReorder(edge.to.blockId, targetY, placements, clusterKeys, depths)) {
          movesThisIteration++;
          movesMade++;
        }
      }
    }

    // Check for improvement
    const lengthAfter = computeTotalEdgeLength(edges, placements);
    const improvement = lengthBefore - lengthAfter;

    // Stop if no moves made or improvement too small
    if (movesThisIteration === 0 || improvement < minImprovementEpsilon) {
      break;
    }
  }

  const finalLength = computeTotalEdgeLength(edges, placements);

  return {
    iterations,
    movesMade,
    initialLength,
    finalLength,
  };
}
