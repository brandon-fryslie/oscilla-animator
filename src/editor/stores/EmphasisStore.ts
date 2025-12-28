/**
 * @file Emphasis Store
 * @description Manages focus and highlight state for blocks, buses, and ports.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md
 *
 * Controls visual emphasis (dimming, highlighting, glowing) based on user interaction.
 * Only one block or bus can be focused at a time.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { RootStore } from './RootStore';

/**
 * Emphasis mode determines what is highlighted and what is dimmed.
 */
export type EmphasisMode = 'none' | 'blockFocus' | 'busFocus' | 'hover';

/**
 * Port reference as string: "blockId:portId"
 */
export type PortRefString = string;

/**
 * Edge ID for connector highlighting: "fromBlockId:fromPortId->toBlockId:toPortId"
 */
export type EdgeId = string;

/**
 * Complete emphasis state driving visual feedback.
 */
export interface EmphasisState {
  mode: EmphasisMode;
  focusedBlockId: string | null;
  focusedBusId: string | null;
  highlightedBlockIds: Set<string>;
  highlightedPortRefs: Set<PortRefString>;
  connectorGlowEdges: Set<EdgeId>;
}

export class EmphasisStore {
  root: RootStore;

  /**
   * Current emphasis state.
   */
  emphasis: EmphasisState = {
    mode: 'none',
    focusedBlockId: null,
    focusedBusId: null,
    highlightedBlockIds: new Set(),
    highlightedPortRefs: new Set(),
    connectorGlowEdges: new Set(),
  };

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      emphasis: observable,
      mode: computed,
      focusedBlockId: computed,
      focusedBusId: computed,
      focusBlock: action,
      focusBus: action,
      hoverBlock: action,
      clearFocus: action,
      clearHover: action,
      clearAll: action,
    });
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  get mode(): EmphasisMode {
    return this.emphasis.mode;
  }

  get focusedBlockId(): string | null {
    return this.emphasis.focusedBlockId;
  }

  get focusedBusId(): string | null {
    return this.emphasis.focusedBusId;
  }

  // =============================================================================
  // Actions - Focus Management
  // =============================================================================

  /**
   * Focus a block.
   * Dims all unrelated blocks and highlights upstream/downstream dependencies.
   * Only one block can be focused at a time.
   */
  focusBlock(blockId: string): void {
    this.emphasis.mode = 'blockFocus';
    this.emphasis.focusedBlockId = blockId;
    this.emphasis.focusedBusId = null;

    // Compute highlighted blocks (upstream + downstream)
    const highlighted = this.computeRelatedBlocks(blockId);
    this.emphasis.highlightedBlockIds = new Set([blockId, ...highlighted]);

    // Compute highlighted ports and connectors
    const { ports, edges } = this.computeRelatedPortsAndEdges(blockId);
    this.emphasis.highlightedPortRefs = new Set(ports);
    this.emphasis.connectorGlowEdges = new Set(edges);
  }

  /**
   * Focus a bus.
   * Dims all unrelated blocks and highlights publishers/subscribers.
   */
  focusBus(busId: string): void {
    this.emphasis.mode = 'busFocus';
    this.emphasis.focusedBusId = busId;
    this.emphasis.focusedBlockId = null;

    // Compute blocks that interact with this bus
    const highlighted = this.computeBusRelatedBlocks(busId);
    this.emphasis.highlightedBlockIds = new Set(highlighted);

    // Compute ports involved with this bus
    const { ports, edges } = this.computeBusRelatedPortsAndEdges(busId);
    this.emphasis.highlightedPortRefs = new Set(ports);
    this.emphasis.connectorGlowEdges = new Set(edges);
  }

  /**
   * Hover a block (transient highlight).
   * Shows upstream/downstream connections without dimming.
   */
  hoverBlock(blockId: string): void {
    // Only apply hover if nothing is focused
    if (this.emphasis.mode !== 'none') return;

    this.emphasis.mode = 'hover';
    this.emphasis.focusedBlockId = blockId;

    const highlighted = this.computeRelatedBlocks(blockId);
    this.emphasis.highlightedBlockIds = new Set([blockId, ...highlighted]);

    const { ports, edges } = this.computeRelatedPortsAndEdges(blockId);
    this.emphasis.highlightedPortRefs = new Set(ports);
    this.emphasis.connectorGlowEdges = new Set(edges);
  }

  /**
   * Clear block/bus focus.
   */
  clearFocus(): void {
    this.emphasis.mode = 'none';
    this.emphasis.focusedBlockId = null;
    this.emphasis.focusedBusId = null;
    this.emphasis.highlightedBlockIds.clear();
    this.emphasis.highlightedPortRefs.clear();
    this.emphasis.connectorGlowEdges.clear();
  }

  /**
   * Clear hover state (transient).
   */
  clearHover(): void {
    if (this.emphasis.mode === 'hover') {
      this.clearFocus();
    }
  }

  /**
   * Clear all emphasis state.
   */
  clearAll(): void {
    this.clearFocus();
  }

  // =============================================================================
  // Helpers - Dependency Computation
  // =============================================================================

  /**
   * Compute blocks related to the given block (upstream + downstream).
   * Uses direct connections for now. Will integrate bus dependencies later.
   */
  private computeRelatedBlocks(blockId: string): string[] {
    const related = new Set<string>();

    // Upstream: blocks that feed into this block
    const connections = this.root.patchStore.connections;
    for (const conn of connections) {
      if (conn.to.blockId === blockId) {
        related.add(conn.from.blockId);
      }
    }

    // Downstream: blocks that this block feeds into
    for (const conn of connections) {
      if (conn.from.blockId === blockId) {
        related.add(conn.to.blockId);
      }
    }

    return Array.from(related);
  }

  /**
   * Compute ports and edges related to the given block.
   */
  private computeRelatedPortsAndEdges(blockId: string): {
    ports: PortRefString[];
    edges: EdgeId[];
  } {
    const ports: PortRefString[] = [];
    const edges: EdgeId[] = [];

    const connections = this.root.patchStore.connections;
    for (const conn of connections) {
      if (conn.from.blockId === blockId || conn.to.blockId === blockId) {
        ports.push(`${conn.from.blockId}:${conn.from.slotId}`);
        ports.push(`${conn.to.blockId}:${conn.to.slotId}`);
        edges.push(
          `${conn.from.blockId}:${conn.from.slotId}->${conn.to.blockId}:${conn.to.slotId}`
        );
      }
    }

    return { ports, edges };
  }

  /**
   * Compute blocks related to the given bus (publishers + subscribers).
   */
  private computeBusRelatedBlocks(busId: string): string[] {
    const related = new Set<string>();

    // Publishers
    const publishers = this.root.busStore.publishers.filter(p => p.busId === busId);
    for (const pub of publishers) {
      related.add(pub.from.blockId);
    }

    // Subscribers
    const listeners = this.root.busStore.listeners.filter(l => l.busId === busId);
    for (const listener of listeners) {
      related.add(listener.to.blockId);
    }

    return Array.from(related);
  }

  /**
   * Compute ports and edges related to the given bus.
   */
  private computeBusRelatedPortsAndEdges(busId: string): {
    ports: PortRefString[];
    edges: EdgeId[];
  } {
    const ports: PortRefString[] = [];
    const edges: EdgeId[] = [];

    // Publishers
    const publishers = this.root.busStore.publishers.filter(p => p.busId === busId);
    for (const pub of publishers) {
      ports.push(`${pub.from.blockId}:${pub.from.slotId}`);
    }

    // Subscribers
    const listeners = this.root.busStore.listeners.filter(l => l.busId === busId);
    for (const listener of listeners) {
      ports.push(`${listener.to.blockId}:${listener.to.slotId}`);
    }

    // No direct edges for bus bindings (visual representation different)

    return { ports, edges };
  }
}
