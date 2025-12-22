/**
 * @file View State Store
 * @description Manages visual layout and UI-only state (Lanes, positions, focus).
 *
 * This store implements the "Layout as Projection" design, decoupling how a patch
 * is displayed from its semantic meaning.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/4-Layout-As-Projection.md
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { BlockId, LaneId, Lane } from '../types';
import { getLayoutById, DEFAULT_LAYOUT, mapLaneToLayout, PRESET_LAYOUTS } from '../laneLayouts';
import type { LaneLayout } from '../laneLayouts';
import type { RootStore } from './RootStore';
import { getBlockDefinition } from '../blocks';
import { SemanticGraph } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';

export interface ViewLayout {
  id: string;
  lanes: Lane[];
  currentLayoutId: string;
}

export interface ProjectionLayout {
  nodes: Map<BlockId, { x: number; y: number }>;
}

export class ViewStateStore {
  root: RootStore;

  /** Current lane layout ID */
  currentLayoutId: string = DEFAULT_LAYOUT.id;

  /** Lane definitions with block assignments */
  lanes: Lane[] = [];

  /** Active view id (lane vs projection) */
  activeViewId: string = 'lane';

  constructor(root: RootStore) {
    this.root = root;
    this.lanes = this.createLanesFromLayout(DEFAULT_LAYOUT);

    makeObservable(this, {
      lanes: observable,
      currentLayoutId: observable,
      currentLayout: computed,
      availableLayouts: computed,
      projectionLayout: computed,
      toggleLaneCollapsed: action,
      toggleLanePinned: action,
      renameLane: action,
      addLane: action,
      removeLane: action,
      moveBlockToLane: action,
      moveBlockToLaneAtIndex: action,
      reorderBlockInLane: action,
      switchLayout: action,
      resetLayout: action,
      assignBlockToLane: action,
      removeBlockFromLanes: action,
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // React to blocks being added/removed/replaced in PatchStore
    this.root.events.on('BlockAdded', (event) => {
      // If block is already assigned to a lane (e.g. by explicit UI action), skip
      if (this.findLaneForBlock(event.blockId)) return;

      // Otherwise, auto-place based on affinity
      const def = getBlockDefinition(event.blockType);
      if (def) {
        const targetLane = this.lanes.find(l => l.kind === def.laneKind) || this.lanes[0];
        if (targetLane) {
          this.assignBlockToLane(event.blockId, targetLane.id);
        }
      }
    });

    this.root.events.on('BlockRemoved', (event) => {
      this.removeBlockFromLanes(event.blockId);
    });

    this.root.events.on('BlockReplaced', (event) => {
      // Find lane of old block
      const lane = this.findLaneForBlock(event.oldBlockId);
      if (lane) {
        // Replace ID in place
        const index = lane.blockIds.indexOf(event.oldBlockId);
        if (index !== -1) {
          lane.blockIds[index] = event.newBlockId;
        }
      }
    });
    
    // Listen for PatchLoaded to sync lanes if provided
    // (Handled in RootStore.loadPatch explicitly for now, but could be reactive here)
  }

  private findLaneForBlock(blockId: string): Lane | undefined {
    return this.lanes.find(l => l.blockIds.includes(blockId));
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  /** Get current lane layout template */
  get currentLayout(): LaneLayout {
    return getLayoutById(this.currentLayoutId) ?? DEFAULT_LAYOUT;
  }

  /** Get all available layouts */
  get availableLayouts(): readonly LaneLayout[] {
    return PRESET_LAYOUTS;
  }

  /** Get projection layout derived from SemanticGraph */
  get projectionLayout(): ProjectionLayout {
    return computeProjectionLayout(this.root);
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private createLanesFromLayout(layout: LaneLayout): Lane[] {
    return layout.lanes.map((template) => ({
      id: template.id,
      kind: template.kind,
      label: template.label,
      description: template.description,
      flavor: template.flavor,
      flowStyle: template.flowStyle,
      blockIds: [],
      collapsed: false,
      pinned: false,
    }));
  }

  // =============================================================================
  // Actions - Lane Management
  // =============================================================================

  toggleLaneCollapsed(laneId: LaneId): void {
    const lane = this.lanes.find((l) => l.id === laneId);
    if (!lane) return;
    lane.collapsed = !lane.collapsed;
  }

  toggleLanePinned(laneId: LaneId): void {
    const lane = this.lanes.find((l) => l.id === laneId);
    if (!lane) return;
    lane.pinned = !lane.pinned;
  }

  renameLane(laneId: LaneId, newName: string): void {
    const lane = this.lanes.find((l) => l.id === laneId);
    if (!lane) return;
    lane.label = newName;
  }

  addLane(lane: Lane): void {
    this.lanes.push(lane);
  }

  removeLane(laneId: LaneId): void {
    const lane = this.lanes.find((l) => l.id === laneId);
    if (!lane || lane.pinned) return;

    // Move blocks to first available lane
    const firstLane = this.lanes.find((l) => l.id !== laneId);
    if (firstLane) {
      firstLane.blockIds.push(...lane.blockIds);
    }

    this.lanes = this.lanes.filter((l) => l.id !== laneId);
  }

  moveBlockToLane(blockId: BlockId, targetLaneId: LaneId): void {
    // Remove from all lanes
    for (const lane of this.lanes) {
      lane.blockIds = lane.blockIds.filter((id) => id !== blockId);
    }

    // Add to target lane
    const targetLane = this.lanes.find((l) => l.id === targetLaneId);
    if (targetLane) {
      targetLane.blockIds.push(blockId);
    }
  }

  moveBlockToLaneAtIndex(blockId: BlockId, targetLaneId: LaneId, index: number): void {
    // Remove from all lanes
    for (const lane of this.lanes) {
      lane.blockIds = lane.blockIds.filter((id) => id !== blockId);
    }

    // Add to target lane at specific index
    const targetLane = this.lanes.find((l) => l.id === targetLaneId);
    if (targetLane) {
      const newBlockIds = [...targetLane.blockIds];
      newBlockIds.splice(index, 0, blockId);
      targetLane.blockIds = newBlockIds;
    }
  }

  reorderBlockInLane(laneId: LaneId, blockId: BlockId, newIndex: number): void {
    const lane = this.lanes.find((l) => l.id === laneId);
    if (!lane) return;

    const oldIndex = lane.blockIds.indexOf(blockId);
    if (oldIndex === -1) return;

    lane.blockIds.splice(oldIndex, 1);
    lane.blockIds.splice(newIndex, 0, blockId);
  }

  // =============================================================================
  // Actions - Layout Management
  // =============================================================================

  switchLayout(layoutId: string): void {
    const newLayout = getLayoutById(layoutId);
    if (!newLayout || layoutId === this.currentLayoutId) return;

    const oldLayout = this.currentLayout;
    const blockAssignments: Array<{ blockId: BlockId; oldLaneId: string }> = [];
    
    for (const lane of this.lanes) {
      for (const blockId of lane.blockIds) {
        blockAssignments.push({ blockId, oldLaneId: lane.id });
      }
    }

    this.lanes = this.createLanesFromLayout(newLayout);
    this.currentLayoutId = layoutId;

    for (const { blockId, oldLaneId } of blockAssignments) {
      const newLaneId = mapLaneToLayout(oldLaneId, oldLayout, newLayout);
      const newLane = this.lanes.find((l) => l.id === newLaneId);
      if (newLane) {
        newLane.blockIds.push(blockId);
      } else {
        this.lanes[0]?.blockIds.push(blockId);
      }
    }
  }

  resetLayout(): void {
    for (const lane of this.lanes) {
      lane.blockIds = [];
    }
    // Repopulate from current blocks in patchStore
    const blocks = this.root.patchStore.blocks;
    for (const block of blocks) {
      // Logic to place block in default lane
      const defaultLane = this.lanes.find(l => l.kind === 'Program') || this.lanes[0];
      if (defaultLane) {
        defaultLane.blockIds.push(block.id);
      }
    }
  }

  assignBlockToLane(blockId: BlockId, laneId: LaneId): void {
    const lane = this.lanes.find(l => l.id === laneId);
    if (lane && !lane.blockIds.includes(blockId)) {
      lane.blockIds.push(blockId);
    }
  }

  removeBlockFromLanes(blockId: BlockId): void {
    for (const lane of this.lanes) {
      lane.blockIds = lane.blockIds.filter(id => id !== blockId);
    }
  }
}

function computeProjectionLayout(root: RootStore): ProjectionLayout {
  const doc = storeToPatchDocument(root);
  const graph = SemanticGraph.fromPatch(doc);
  const blocks = graph.getBlocks().map((b) => b.blockId);

  const indegree = new Map<string, number>();
  const layers = new Map<string, number>();
  for (const blockId of blocks) {
    indegree.set(blockId, 0);
  }

  for (const blockId of blocks) {
    for (const downstream of graph.getDownstreamBlocks(blockId)) {
      indegree.set(downstream, (indegree.get(downstream) ?? 0) + 1);
    }
  }

  const queue: string[] = blocks.filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const baseLayer = layers.get(current) ?? 0;
    for (const next of graph.getDownstreamBlocks(current)) {
      layers.set(next, Math.max(layers.get(next) ?? 0, baseLayer + 1));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  const buckets = new Map<number, string[]>();
  for (const blockId of blocks) {
    const layer = layers.get(blockId) ?? 0;
    const list = buckets.get(layer) ?? [];
    list.push(blockId);
    buckets.set(layer, list);
  }

  const nodes = new Map<BlockId, { x: number; y: number }>();
  for (const [layer, ids] of buckets.entries()) {
    const sorted = [...ids].sort();
    sorted.forEach((id, index) => {
      nodes.set(id, { x: layer * 280, y: index * 140 });
    });
  }

  return { nodes };
}
