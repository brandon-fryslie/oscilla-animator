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
import { listCompositeDefinitions } from '../composites';
import type { RootStore } from './RootStore';
import { mapConnections, copyCompatibleParams, type ReplacementResult } from '../replaceUtils';
import type { GraphCommitReason, GraphDiffSummary } from '../events/types';

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

  /**
   * Unique identifier for this patch.
   * Generated once when the patch is created, persisted across saves.
   */
  patchId: string = crypto.randomUUID();

  /**
   * Monotonic revision number that increments on every committed graph edit.
   * Used for diagnostic state keying, staleness detection, and event correlation.
   *
   * Design: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md
   */
  patchRevision: number = 0;

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    makeObservable(this, {
      blocks: observable,
      connections: observable,
      lanes: observable,
      currentLayoutId: observable,
      patchId: observable,
      patchRevision: observable,

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
      moveBlockToLaneAtIndex: action,
      reorderBlockInLane: action,
      addBlockAtIndex: action,
      switchLayout: action,
      resetPatchId: action,
      incrementRevision: action,
    });
  }

  // =============================================================================
  // Patch Lifecycle
  // =============================================================================

  /**
   * Reset the patch ID (called when loading a new patch or clearing).
   */
  resetPatchId(newId?: string): void {
    this.patchId = newId ?? crypto.randomUUID();
    this.patchRevision = 0;
  }

  /**
   * Increment the patch revision (called after every graph mutation).
   * @returns The new revision number
   */
  incrementRevision(): number {
    this.patchRevision += 1;
    return this.patchRevision;
  }

  /**
   * Emit a GraphCommitted event with the given diff summary.
   * This is the single mutation boundary event that diagnostics use to recompute.
   *
   * @param reason - Why the graph changed
   * @param diff - Summary of what changed
   * @param affectedBlockIds - IDs of blocks affected (optional, best effort)
   * @param affectedBusIds - IDs of buses affected (optional, best effort)
   */
  emitGraphCommitted(
    reason: GraphCommitReason,
    diff: GraphDiffSummary,
    affectedBlockIds?: string[],
    affectedBusIds?: string[]
  ): void {
    const revision = this.incrementRevision();
    this.root.events.emit({
      type: 'GraphCommitted',
      patchId: this.patchId,
      patchRevision: revision,
      reason,
      diffSummary: diff,
      affectedBlockIds,
      affectedBusIds,
    });
  }

  /**
   * Helper to check if a block is a TimeRoot block.
   */
  private isTimeRootBlock(blockType: string): boolean {
    return (
      blockType === 'FiniteTimeRoot' ||
      blockType === 'CycleTimeRoot' ||
      blockType === 'InfiniteTimeRoot'
    );
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
   * Process auto-bus connections for a block based on its definition.
   * This handles both primitive blocks with autoBusSubscriptions/autoBusPublications
   * and composite blocks with busSubscriptions/busPublications in their graph.
   */
  private processAutoBusConnections(blockId: BlockId, blockType: string): void {
    const definition = getBlockDefinition(blockType);
    if (!definition) {
      throw new Error(`Cannot process auto-bus connections: block type "${blockType}" not found in registry`);
    }

    // Check for primitive block auto-bus definitions
    if (definition.autoBusSubscriptions) {
      for (const [inputPort, busName] of Object.entries(definition.autoBusSubscriptions)) {
        const bus = this.root.busStore.buses.find(b => b.name === busName);
        if (bus) {
          this.root.busStore.addListener(bus.id, blockId, inputPort);
        }
      }
    }

    if (definition.autoBusPublications) {
      for (const [outputPort, busName] of Object.entries(definition.autoBusPublications)) {
        const bus = this.root.busStore.buses.find(b => b.name === busName);
        if (bus) {
          this.root.busStore.addPublisher(bus.id, blockId, outputPort);
        }
      }
    }

    // Check for composite block bus definitions
    if (blockType.startsWith('composite:')) {
      const compositeId = blockType.slice('composite:'.length);
      const composites = listCompositeDefinitions();
      const compositeDef = composites.find(c => c.id === compositeId);

      if (compositeDef?.graph.busSubscriptions) {
        for (const [inputPort, busName] of Object.entries(compositeDef.graph.busSubscriptions)) {
          const bus = this.root.busStore.buses.find(b => b.name === busName);
          if (bus) {
            this.root.busStore.addListener(bus.id, blockId, inputPort);
          }
        }
      }

      if (compositeDef?.graph.busPublications) {
        for (const [outputPort, busName] of Object.entries(compositeDef.graph.busPublications)) {
          const bus = this.root.busStore.buses.find(b => b.name === busName);
          if (bus) {
            this.root.busStore.addPublisher(bus.id, blockId, outputPort);
          }
        }
      }
    }
  }

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
      // Macro has no expansion - crash immediately
      throw new Error(`Macro "${macroKey}" has no expansion registered in MACRO_REGISTRY`);
    }

    // Guard: Never add raw macro: blocks - they must always expand
    if (type.startsWith('macro:')) {
      throw new Error(`Cannot add macro block "${type}" directly. Macros must have an expansion in MACRO_REGISTRY.`);
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

    // Process auto-bus connections for this block
    this.processAutoBusConnections(id, type);

    // Emit BlockAdded event AFTER state changes committed
    this.root.events.emit({
      type: 'BlockAdded',
      blockId: id,
      blockType: type,
      laneId,
    });

    // Emit GraphCommitted for diagnostics
    this.emitGraphCommitted(
      'userEdit',
      {
        blocksAdded: 1,
        blocksRemoved: 0,
        busesAdded: 0,
        busesRemoved: 0,
        bindingsChanged: 0,
        timeRootChanged: this.isTimeRootBlock(type),
      },
      [id]
    );

    return id;
  }

  /**
   * Add a block at a specific index within a lane.
   * Used when dropping blocks at a precise position.
   */
  addBlockAtIndex(type: BlockType, laneId: LaneId, index: number, params?: Record<string, unknown>): BlockId {
    // Check if this is a macro that should expand
    const macroKey = getMacroKey(type, params);
    if (macroKey) {
      const expansion = getMacroExpansion(macroKey);
      if (expansion) {
        return this.expandMacro(expansion);
      }
      throw new Error(`Macro "${macroKey}" has no expansion registered in MACRO_REGISTRY`);
    }

    if (type.startsWith('macro:')) {
      throw new Error(`Cannot add macro block "${type}" directly. Macros must have an expansion in MACRO_REGISTRY.`);
    }

    const id = this.generateBlockId();
    const definition = getBlockDefinition(type);
    const laneObj = this.lanes.find((l) => l.id === laneId);

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

    // Add to lane at specific index
    if (laneObj) {
      const newBlockIds = [...laneObj.blockIds];
      newBlockIds.splice(index, 0, id);
      laneObj.blockIds = newBlockIds;
    }

    this.processAutoBusConnections(id, type);

    this.root.events.emit({
      type: 'BlockAdded',
      blockId: id,
      blockType: type,
      laneId,
    });

    this.emitGraphCommitted(
      'userEdit',
      {
        blocksAdded: 1,
        blocksRemoved: 0,
        busesAdded: 0,
        busesRemoved: 0,
        bindingsChanged: 0,
        timeRootChanged: this.isTimeRootBlock(type),
      },
      [id]
    );

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
      if (!lane) {
        throw new Error(`Macro block "${macroBlock.ref}" (${macroBlock.type}) references unknown lane kind "${macroBlock.laneKind}"`);
      }

      const id = this.generateBlockId();
      const definition = getBlockDefinition(macroBlock.type);
      if (!definition) {
        throw new Error(`Macro block "${macroBlock.ref}" references unknown block type "${macroBlock.type}"`);
      }

      const block: Block = {
        id,
        type: macroBlock.type,
        label: macroBlock.label ?? definition.label,
        inputs: definition.inputs ?? [],
        outputs: definition.outputs ?? [],
        params: { ...definition.defaultParams, ...(macroBlock.params ?? {}) },
        category: definition.category,
        description: definition.description,
      };

      this.blocks.push(block);
      lane.blockIds = [...lane.blockIds, id];
      refToId.set(macroBlock.ref, id);
    }

    // Create all connections (suppress GraphCommitted - we emit one at the end)
    for (const conn of expansion.connections) {
      const fromId = refToId.get(conn.fromRef);
      const toId = refToId.get(conn.toRef);
      if (!fromId) {
        throw new Error(`Macro connection references unknown source block ref "${conn.fromRef}"`);
      }
      if (!toId) {
        throw new Error(`Macro connection references unknown target block ref "${conn.toRef}"`);
      }
      this.connect(fromId, conn.fromSlot, toId, conn.toSlot, { suppressGraphCommitted: true });
    }

    // Process auto-bus connections for all blocks (handles both primitives and composites)
    for (const macroBlock of expansion.blocks) {
      const blockId = refToId.get(macroBlock.ref);
      if (!blockId) {
        throw new Error(`Macro auto-bus processing failed: ref "${macroBlock.ref}" not found`);
      }
      this.processAutoBusConnections(blockId, macroBlock.type);
    }

    // Create bus publishers if defined
    if (expansion.publishers) {
      for (const pub of expansion.publishers) {
        const blockId = refToId.get(pub.fromRef);
        if (!blockId) {
          throw new Error(`Macro publisher references unknown block ref "${pub.fromRef}"`);
        }

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === pub.busName);
        if (!bus) {
          throw new Error(`Macro publisher references unknown bus "${pub.busName}"`);
        }

        // Add publisher
        this.root.busStore.addPublisher(bus.id, blockId, pub.fromSlot);
      }
    }

    // Create bus listeners if defined
    if (expansion.listeners) {
      for (const lis of expansion.listeners) {
        const blockId = refToId.get(lis.toRef);
        if (!blockId) {
          throw new Error(`Macro listener references unknown block ref "${lis.toRef}"`);
        }

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === lis.busName);
        if (!bus) {
          throw new Error(`Macro listener references unknown bus "${lis.busName}"`);
        }

        // Add listener with optional lens
        const lensDefinition = lis.lens
          ? { type: lis.lens.type, params: lis.lens.params }
          : undefined;
        this.root.busStore.addListener(bus.id, blockId, lis.toSlot, undefined, lensDefinition);
      }
    }

    // Emit MacroExpanded event AFTER all state changes committed
    this.root.events.emit({
      type: 'MacroExpanded',
      macroType: expansion.blocks[0]?.type ?? 'unknown',
      createdBlockIds: Array.from(refToId.values()),
    });

    // Emit GraphCommitted for diagnostics
    const createdBlockIds = Array.from(refToId.values());
    const hasTimeRoot = expansion.blocks.some((b) => this.isTimeRootBlock(b.type));
    const publisherCount = expansion.publishers?.length ?? 0;
    const listenerCount = expansion.listeners?.length ?? 0;

    this.emitGraphCommitted(
      'macroExpand',
      {
        blocksAdded: createdBlockIds.length,
        blocksRemoved: 0,
        busesAdded: 0,
        busesRemoved: 0,
        bindingsChanged: publisherCount + listenerCount,
        timeRootChanged: hasTimeRoot,
      },
      createdBlockIds
    );

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

  /**
   * Remove a block from the patch.
   * @param id - The block ID to remove
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, don't emit GraphCommitted (used by replaceBlock)
   */
  removeBlock(id: BlockId, options?: { suppressGraphCommitted?: boolean }): void {
    // Capture block type before deletion (needed for event)
    const block = this.blocks.find((b) => b.id === id);
    const blockType = block?.type ?? 'unknown';
    const isTimeRoot = this.isTimeRootBlock(blockType);

    // Count connections and bindings being removed (for diff)
    const connectionsToRemove = this.connections.filter(
      (c) => c.from.blockId === id || c.to.blockId === id
    );
    const publishersRemoved = this.root.busStore.publishers.filter((p) => p.from.blockId === id).length;
    const listenersRemoved = this.root.busStore.listeners.filter((l) => l.to.blockId === id).length;

    // Remove block
    this.blocks = this.blocks.filter((b) => b.id !== id);

    // Remove connections to/from this block (with cascade event emission)
    for (const conn of connectionsToRemove) {
      this.disconnect(conn.id, { suppressGraphCommitted: true });
    }

    // Remove from lanes
    for (const lane of this.lanes) {
      lane.blockIds = lane.blockIds.filter((bid) => bid !== id);
    }

    // Remove publishers and listeners
    this.root.busStore.publishers = this.root.busStore.publishers.filter((p) => p.from.blockId !== id);
    this.root.busStore.listeners = this.root.busStore.listeners.filter((l) => l.to.blockId !== id);

    // Emit BlockRemoved event AFTER state changes committed
    this.root.events.emit({
      type: 'BlockRemoved',
      blockId: id,
      blockType,
    });

    // Emit GraphCommitted unless suppressed (used by replaceBlock)
    if (!options?.suppressGraphCommitted) {
      this.emitGraphCommitted(
        'userEdit',
        {
          blocksAdded: 0,
          blocksRemoved: 1,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: publishersRemoved + listenersRemoved + connectionsToRemove.length,
          timeRootChanged: isTimeRoot,
        },
        [id]
      );
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

    // Remap preserved connections (suppress GraphCommitted - we emit one at the end)
    for (const preserved of mapping.preserved) {
      const fromId = preserved.fromBlockId === oldBlockId ? newBlockId : preserved.fromBlockId;
      const toId = preserved.toBlockId === oldBlockId ? newBlockId : preserved.toBlockId;

      this.connect(fromId, preserved.fromSlot, toId, preserved.toSlot, { suppressGraphCommitted: true });
    }

    // Handle bus publishers
    const oldPublishers = this.root.busStore.publishers.filter((p) => p.from.blockId === oldBlockId);
    for (const oldPub of oldPublishers) {
      // Try to find a compatible output slot on new block
      const oldSlot = oldBlock.outputs.find((s) => s.id === oldPub.from.slotId);
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
      const oldSlot = oldBlock.inputs.find((s) => s.id === oldLis.to.slotId);
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

    // Emit BlockReplaced event BEFORE removing old block
    // This allows listeners to see the current selection state and update accordingly
    this.root.events.emit({
      type: 'BlockReplaced',
      oldBlockId,
      oldBlockType: oldBlock.type,
      newBlockId,
      newBlockType,
      preservedConnections: mapping.preserved.length,
      droppedConnections: mapping.dropped,
    });

    // Remove old block (this also removes its connections and bus routing)
    // Suppress GraphCommitted - we emit one at the end that represents the complete operation
    this.removeBlock(oldBlockId, { suppressGraphCommitted: true });

    // Emit GraphCommitted for the complete replacement operation
    const oldIsTimeRoot = this.isTimeRootBlock(oldBlock.type);
    const newIsTimeRoot = this.isTimeRootBlock(newBlockType);
    this.emitGraphCommitted(
      'userEdit',
      {
        blocksAdded: 1,
        blocksRemoved: 1,
        busesAdded: 0,
        busesRemoved: 0,
        bindingsChanged: mapping.preserved.length + mapping.dropped.length,
        timeRootChanged: oldIsTimeRoot || newIsTimeRoot,
      },
      [oldBlockId, newBlockId]
    );

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
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, don't emit GraphCommitted (used internally)
   */
  connect(
    fromBlockId: BlockId,
    fromSlotId: string,
    toBlockId: BlockId,
    toSlotId: string,
    options?: { suppressGraphCommitted?: boolean }
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

    // Emit WireAdded event AFTER connection created
    this.root.events.emit({
      type: 'WireAdded',
      wireId: connection.id,
      from: connection.from,
      to: connection.to,
    });

    // Emit GraphCommitted unless suppressed
    if (!options?.suppressGraphCommitted) {
      this.emitGraphCommitted(
        'userEdit',
        {
          blocksAdded: 0,
          blocksRemoved: 0,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: 1,
          timeRootChanged: false,
        },
        [fromBlockId, toBlockId]
      );
    }
  }

  /**
   * Remove a connection (helper method).
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, don't emit GraphCommitted (used internally)
   */
  disconnect(connectionId: string, options?: { suppressGraphCommitted?: boolean }): void {
    // Capture connection data BEFORE removal (for event)
    const connection = this.connections.find((c) => c.id === connectionId);
    if (!connection) return;

    this.connections = this.connections.filter((c) => c.id !== connectionId);

    // Emit WireRemoved event AFTER removal
    this.root.events.emit({
      type: 'WireRemoved',
      wireId: connection.id,
      from: connection.from,
      to: connection.to,
    });

    // Emit GraphCommitted unless suppressed
    if (!options?.suppressGraphCommitted) {
      this.emitGraphCommitted(
        'userEdit',
        {
          blocksAdded: 0,
          blocksRemoved: 0,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: 1,
          timeRootChanged: false,
        },
        [connection.from.blockId, connection.to.blockId]
      );
    }
  }

  /**
   * Remove a connection by ID.
   * Consolidated to use disconnect() for consistent event emission.
   */
  removeConnection(id: string): void {
    this.disconnect(id);
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
