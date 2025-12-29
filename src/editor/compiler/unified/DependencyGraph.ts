/**
 * @file DependencyGraph - Unified dependency graph for blocks and buses
 * @description Builds and analyzes dependency graph across all system boundaries.
 *
 * Architecture principles:
 * - Blocks and buses are both nodes
 * - Connections and routing are edges
 * - Detect illegal instantaneous cycles
 * - Produce stable evaluation order
 */

/**
 * Node in the dependency graph.
 */
export interface GraphNode {
  /** Node ID (block ID or bus ID) */
  readonly id: string;

  /** Node type */
  readonly type: 'block' | 'bus';

  /** Dependencies (IDs of nodes this node depends on) */
  readonly deps: Set<string>;
}

/**
 * Edge in the dependency graph.
 */
export interface GraphEdge {
  /** Source node ID */
  readonly from: string;

  /** Target node ID */
  readonly to: string;

  /** Edge type */
  readonly type: 'connection' | 'publish' | 'listen';

  /** Is this edge through a state block? (breaks instantaneous cycles) */
  readonly throughState: boolean;
}

/**
 * Cycle detection result.
 */
export interface CycleInfo {
  /** Nodes in the cycle */
  readonly nodes: string[];

  /** Is this an illegal instantaneous cycle? */
  readonly isInstantaneous: boolean;

  /** Edges forming the cycle */
  readonly edges: GraphEdge[];
}

/**
 * Dependency graph for unified compilation.
 *
 * Responsibilities:
 * - Build graph from patch definition
 * - Detect cycles (legal and illegal)
 * - Compute topological sort for evaluation order
 * - Validate state boundaries
 */
