/**
 * @file Patch Store
 * @description Manages the core patch data: blocks, connections, and lanes.
 */
import { makeObservable, observable, action, computed } from 'mobx';
import type {
  Block,
  Connection,
  Lane,
  BlockId,
  LaneId,
  LaneKind,
  BlockCategory,
  BlockType,
} from '../types';
import { getLayoutById, PRESET_LAYOUTS, DEFAULT_LAYOUT, mapLaneToLayout } from '../laneLayouts';
import type { LaneLayout } from '../laneLayouts';
import { getBlockDefinition } from '../blocks';
import { getMacroKey, getMacroExpansion, type MacroExpansion } from '../macros';
import type { RootStore } from './RootStore';
import { mapConnections, copyCompatibleParams, type ReplacementResult } from '../replaceUtils';

// =============================================================================
// Migration Helpers
// =============================================================================

/**
 * Migrate SVGPathSource target values from old format to new library ID format.
 * Old: 'logo', 'text', 'heart'
 * New: 'builtin:logo', 'builtin:text', 'builtin:heart'
 */
function migrateBlockParams(type: string, params: Record<string, unknown>): Record<string, unknown> {
  if (type === 'SVGPathSource' && params.target) {
    const target = String(params.target);
    // Migrate old format to new
    if (target === 'logo') return { ...params, target: 'builtin:logo' };
    if (target === 'text') return { ...params, target: 'builtin:text' };
    if (target === 'heart') return { ...params, target: 'builtin:heart' };
  }
  return params;
}


export class PatchStore {
  blocks: Block[] = [];
  connections: Connection[] = [];

  /** Current lane layout ID */
  currentLayoutId: string = DEFAULT_LAYOUT.id;

  /** Lane definitions with block assignments */
  lanes: Lane[] = this.createLanesFromLayout(DEFAULT_LAYOUT);

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    makeObservable(this, {
      blocks: observable,
      connections: observable,
      lanes: observable,
      currentLayoutId: observable,

      // Computed
      currentLayout: computed,
      availableLayouts: computed,

      // Actions
      addBlock: action,
      expandMacro: action,
      updateBlock: action,
      removeBlock: action,
      replaceBlock: action,
      addConnection: action,
      connect: action,
      disconnect: action,
      removeConnection: action,
      updateBlockParams: action,
      toggleLaneCollapsed: action,
      toggleLanePinned: action,
      renameLane: action,
      addLane: action,
      removeLane: action,
      moveBlockToLane: action,
      reorderBlockInLane: action,
      switchLayout: action,
    });
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  /** Get current lane layout */
  get currentLayout(): LaneLayout {
    return getLayoutById(this.currentLayoutId) ?? DEFAULT_LAYOUT;
  }

  /** Get all available layouts */
  get availableLayouts(): readonly LaneLayout[] {
    return PRESET_LAYOUTS;
  }

  // =============================================================================
  // ID Generation
  // =============================================================================

  generateBlockId(): BlockId {
    return this.root.generateId('block') as BlockId;
  }

  generateConnectionId(): string {
    return this.root.generateId('conn');
  }

  // =============================================================================
  // Actions - Block Management
  // =============================================================================

  /**
   * Add a block to the patch.
   */
  addBlock(type: BlockType, laneId: LaneId, params?: Record<string, unknown>): BlockId {
    // Check if this is a macro that should expand
    const macroKey = getMacroKey(type, params);
    if (macroKey) {
      const expansion = getMacroExpansion(macroKey);
      if (expansion) {
        return this.expandMacro(expansion);
      }
    }

    // Regular block addition
    const id = this.generateBlockId();

    // Look up block definition from registry
    const definition = getBlockDefinition(type);

    // Find lane to infer category
    const laneObj = this.lanes.find((l) => l.id === laneId);

    // Merge params with defaults and migrate old values
    const rawParams = params ?? definition?.defaultParams ?? {};
    const migratedParams = migrateBlockParams(type, rawParams);

    const block: Block = {
      id,
      type,
      label: definition?.label ?? type,
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
      params: migratedParams,
      category: definition?.category ?? this.inferCategory(laneObj?.kind ?? 'Program'),
      description: definition?.description ?? `${type} block`,
    };

    this.blocks.push(block);

    // Add to lane - use array spread to ensure MobX detects the change
    if (laneObj) {
      laneObj.blockIds = [...laneObj.blockIds, id];
    }

    return id;
  }

