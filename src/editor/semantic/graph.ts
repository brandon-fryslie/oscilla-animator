/**
 * Semantic Graph
 *
 * Derived indices from PatchDocument for fast validation queries.
 * This is the canonical representation of the patch graph structure,
 * used by both UI and compiler for validation.
 *
 * Key features:
 * - Incremental updates (O(1)/O(log n) per change)
 * - Multiple index structures for different query patterns
 * - Supports wire edges, publisher edges, and listener edges
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/5-DivergentTypes.md
 */

import type {
  PatchDocument,
  WireEdge,
  PublisherEdge,
  ListenerEdge,
  GraphEdge,
  BlockNode,
} from './types';
import {
  portRefToKey,
  portKeyToRef,
  portRefFromConnection,
  portRefFromPublisher,
  portRefFromListener
} from './types';
import type { PortRef } from '../types';

/**
 * SemanticGraph provides fast indexed access to patch structure.
 *
 * Indices maintained:
 * - incoming edges per input port
 * - outgoing edges per output port
 * - publishers per bus (sorted by sortKey)
 * - listeners per bus
 * - adjacency for cycle detection
 */
export class SemanticGraph {
  /** All blocks in the graph */
  private blocks: Map<string, BlockNode> = new Map();

  /** Incoming edges per port (wire edges only) */
  private incomingWires: Map<string, WireEdge[]> = new Map();

  /** Outgoing edges per port (wire edges only) */
  private outgoingWires: Map<string, WireEdge[]> = new Map();

  /** Incoming edges per port (listener edges - bus to port) */
  private incomingListeners: Map<string, ListenerEdge[]> = new Map();

  /** Outgoing edges per port (publisher edges - port to bus) */
  private outgoingPublishers: Map<string, PublisherEdge[]> = new Map();

  /** Publishers per bus (sorted by sortKey for deterministic ordering) */
  private busPublishers: Map<string, PublisherEdge[]> = new Map();

  /** Listeners per bus */
  private busListeners: Map<string, ListenerEdge[]> = new Map();

  /** Block adjacency for cycle detection (blockId -> downstream blockIds) */
  private adjacency: Map<string, Set<string>> = new Map();

  /**
   * Build a SemanticGraph from a PatchDocument.
   */
  static fromPatch(patch: PatchDocument): SemanticGraph {
    const graph = new SemanticGraph();
    graph.rebuild(patch);
    return graph;
  }

  /**
   * Rebuild all indices from scratch.
   * Used during initial construction and after major changes.
   */
  private rebuild(patch: PatchDocument): void {
    // Clear all indices
    this.blocks.clear();
    this.incomingWires.clear();
    this.outgoingWires.clear();
    this.incomingListeners.clear();
    this.outgoingPublishers.clear();
    this.busPublishers.clear();
    this.busListeners.clear();
    this.adjacency.clear();

    // Index blocks
    for (const block of patch.blocks) {
      this.blocks.set(block.id, {
        kind: 'block',
        blockId: block.id,
        blockType: block.type,
      });
      this.adjacency.set(block.id, new Set());
    }

    // Index wire edges
    for (const conn of patch.connections) {
      const edge: WireEdge = {
        kind: 'wire',
        connectionId: conn.id,
        from: portRefFromConnection(conn, 'from'),
        to: portRefFromConnection(conn, 'to'),
      };

      this.addWireEdge(edge);

      // Update adjacency for cycle detection
      this.addAdjacency(conn.from.blockId, conn.to.blockId);
    }

    // Index publisher edges
    if (patch.publishers) {
      for (const pub of patch.publishers) {
        if (!pub.enabled) continue; // Skip disabled publishers

        const edge: PublisherEdge = {
          kind: 'publisher',
          publisherId: pub.id,
          from: portRefFromPublisher(pub),
          busId: pub.busId,
          sortKey: pub.sortKey,
        };

        this.addPublisherEdge(edge);
      }
    }

    // Index listener edges
    if (patch.listeners) {
      for (const listener of patch.listeners) {
        if (!listener.enabled) continue; // Skip disabled listeners

        const edge: ListenerEdge = {
          kind: 'listener',
          listenerId: listener.id,
          busId: listener.busId,
          to: portRefFromListener(listener),
        };

        this.addListenerEdge(edge);
      }
    }

    // Sort bus publishers by sortKey for deterministic ordering
    for (const publishers of this.busPublishers.values()) {
      publishers.sort((a, b) => a.sortKey - b.sortKey);
    }
  }

  // ===========================================================================
  // Incremental Update Methods
  // ===========================================================================

  /**
   * Add a wire edge to the indices.
   */
  private addWireEdge(edge: WireEdge): void {
    const fromKey = portRefToKey(edge.from);
    const toKey = portRefToKey(edge.to);

    // Add to outgoing wires
    if (!this.outgoingWires.has(fromKey)) {
      this.outgoingWires.set(fromKey, []);
    }
    this.outgoingWires.get(fromKey)!.push(edge);

    // Add to incoming wires
    if (!this.incomingWires.has(toKey)) {
      this.incomingWires.set(toKey, []);
    }
    this.incomingWires.get(toKey)!.push(edge);
  }

  /**
   * Add a publisher edge to the indices.
   */
  private addPublisherEdge(edge: PublisherEdge): void {
    const fromKey = portRefToKey(edge.from);

    // Add to outgoing publishers
    if (!this.outgoingPublishers.has(fromKey)) {
      this.outgoingPublishers.set(fromKey, []);
    }
    this.outgoingPublishers.get(fromKey)!.push(edge);

    // Add to bus publishers
    if (!this.busPublishers.has(edge.busId)) {
      this.busPublishers.set(edge.busId, []);
    }
    this.busPublishers.get(edge.busId)!.push(edge);
  }

