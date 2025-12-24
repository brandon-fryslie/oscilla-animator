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
  PortKey,
  WireEdge,
  PublisherEdge,
  ListenerEdge,
  GraphEdge,
  BlockNode,
} from './types';
import { portKeyToString, portKeyFromConnection, portKeyFromPublisher, portKeyFromListener } from './types';
import { SLOT_TYPE_TO_TYPE_DESC } from '../types';
import type { TypeDesc } from '../types';

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

  /** All incoming edges per port (wires + listeners) */
  private incomingEdges: Map<string, GraphEdge[]> = new Map();

  /** All outgoing edges per port (wires + publishers) */
  private outgoingEdges: Map<string, GraphEdge[]> = new Map();

  /** Publishers per bus (sorted by sortKey for deterministic ordering) */
  private busPublishers: Map<string, PublisherEdge[]> = new Map();

  /** Listeners per bus */
  private busListeners: Map<string, ListenerEdge[]> = new Map();

  /** Block adjacency for cycle detection (blockId -> downstream blockIds) */
  private adjacency: Map<string, Set<string>> = new Map();

  /** TypeDesc per port */
  private typeByPort: Map<string, TypeDesc> = new Map();

  /** Ports by block */
  private portsByBlock: Map<string, { inputs: string[]; outputs: string[] }> = new Map();

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
    this.incomingEdges.clear();
    this.outgoingEdges.clear();
    this.busPublishers.clear();
    this.busListeners.clear();
    this.adjacency.clear();
    this.typeByPort.clear();
    this.portsByBlock.clear();

    // Index blocks
    for (const block of patch.blocks) {
      this.blocks.set(block.id, {
        kind: 'block',
        blockId: block.id,
        blockType: block.type,
      });
      this.adjacency.set(block.id, new Set());
      this.portsByBlock.set(block.id, {
        inputs: block.inputs.map((input) => input.id),
        outputs: block.outputs.map((output) => output.id),
      });

      for (const input of block.inputs) {
        const desc = SLOT_TYPE_TO_TYPE_DESC[input.type as keyof typeof SLOT_TYPE_TO_TYPE_DESC];
        if (desc != null) {
          const key = portKeyToString({ blockId: block.id, slotId: input.id, direction: 'input' });
          this.typeByPort.set(key, desc);
        }
      }

      for (const output of block.outputs) {
        const desc = SLOT_TYPE_TO_TYPE_DESC[output.type as keyof typeof SLOT_TYPE_TO_TYPE_DESC];
        if (desc != null) {
          const key = portKeyToString({ blockId: block.id, slotId: output.id, direction: 'output' });
          this.typeByPort.set(key, desc);
        }
      }
    }

    // Index wire edges
    for (const conn of patch.connections) {
      const edge: WireEdge = {
        kind: 'wire',
        connectionId: conn.id,
        from: portKeyFromConnection(conn, 'from'),
        to: portKeyFromConnection(conn, 'to'),
      };

      this.addWireEdge(edge);

      // Update adjacency for cycle detection
      this.addAdjacency(conn.from.blockId, conn.to.blockId);
    }

    // Index publisher edges
    if (patch.publishers != null) {
      for (const pub of patch.publishers) {
        if (pub.enabled === false) continue; // Skip disabled publishers

        const edge: PublisherEdge = {
          kind: 'publisher',
          publisherId: pub.id,
          from: portKeyFromPublisher(pub),
          busId: pub.busId,
          sortKey: pub.sortKey,
        };

        this.addPublisherEdge(edge);
      }
    }

    // Index listener edges
    if (patch.listeners != null) {
      for (const listener of patch.listeners) {
        if (listener.enabled === false) continue; // Skip disabled listeners

        const edge: ListenerEdge = {
          kind: 'listener',
          listenerId: listener.id,
          busId: listener.busId,
          to: portKeyFromListener(listener),
        };

        this.addListenerEdge(edge);
      }
    }

    // Add bus dependency adjacency: publisher block -> listener block
    for (const [busId, listeners] of this.busListeners.entries()) {
      const publishers = this.busPublishers.get(busId) ?? [];
      for (const listener of listeners) {
        for (const publisher of publishers) {
          const fromId = publisher.from.blockId;
          const toId = listener.to.blockId;
          if (fromId !== toId) {
            this.addAdjacency(fromId, toId);
          }
        }
      }
    }

    // Sort bus publishers by sortKey for deterministic ordering
    for (const publishers of this.busPublishers.values()) {
      publishers.sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        return a.publisherId.localeCompare(b.publisherId);
      });
    }
  }

  // ===========================================================================
  // Incremental Update Methods
  // ===========================================================================

  /**
   * Add a wire edge to the indices.
   */
  private addWireEdge(edge: WireEdge): void {
    const fromKey = portKeyToString(edge.from);
    const toKey = portKeyToString(edge.to);

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

    if (!this.outgoingEdges.has(fromKey)) {
      this.outgoingEdges.set(fromKey, []);
    }
    this.outgoingEdges.get(fromKey)!.push(edge);

    if (!this.incomingEdges.has(toKey)) {
      this.incomingEdges.set(toKey, []);
    }
    this.incomingEdges.get(toKey)!.push(edge);
  }

  /**
   * Add a publisher edge to the indices.
   */
  private addPublisherEdge(edge: PublisherEdge): void {
    const fromKey = portKeyToString(edge.from);

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

    if (!this.outgoingEdges.has(fromKey)) {
      this.outgoingEdges.set(fromKey, []);
    }
    this.outgoingEdges.get(fromKey)!.push(edge);
  }

  /**
   * Add a listener edge to the indices.
   */
  private addListenerEdge(edge: ListenerEdge): void {
    const toKey = portKeyToString(edge.to);

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

    if (!this.incomingEdges.has(toKey)) {
      this.incomingEdges.set(toKey, []);
    }
    this.incomingEdges.get(toKey)!.push(edge);
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
    const key = portKeyToString(port);
    return this.incomingWires.get(key) ?? [];
  }

  /**
   * Get outgoing wire edges for a port.
   * Returns empty array if no outgoing wires.
   */
  getOutgoingWires(port: PortKey): WireEdge[] {
    const key = portKeyToString(port);
    return this.outgoingWires.get(key) ?? [];
  }

  /**
   * Get incoming listener edges for a port (bus to port).
   * Returns empty array if no listeners.
   */
  getIncomingListeners(port: PortKey): ListenerEdge[] {
    const key = portKeyToString(port);
    return this.incomingListeners.get(key) ?? [];
  }

  /**
   * Get outgoing publisher edges for a port (port to bus).
   * Returns empty array if no publishers.
   */
  getOutgoingPublishers(port: PortKey): PublisherEdge[] {
    const key = portKeyToString(port);
    return this.outgoingPublishers.get(key) ?? [];
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
    const key = portKeyToString(port);
    return this.incomingEdges.get(key) ?? [];
  }

  /**
   * Get all outgoing edges for a port (wires + publishers).
   */
  getAllOutgoingEdges(port: PortKey): GraphEdge[] {
    const key = portKeyToString(port);
    return this.outgoingEdges.get(key) ?? [];
  }

  /**
   * Get the TypeDesc for a port if known.
   */
  getTypeForPort(port: PortKey): TypeDesc | undefined {
    return this.typeByPort.get(portKeyToString(port));
  }

  /**
   * Get the input/output slot IDs for a block.
   */
  getPortsForBlock(blockId: string): { inputs: string[]; outputs: string[] } | undefined {
    return this.portsByBlock.get(blockId);
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
    if (this.adjacency.get(fromBlockId)?.has(toBlockId) === true) {
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