  /**
   * Expand a macro into multiple blocks with connections.
   * Also creates bus publishers and listeners if defined in the macro.
   */
  expandMacro(expansion: MacroExpansion): BlockId {
    // Clear the patch first - macros replace everything
    this.root.clearPatch();

    // Map from macro ref IDs to actual block IDs
    const refToId = new Map<string, BlockId>();

    // Create all blocks
    for (const macroBlock of expansion.blocks) {
      // Find the appropriate lane for this block's kind
      const lane = this.lanes.find((l) => l.kind === macroBlock.laneKind);
      if (!lane) continue;

      const id = this.generateBlockId();
      const definition = getBlockDefinition(macroBlock.type);

      const block: Block = {
        id,
        type: macroBlock.type,
        label: macroBlock.label ?? definition?.label ?? macroBlock.type,
        inputs: definition?.inputs ?? [],
        outputs: definition?.outputs ?? [],
        params: { ...(definition?.defaultParams ?? {}), ...(macroBlock.params ?? {}) },
        category: definition?.category ?? this.inferCategory(lane.kind),
        description: definition?.description ?? `${macroBlock.type} block`,
      };

      this.blocks.push(block);
      lane.blockIds = [...lane.blockIds, id];
      refToId.set(macroBlock.ref, id);
    }

    // Create all connections
    for (const conn of expansion.connections) {
      const fromId = refToId.get(conn.fromRef);
      const toId = refToId.get(conn.toRef);
      if (fromId && toId) {
        this.connect(fromId, conn.fromSlot, toId, conn.toSlot);
      }
    }

    // Create bus publishers if defined
    if (expansion.publishers) {
      for (const pub of expansion.publishers) {
        const blockId = refToId.get(pub.fromRef);
        if (!blockId) continue;

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === pub.busName);
        if (!bus) {
          console.warn(`Macro publisher: bus "${pub.busName}" not found`);
          continue;
        }

        // Add publisher
        this.root.busStore.addPublisher(bus.id, blockId, pub.fromSlot);
      }
    }