export class DependencyGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private stateBlockIds = new Set<string>();

  /**
   * Add a block node to the graph.
   */
  addBlockNode(blockId: string, isStateBlock: boolean = false): void {
    if (!this.nodes.has(blockId)) {
      this.nodes.set(blockId, {
        id: blockId,
        type: 'block',
        deps: new Set(),
      });
      if (isStateBlock) {
        this.stateBlockIds.add(blockId);
      }
    }
  }

  /**
   * Add a bus node to the graph.
   */
  addBusNode(busId: string): void {
    if (!this.nodes.has(busId)) {
      this.nodes.set(busId, {
        id: busId,
        type: 'bus',
        deps: new Set(),
      });
    }
  }

  /**
   * Add a direct connection edge (block to block).
   *
   * An edge is "throughState" if it comes FROM a state block,
   * meaning the source block produces delayed/stateful output.
   */
  addConnectionEdge(fromBlockId: string, toBlockId: string): void {
    const edge: GraphEdge = {
      from: fromBlockId,
      to: toBlockId,
      type: 'connection',
      throughState: this.stateBlockIds.has(fromBlockId),
    };

    this.edges.push(edge);

    // Update dependencies
    const toNode = this.nodes.get(toBlockId);
    if (toNode != null) {
      toNode.deps.add(fromBlockId);
    }
  }

  /**
   * Add a publish edge (block to bus).
   */
  addPublishEdge(blockId: string, busId: string): void {
    const edge: GraphEdge = {
      from: blockId,
      to: busId,
      type: 'publish',
      throughState: false,
    };

    this.edges.push(edge);

    // Bus depends on publisher
    const busNode = this.nodes.get(busId);
    if (busNode != null) {
      busNode.deps.add(blockId);
    }
  }

  /**
   * Add a listen edge (bus to block).
   *
   * An edge is "throughState" if it goes INTO a state block,
   * meaning the target block will delay the signal.
   */
  addListenEdge(busId: string, blockId: string): void {
    const edge: GraphEdge = {
      from: busId,
      to: blockId,
      type: 'listen',
      throughState: this.stateBlockIds.has(blockId),
    };

    this.edges.push(edge);

    // Block depends on bus
    const blockNode = this.nodes.get(blockId);
    if (blockNode != null) {
      blockNode.deps.add(busId);
    }
  }

  /**
   * Detect cycles in the graph.
   *
   * @returns Array of detected cycles (empty if no cycles)
   */
  detectCycles(): CycleInfo[] {
    const cycles: CycleInfo[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node == null) {
        path.pop();
        recStack.delete(nodeId);
        return false;
      }

      for (const depId of node.deps) {
        if (!visited.has(depId)) {
          if (dfs(depId)) {
            return true;
          }
        } else if (recStack.has(depId)) {
          // Found a cycle
          const cycleStart = path.indexOf(depId);
          const cycleNodes = path.slice(cycleStart);

          // Check if cycle is instantaneous (no state blocks)
          const cycleEdges = this.edges.filter(
            (e) => cycleNodes.includes(e.from) && cycleNodes.includes(e.to)
          );
          const isInstantaneous = !cycleEdges.some((e) => e.throughState);

          cycles.push({
            nodes: cycleNodes,
            isInstantaneous,
            edges: cycleEdges,
          });
        }
      }

      path.pop();
      recStack.delete(nodeId);
      return false;
    };

    // Run DFS from each node
    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return cycles;
  }

  /**
   * Compute topological sort for evaluation order.
   *
   * Uses Kahn's algorithm with stable ordering (secondary sort by ID).
   * Edges through state blocks are ignored for ordering (they represent delayed feedback).
   *
   * @throws Error if graph has instantaneous cycles
   * @returns Ordered list of node IDs
   */
  topologicalSort(): string[] {
    // Check for illegal cycles first
    const cycles = this.detectCycles();
    const instantaneousCycles = cycles.filter((c) => c.isInstantaneous);
    if (instantaneousCycles.length > 0) {
      const cycleDesc = instantaneousCycles[0].nodes.join(' -> ');
      throw new Error(`Illegal instantaneous cycle detected: ${cycleDesc}`);
    }

    // Kahn's algorithm - only consider instantaneous edges
    const inDegree = new Map<string, number>();
    const result: string[] = [];

    // Initialize in-degrees
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
    }

    // Only count edges that are NOT through state blocks
    const instantaneousEdges = this.edges.filter((e) => !e.throughState);
    for (const edge of instantaneousEdges) {
      const current = inDegree.get(edge.to) ?? 0;
      inDegree.set(edge.to, current + 1);
    }

    // Find all nodes with no incoming instantaneous edges
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Stable sort queue by ID
    queue.sort();

    // Process queue
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      // Find all instantaneous outgoing edges from this node
      const outgoingEdges = instantaneousEdges.filter((e) => e.from === nodeId);
      for (const edge of outgoingEdges) {
        const degree = inDegree.get(edge.to)!;
        inDegree.set(edge.to, degree - 1);

        if (degree - 1 === 0) {
          queue.push(edge.to);
          queue.sort(); // Maintain stable ordering
        }
      }
    }

    // Check if all nodes were processed
    // (should always succeed if cycle detection passed)
    if (result.length !== this.nodes.size) {
      throw new Error('Graph has unresolved dependencies (internal error)');
    }

    return result;
  }

  /**
   * Get all dependencies for a node (transitive closure).
   */
  getDependencies(nodeId: string): Set<string> {
    const deps = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (node == null) return;

      for (const depId of node.deps) {
        deps.add(depId);
        traverse(depId);
      }
    };

    traverse(nodeId);
    return deps;
  }

  /**
   * Get all nodes that depend on a given node.
   */
  getDependents(nodeId: string): Set<string> {
    const dependents = new Set<string>();

    for (const [id, node] of this.nodes) {
      if (node.deps.has(nodeId)) {
        dependents.add(id);
      }
    }

    return dependents;
  }

  /**
   * Get node by ID.
   */
  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes.
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges.
   */
  getAllEdges(): GraphEdge[] {
    return this.edges;
  }

  /**
   * Clear the graph.
   */
  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.stateBlockIds.clear();
  }
}
