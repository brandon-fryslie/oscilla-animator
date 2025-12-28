/**
 * Layout Computation Entry Point
 *
 * Pure function that computes complete layout from graph data and UI state.
 * Deterministic: same inputs always produce identical output.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md
 */

import { computeClusterKeys } from './clustering';
import { roleToColumn } from './columns';
import { deriveConnectors } from './connectors';
import {
  buildAdjacencyGraph,
  buildMetaDAG,
  computeBlockDepths,
  computeDepths,
  processSccs,
  tarjanSCC,
} from './depgraph';
import { computeRowOrderTuple, sortByRowOrder, tupleToRowKey } from './ordering';
import { computeBounds, placeBlocksInGrid } from './placement';
import { enforceProximity } from './proximity';
import { measureBlock } from './sizing';
import type {
  GraphData,
  LayoutNodeView,
  LayoutResult,
  UILayoutState,
} from './types';

/**
 * Compute complete layout for a graph.
 *
 * Pure function with no side effects.
 * Same inputs always produce identical output (deterministic).
 *
 * Algorithm:
 * 1. Build dependency graph and detect SCCs (cycles)
 * 2. Compute depth for each block
 * 3. Compute cluster keys from bus signatures
 * 4. Compute row ordering tuples
 * 5. Initial grid placement
 * 6. Proximity enforcement (optional optimization)
 * 7. Derive connectors and overflow links
 *
 * @param graph - Graph data (blocks and bindings)
 * @param uiState - UI state (density, focus, viewport)
 * @returns Complete layout result
 */
export function computeLayout(graph: GraphData, uiState: UILayoutState): LayoutResult {
  const { density, focusedBlockId, focusedBusId, viewportRectWorld } = uiState;

  // Step 1: Build dependency graph and detect SCCs
  const adjGraph = buildAdjacencyGraph(graph);
  const sccArrays = tarjanSCC(adjGraph);
  const sccs = processSccs(sccArrays);

  // Step 2: Build meta-DAG and compute depths
  const metaDAG = buildMetaDAG(adjGraph, sccs);
  const metaDepths = computeDepths(metaDAG);

  // Build SCC map
  const sccMap = new Map<string, typeof sccs[0]>();
  for (const scc of sccs) {
    for (const blockId of scc.blocks) {
      sccMap.set(blockId, scc);
    }
  }

  const blockDepths = computeBlockDepths(metaDepths, sccMap);

  // Step 3: Compute cluster keys
  const blockRoles = graph.blocks.map((b) => ({ id: b.id, role: b.role }));
  const clusterKeys = computeClusterKeys(blockRoles, graph.busBindings, focusedBusId);

  // Step 4: Compute row ordering tuples
  const rowOrderTuples = graph.blocks.map((block) => {
    const column = roleToColumn(block.role);
    const clusterKey = clusterKeys.get(block.id) ?? 'unknown';
    const depth = blockDepths.get(block.id) ?? 0;

    return computeRowOrderTuple(block.id, column, clusterKey, depth, block.role);
  });

  // Sort blocks by row ordering
  const sortedTuples = sortByRowOrder(rowOrderTuples);

  // Step 5: Measure blocks and prepare for placement
  const orderedBlocks = sortedTuples.map((tuple) => {
    const block = graph.blocks.find((b) => b.id === tuple.blockId)!;
    const size = measureBlock(block, density);

    return {
      blockId: tuple.blockId,
      column: tuple.column,
      clusterKey: tuple.clusterKey,
      w: size.w,
      h: size.h,
    };
  });

  // Step 6: Initial grid placement
  let { placements, columns } = placeBlocksInGrid(orderedBlocks, density);

  // Step 7: Proximity enforcement (mutates placements)
  // Note: Unused currently but available for future optimization
  // @ts-expect-error - Unused for now but available for future optimization
  const _proximityStats = enforceProximity(
    graph.directBindings,
    placements,
    clusterKeys,
    blockDepths,
    focusedBlockId
  );

  // Step 8: Build block data map for connector derivation
  const blockDataMap = new Map(graph.blocks.map((b) => [b.id, b]));

  // Step 9: Derive connectors and overflow links
  const { connectors, overflowLinks } = deriveConnectors(
    graph.directBindings,
    placements,
    blockDataMap,
    density,
    viewportRectWorld
  );

  // Step 10: Build layout nodes
  const nodes: Record<string, LayoutNodeView> = {};

  for (const tuple of sortedTuples) {
    const placement = placements.get(tuple.blockId);
    if (!placement) continue;

    const scc = sccMap.get(tuple.blockId);
    const sccId = scc && scc.blocks.length > 1 ? scc.id : undefined;
    const isCycleGroupLeader = scc && scc.blocks.length > 1 && scc.leader === tuple.blockId;

    nodes[tuple.blockId] = {
      blockId: tuple.blockId,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      column: tuple.column,
      rowKey: tupleToRowKey(tuple),
      role: tuple.blockId as any, // Temporary - will be fixed below
      depth: tuple.depth,
      clusterKey: tuple.clusterKey,
      sccId,
      isCycleGroupLeader,
    };
  }

  // Fix role mapping
  for (const tuple of sortedTuples) {
    const block = graph.blocks.find((b) => b.id === tuple.blockId);
    if (block && nodes[tuple.blockId]) {
      nodes[tuple.blockId] = {
        ...nodes[tuple.blockId],
        role: block.role,
      };
    }
  }

  // Step 11: Compute bounds
  const boundsWorld = computeBounds(placements);

  // Step 12: Build debug info
  const debug = {
    totalBlocks: graph.blocks.length,
    totalConnectors: connectors.length,
    totalOverflowLinks: overflowLinks.length,
    columnCount: columns.length,
    sccCount: sccs.filter((scc) => scc.blocks.length > 1).length,
    maxDepth: Math.max(...Array.from(blockDepths.values()), 0),
    clusterCount: new Set(clusterKeys.values()).size,
  };

  return {
    nodes,
    connectors,
    overflowLinks,
    boundsWorld,
    columns,
    debug,
  };
}