    // Create bus listeners if defined
    if (expansion.listeners) {
      for (const lis of expansion.listeners) {
        const blockId = refToId.get(lis.toRef);
        if (!blockId) continue;

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === lis.busName);
        if (!bus) {
          console.warn(`Macro listener: bus "${lis.busName}" not found`);
          continue;
        }

        // Add listener with optional lens
        const lensDefinition = lis.lens
          ? { type: lis.lens.type, params: lis.lens.params }
          : undefined;
        this.root.busStore.addListener(bus.id, blockId, lis.toSlot, undefined, lensDefinition);
      }
    }

    // Return the first block ID (for selection purposes)
    const firstRef = expansion.blocks[0]?.ref;
    return firstRef ? refToId.get(firstRef) ?? '' : '';
  }

  /**
   * Map lane kind to block category.
   */
  private inferCategory(kind: LaneKind): BlockCategory {
    const mapping: Record<LaneKind, BlockCategory> = {
      Scene: 'Scene',
      Phase: 'Time',
      Fields: 'Fields',
      Scalars: 'Math',
      Spec: 'Compose',
      Program: 'Compose',
      Output: 'Render',
    };
    return mapping[kind];
  }

  /**
   * Create lanes from a layout template.
   */
  private createLanesFromLayout(layout: LaneLayout): Lane[] {
    return layout.lanes.map((template) => ({
      id: template.id,
      name: template.id, // Legacy compatibility
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

  updateBlock(id: BlockId, updates: Partial<Block>): void {
    const block = this.blocks.find((b) => b.id === id);
    if (!block) return;
    Object.assign(block, updates);
  }

  removeBlock(id: BlockId): void {
    // Remove block
    this.blocks = this.blocks.filter((b) => b.id !== id);

    // Remove connections to/from this block
    this.connections = this.connections.filter(
      (c) => c.from.blockId !== id && c.to.blockId !== id
    );

    // Remove from lanes
    for (const lane of this.lanes) {
      lane.blockIds = lane.blockIds.filter((bid) => bid !== id);
    }

    // Remove publishers and listeners
    this.root.busStore.publishers = this.root.busStore.publishers.filter((p) => p.from.blockId !== id);
    this.root.busStore.listeners = this.root.busStore.listeners.filter((l) => l.to.blockId !== id);

    // Deselect if selected
    if (this.root.uiStore.uiState.selectedBlockId === id) {
      this.root.uiStore.uiState.selectedBlockId = null;
    }
  }

  /**
   * Replace a block with a new block type, preserving connections where possible.
   */
  replaceBlock(oldBlockId: BlockId, newBlockType: BlockType): ReplacementResult {
    const oldBlock = this.blocks.find((b) => b.id === oldBlockId);
    if (!oldBlock) {
      return {
        success: false,
        preservedConnections: 0,
        droppedConnections: [],
        error: `Block ${oldBlockId} not found`,
      };
    }

    const newDef = getBlockDefinition(newBlockType);
    if (!newDef) {
      return {
        success: false,
        preservedConnections: 0,
        droppedConnections: [],
        error: `Block type ${newBlockType} not found`,
      };
    }

    // Find the lane for this block
    const lane = this.lanes.find((l) => l.blockIds.includes(oldBlockId));
    if (!lane) {
      return {
        success: false,
        preservedConnections: 0,
        droppedConnections: [],
        error: `Lane for block ${oldBlockId} not found`,
      };
    }

    // Map connections
    const mapping = mapConnections(oldBlock, newDef, this.connections);

    // Copy compatible parameters
    const newParams = copyCompatibleParams(oldBlock.params, newDef);

    // Create new block in the same lane
    const newBlockId = this.generateBlockId();
    const newBlock: Block = {
      id: newBlockId,
      type: newBlockType,
      label: newDef.label,
      inputs: newDef.inputs,
      outputs: newDef.outputs,
      params: newParams,
      category: newDef.category,
      description: newDef.description,
    };

    // Add new block
    this.blocks.push(newBlock);

    // Add to lane at the same position as old block
    const oldIndex = lane.blockIds.indexOf(oldBlockId);
    lane.blockIds = [...lane.blockIds];
    lane.blockIds.splice(oldIndex, 0, newBlockId);

    // Remap preserved connections
    for (const preserved of mapping.preserved) {
      const fromId = preserved.fromBlockId === oldBlockId ? newBlockId : preserved.fromBlockId;
      const toId = preserved.toBlockId === oldBlockId ? newBlockId : preserved.toBlockId;

      this.connect(fromId, preserved.fromSlot, toId, preserved.toSlot);
    }

    // Handle bus publishers
    const oldPublishers = this.root.busStore.publishers.filter((p) => p.from.blockId === oldBlockId);
    for (const oldPub of oldPublishers) {
      // Try to find a compatible output slot on new block
      const oldSlot = oldBlock.outputs.find((s) => s.id === oldPub.from.port);
      if (oldSlot) {
        const newSlot = newBlock.outputs.find((s) => s.type === oldSlot.type);
        if (newSlot) {
          this.root.busStore.addPublisher(oldPub.busId, newBlockId, newSlot.id, oldPub.adapterChain);
        }
      }
    }

    // Handle bus listeners
    const oldListeners = this.root.busStore.listeners.filter((l) => l.to.blockId === oldBlockId);
    for (const oldLis of oldListeners) {
      // Try to find a compatible input slot on new block
      const oldSlot = oldBlock.inputs.find((s) => s.id === oldLis.to.port);
      if (oldSlot) {
        const newSlot = newBlock.inputs.find((s) => s.type === oldSlot.type);
        if (newSlot) {
          this.root.busStore.addListener(
            oldLis.busId,
            newBlockId,
            newSlot.id,
            oldLis.adapterChain,
            oldLis.lens
          );
        }
      }
    }

    // Remove old block (this also removes its connections and bus routing)
    this.removeBlock(oldBlockId);

    // Update selection to new block
    if (this.root.uiStore.uiState.selectedBlockId === oldBlockId) {
      this.root.uiStore.selectBlock(newBlockId);
    }

    return {
      success: true,
      newBlockId,
      preservedConnections: mapping.preserved.length,
      droppedConnections: mapping.dropped,
    };
  }

  /**
   * Update block parameters.
   */
  updateBlockParams(blockId: BlockId, params: Record<string, unknown>): void {
    const block = this.blocks.find((b) => b.id === blockId);
    if (block) {
      // Use Object.assign to mutate in place for MobX reactivity
      Object.assign(block.params, params);
    }
  }

  // =============================================================================
  // Actions - Connection Management
  // =============================================================================

  addConnection(connection: Connection): void {
    this.connections.push(connection);
  }

  /**
   * Create a connection between two blocks (helper method).
   */
  connect(
    fromBlockId: BlockId,
    fromSlotId: string,
    toBlockId: BlockId,
    toSlotId: string
  ): void {
    // Prevent duplicate connections between the same ports
    const exists = this.connections.some(
      (c) =>
        c.from.blockId === fromBlockId &&
        c.from.slotId === fromSlotId &&
        c.to.blockId === toBlockId &&
        c.to.slotId === toSlotId
    );
    if (exists) return;

    const id = this.generateConnectionId();

    const connection: Connection = {
      id,
      from: { blockId: fromBlockId, slotId: fromSlotId },
      to: { blockId: toBlockId, slotId: toSlotId },
    };

    this.connections.push(connection);
  }

  /**
   * Remove a connection (helper method).
   */
  disconnect(connectionId: string): void {
    this.connections = this.connections.filter((c) => c.id !== connectionId);
  }

  removeConnection(id: string): void {
    this.connections = this.connections.filter((c) => c.id !== id);
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
    if (!lane || lane.pinned) return; // Don't remove pinned lanes

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

  reorderBlockInLane(laneId: LaneId, blockId: BlockId, newIndex: number): void {
    const lane = this.lanes.find((l) => l.id === laneId);
    if (!lane) return;

    const oldIndex = lane.blockIds.indexOf(blockId);
    if (oldIndex === -1) return;

    // Remove from old position
    lane.blockIds.splice(oldIndex, 1);

    // Insert at new position
    lane.blockIds.splice(newIndex, 0, blockId);
  }

  // =============================================================================
  // Actions - Layout Management
  // =============================================================================

  /**
   * Switch to a different lane layout.
   */
  switchLayout(layoutId: string): void {
    const newLayout = getLayoutById(layoutId);
    if (!newLayout || layoutId === this.currentLayoutId) return;

    const oldLayout = this.currentLayout;

    // Collect all blocks with their current lane assignments
    const blockAssignments: Array<{ blockId: BlockId; oldLaneId: string }> = [];
    for (const lane of this.lanes) {
      for (const blockId of lane.blockIds) {
        blockAssignments.push({ blockId, oldLaneId: lane.id });
      }
    }

    // Create new lanes from the new layout
    this.lanes = this.createLanesFromLayout(newLayout);
    this.currentLayoutId = layoutId;

    // Migrate blocks to new lanes
    for (const { blockId, oldLaneId } of blockAssignments) {
      const newLaneId = mapLaneToLayout(oldLaneId, oldLayout, newLayout);
      const newLane = this.lanes.find((l) => l.id === newLaneId);
      if (newLane) {
        newLane.blockIds.push(blockId);
      } else {
        // Fallback: put in first lane
        this.lanes[0]?.blockIds.push(blockId);
      }
    }
  }
}