  /**
   * Add a listener edge to the indices.
   */
  private addListenerEdge(edge: ListenerEdge): void {
    const toKey = portRefToKey(edge.to);

    // Add to incoming listeners
    if (!this.incomingListeners.has(toKey)) {
      this.incomingListeners.set(toKey, []);
    }
    this.incomingListeners.get(toKey)!.push(edge);

    // Add to bus listeners
    if (!this.busListeners.has(edge.busId)) {
      this.busListeners.set(edge.busId, []);
    }
    this.busListeners.get(edge.busId)!.push(edge);
  }

  /**
   * Add an adjacency edge for cycle detection.
   */
  private addAdjacency(fromBlockId: string, toBlockId: string): void {
    if (!this.adjacency.has(fromBlockId)) {
      this.adjacency.set(fromBlockId, new Set());
    }
    this.adjacency.get(fromBlockId)!.add(toBlockId);
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get all blocks in the graph.
   */
  getBlocks(): BlockNode[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Get a block by ID.
   */
  getBlock(blockId: string): BlockNode | undefined {
    return this.blocks.get(blockId);
  }

  /**
   * Get incoming wire edges for a port.
   * Returns empty array if no incoming wires.
   */
  getIncomingWires(port: PortKey): WireEdge[] {
    return this.incomingWires.get(port) ?? [];
  }

  /**
   * Get outgoing wire edges for a port.
   * Returns empty array if no outgoing wires.
   */
  getOutgoingWires(port: PortKey): WireEdge[] {
    return this.outgoingWires.get(port) ?? [];
  }

  /**
   * Get incoming listener edges for a port (bus to port).
   * Returns empty array if no listeners.
   */
  getIncomingListeners(port: PortKey): ListenerEdge[] {
    return this.incomingListeners.get(port) ?? [];
  }

  /**
   * Get outgoing publisher edges for a port (port to bus).
   * Returns empty array if no publishers.
   */
  getOutgoingPublishers(port: PortKey): PublisherEdge[] {
    return this.outgoingPublishers.get(port) ?? [];
  }

  /**
   * Get all publishers for a bus, sorted by sortKey.
   * Returns empty array if bus has no publishers.
   */
  getBusPublishers(busId: string): PublisherEdge[] {
    return this.busPublishers.get(busId) ?? [];
  }

  /**
   * Get all listeners for a bus.
   * Returns empty array if bus has no listeners.
   */
  getBusListeners(busId: string): ListenerEdge[] {
    return this.busListeners.get(busId) ?? [];
  }

  /**
   * Get all incoming edges for a port (wires + listeners).
   */
  getAllIncomingEdges(port: PortKey): GraphEdge[] {
    return [
      ...this.getIncomingWires(port),
      ...this.getIncomingListeners(port),
    ];
  }

  /**
   * Get all outgoing edges for a port (wires + publishers).
   */
  getAllOutgoingEdges(port: PortKey): GraphEdge[] {
    return [
      ...this.getOutgoingWires(port),
      ...this.getOutgoingPublishers(port),
    ];
  }

  /**
   * Get downstream block IDs for a block (for cycle detection).
   */
  getDownstreamBlocks(blockId: string): string[] {
    const downstream = this.adjacency.get(blockId);
    return downstream ? Array.from(downstream) : [];
  }

  /**
   * Check if adding an edge from -> to would create a cycle.
   * Uses DFS to detect cycles in the adjacency graph.
   */
  wouldCreateCycle(fromBlockId: string, toBlockId: string): boolean {
    // Quick check: if adding the same edge twice
    if (this.adjacency.get(fromBlockId)?.has(toBlockId)) {
      return false; // Edge already exists, not a new cycle
    }

    // DFS from toBlockId to see if we can reach fromBlockId
    const visited = new Set<string>();
    const stack = [toBlockId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromBlockId) {
        return true; // Found a path back to fromBlockId - would create cycle
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const downstream = this.adjacency.get(current);
      if (downstream) {
        for (const next of downstream) {
          if (!visited.has(next)) {
            stack.push(next);
          }
        }
      }
    }

    return false;
  }

  /**
   * Detect all cycles in the graph using Tarjan's SCC algorithm.
   * Returns arrays of block IDs that form cycles.
   */
  detectCycles(): string[][] {
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let currentIndex = 0;

    const strongConnect = (blockId: string): void => {
      index.set(blockId, currentIndex);
      lowlink.set(blockId, currentIndex);
      currentIndex++;
      stack.push(blockId);
      onStack.add(blockId);

      const downstream = this.adjacency.get(blockId);
      if (downstream) {
        for (const nextId of downstream) {
          if (!index.has(nextId)) {
            strongConnect(nextId);
            lowlink.set(blockId, Math.min(lowlink.get(blockId)!, lowlink.get(nextId)!));
          } else if (onStack.has(nextId)) {
            lowlink.set(blockId, Math.min(lowlink.get(blockId)!, index.get(nextId)!));
          }
        }
      }

      if (lowlink.get(blockId) === index.get(blockId)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== blockId);

        // Only include SCCs with more than one node (actual cycles)
        if (scc.length > 1) {
          sccs.push(scc);
        }
      }
    };

    for (const blockId of this.blocks.keys()) {
      if (!index.has(blockId)) {
        strongConnect(blockId);
      }
    }

    return sccs;
  }

  /**
   * Get the total number of blocks.
   */
  getBlockCount(): number {
    return this.blocks.size;
  }

  /**
   * Check if a block exists.
   */
  hasBlock(blockId: string): boolean {
    return this.blocks.has(blockId);
  }
}
