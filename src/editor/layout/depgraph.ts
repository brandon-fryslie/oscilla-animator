/**
 * Dependency Graph and SCC Detection
 *
 * Builds dependency graph from direct bindings,
 * detects strongly connected components (cycles) using Tarjan's algorithm,
 * collapses SCCs into meta-nodes, and computes depth.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Sections 3-4)
 */

import type { BlockId, GraphData, MetaNode, SCC } from './types';

// =============================================================================
// Adjacency Graph
// =============================================================================

export interface AdjacencyGraph {
  /** Adjacency list: blockId -> array of blockIds it depends on */
  readonly edges: Map<BlockId, BlockId[]>;

  /** All block IDs in the graph */
  readonly nodes: Set<BlockId>;
}

/**
 * Build adjacency graph from direct bindings.
 *
 * Edge direction: from.blockId -> to.blockId (producer -> consumer)
 *
 * @param graph - Graph data
 * @returns Adjacency graph
 */
export function buildAdjacencyGraph(graph: GraphData): AdjacencyGraph {
  const edges = new Map<BlockId, BlockId[]>();
  const nodes = new Set<BlockId>();

  // Add all blocks as nodes
  for (const block of graph.blocks) {
    nodes.add(block.id);
    if (!edges.has(block.id)) {
      edges.set(block.id, []);
    }
  }

  // Add edges from direct bindings
  for (const binding of graph.directBindings) {
    const from = binding.from.blockId;
    const to = binding.to.blockId;

    nodes.add(from);
    nodes.add(to);

    // Consumer depends on producer
    if (!edges.has(to)) {
      edges.set(to, []);
    }
    edges.get(to)!.push(from);
  }

  return { edges, nodes };
}

// =============================================================================
// Tarjan SCC Algorithm
// =============================================================================

interface TarjanState {
  index: number;
  stack: BlockId[];
  indices: Map<BlockId, number>;
  lowlinks: Map<BlockId, number>;
  onStack: Set<BlockId>;
  sccs: BlockId[][];
}

/**
 * Find strongly connected components using Tarjan's algorithm.
 *
 * Returns SCCs in reverse topological order (leaves first).
 *
 * @param graph - Adjacency graph
 * @returns Array of SCCs (each SCC is an array of BlockIds)
 */
export function tarjanSCC(graph: AdjacencyGraph): BlockId[][] {
  const state: TarjanState = {
    index: 0,
    stack: [],
    indices: new Map(),
    lowlinks: new Map(),
    onStack: new Set(),
    sccs: [],
  };

  // Sort nodes for determinism
  const sortedNodes = Array.from(graph.nodes).sort();

  for (const node of sortedNodes) {
    if (!state.indices.has(node)) {
      strongconnect(node, graph, state);
    }
  }

  return state.sccs;
}

function strongconnect(v: BlockId, graph: AdjacencyGraph, state: TarjanState): void {
  // Set the depth index for v to the smallest unused index
  state.indices.set(v, state.index);
  state.lowlinks.set(v, state.index);
  state.index++;
  state.stack.push(v);
  state.onStack.add(v);

  // Consider successors of v (nodes that v depends on)
  const successors = graph.edges.get(v) ?? [];
  // Sort for determinism
  const sortedSuccessors = [...successors].sort();

  for (const w of sortedSuccessors) {
    if (!state.indices.has(w)) {
      // Successor w has not yet been visited; recurse on it
      strongconnect(w, graph, state);
      state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.lowlinks.get(w)!));
    } else if (state.onStack.has(w)) {
      // Successor w is in stack and hence in the current SCC
      state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.indices.get(w)!));
    }
  }

  // If v is a root node, pop the stack and generate an SCC
  if (state.lowlinks.get(v) === state.indices.get(v)) {
    const scc: BlockId[] = [];
    let w: BlockId;
    do {
      w = state.stack.pop()!;
      state.onStack.delete(w);
      scc.push(w);
    } while (w !== v);

    // Sort SCC members for determinism
    scc.sort();
    state.sccs.push(scc);
  }
}

// =============================================================================
// SCC Processing
// =============================================================================

/**
 * Convert raw SCC arrays to SCC objects with IDs and leaders.
 *
 * SCC ID is derived from sorted members (deterministic).
 *
 * @param sccArrays - Raw SCC arrays from Tarjan
 * @returns Array of SCC objects
 */
export function processSccs(sccArrays: BlockId[][]): SCC[] {
  return sccArrays.map((blocks) => {
    // Blocks are already sorted by tarjanSCC
    const leader = blocks[0]; // Minimum blockId
    const id = `scc-${blocks.join('-')}`;

    return { id, blocks, leader };
  });
}

/**
 * Build SCC membership map.
 *
 * @param sccs - Array of SCCs
 * @returns Map from BlockId to SCC
 */
export function buildSccMap(sccs: SCC[]): Map<BlockId, SCC> {
  const map = new Map<BlockId, SCC>();

  for (const scc of sccs) {
    for (const blockId of scc.blocks) {
      map.set(blockId, scc);
    }
  }

  return map;
}

// =============================================================================
// Meta-DAG Construction
// =============================================================================

export interface MetaDAG {
  /** Meta-nodes (single blocks or SCCs) */
  readonly nodes: Map<string, MetaNode>;

  /** Edges between meta-nodes (meta-node key -> dependencies) */
  readonly edges: Map<string, Set<string>>;
}

/**
 * Get meta-node key for deterministic ordering.
 *
 * @param node - Meta-node
 * @returns Stable key string
 */
export function getMetaNodeKey(node: MetaNode): string {
  if (node.kind === 'single') {
    return node.blockId;
  } else {
    return node.scc.id;
  }
}

/**
 * Build meta-DAG from SCCs and original graph.
 *
 * Collapses SCCs into single meta-nodes.
 * Edges between different SCCs become meta-edges.
 *
 * @param graph - Original adjacency graph
 * @param sccs - Array of SCCs
 * @returns Meta-DAG
 */
export function buildMetaDAG(graph: AdjacencyGraph, sccs: SCC[]): MetaDAG {
  const sccMap = buildSccMap(sccs);

  // Create meta-nodes
  const nodes = new Map<string, MetaNode>();
  const edges = new Map<string, Set<string>>();

  // Add SCC meta-nodes
  for (const scc of sccs) {
    if (scc.blocks.length > 1) {
      const metaNode: MetaNode = { kind: 'scc', scc };
      const key = getMetaNodeKey(metaNode);
      nodes.set(key, metaNode);
      edges.set(key, new Set());
    }
  }

  // Add single-block meta-nodes
  for (const blockId of graph.nodes) {
    const scc = sccMap.get(blockId);
    if (!scc || scc.blocks.length === 1) {
      const metaNode: MetaNode = { kind: 'single', blockId };
      const key = getMetaNodeKey(metaNode);
      nodes.set(key, metaNode);
      edges.set(key, new Set());
    }
  }

  // Add edges between meta-nodes
  for (const [blockId, dependencies] of graph.edges.entries()) {
    const blockScc = sccMap.get(blockId);
    const fromKey = blockScc && blockScc.blocks.length > 1 ? blockScc.id : blockId;

    for (const depId of dependencies) {
      const depScc = sccMap.get(depId);
      const toKey = depScc && depScc.blocks.length > 1 ? depScc.id : depId;

      // Only add edge if crossing meta-node boundaries
      if (fromKey !== toKey) {
        if (!edges.has(fromKey)) {
          edges.set(fromKey, new Set());
        }
        edges.get(fromKey)!.add(toKey);
      }
    }
  }

  return { nodes, edges };
}

// =============================================================================
// Depth Calculation
// =============================================================================

/**
 * Compute depth for each meta-node (longest path from root).
 *
 * Uses topological sort + dynamic programming.
 * Builds reverse edges to traverse from producers to consumers.
 *
 * @param metaDAG - Meta-DAG
 * @returns Map from meta-node key to depth
 */
export function computeDepths(metaDAG: MetaDAG): Map<string, number> {
  const depths = new Map<string, number>();
  const inDegree = new Map<string, number>();

  // Build reverse edges (dependents instead of dependencies)
  const dependents = new Map<string, Set<string>>();
  for (const key of metaDAG.nodes.keys()) {
    dependents.set(key, new Set());
  }

  // Initialize in-degrees and build reverse edges
  for (const key of metaDAG.nodes.keys()) {
    inDegree.set(key, 0);
  }

  for (const [fromKey, deps] of metaDAG.edges.entries()) {
    for (const depKey of deps) {
      // fromKey depends on depKey
      // So depKey has fromKey as a dependent
      inDegree.set(fromKey, (inDegree.get(fromKey) ?? 0) + 1);
      if (!dependents.has(depKey)) {
        dependents.set(depKey, new Set());
      }
      dependents.get(depKey)!.add(fromKey);
    }
  }

  // Find roots (nodes with in-degree 0 - no dependencies)
  const roots: string[] = [];
  for (const [key, degree] of inDegree.entries()) {
    if (degree === 0) {
      roots.push(key);
    }
  }

  // Sort roots for determinism
  roots.sort();

  // BFS from roots, computing depths
  const queue = [...roots];
  for (const root of roots) {
    depths.set(root, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current)!;

    // Get dependents (nodes that depend on current)
    const deps = dependents.get(current) ?? new Set();

    // Process each dependent
    for (const depKey of Array.from(deps).sort()) {
      const depDepth = depths.get(depKey) ?? 0;
      const newDepth = Math.max(depDepth, currentDepth + 1);

      if (newDepth > depDepth) {
        depths.set(depKey, newDepth);
      }

      // Decrement in-degree
      const newInDegree = (inDegree.get(depKey) ?? 0) - 1;
      inDegree.set(depKey, newInDegree);

      // If all dependencies processed, add to queue
      if (newInDegree === 0 && !queue.includes(depKey)) {
        queue.push(depKey);
      }
    }
  }

  return depths;
}

/**
 * Compute depth for each block from meta-node depths.
 *
 * @param metaDepths - Map from meta-node key to depth
 * @param sccMap - Map from BlockId to SCC
 * @returns Map from BlockId to depth
 */
export function computeBlockDepths(
  metaDepths: Map<string, number>,
  sccMap: Map<BlockId, SCC>
): Map<BlockId, number> {
  const blockDepths = new Map<BlockId, number>();

  for (const [blockId, scc] of sccMap.entries()) {
    const metaKey = scc.blocks.length > 1 ? scc.id : blockId;
    const depth = metaDepths.get(metaKey) ?? 0;
    blockDepths.set(blockId, depth);
  }

  // Handle blocks not in any SCC
  for (const [metaKey, depth] of metaDepths.entries()) {
    if (!metaKey.startsWith('scc-')) {
      blockDepths.set(metaKey, depth);
    }
  }

  return blockDepths;
}
