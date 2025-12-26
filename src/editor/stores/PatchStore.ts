/**
 * @file Patch Store
 * @description Manages the core patch data: blocks, connections, and lanes.
 */
import { makeObservable, observable, action } from 'mobx';
import type {
  Block,
  Connection,
  BlockId,
  LaneId,
  LaneKind,
  BlockSubcategory,
  BlockType,
  LensInstance,
} from '../types';
import { SLOT_TYPE_TO_TYPE_DESC } from '../types';
import { getBlockDefinition } from '../blocks';
import { getMacroKey, getMacroExpansion, type MacroExpansion } from '../macros';
import { listCompositeDefinitions } from '../composites';
import type { RootStore } from './RootStore';
import { mapConnections, copyCompatibleParams, type ReplacementResult } from '../replaceUtils';
import type { GraphCommitReason, GraphDiffSummary } from '../events/types';
import { Validator } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';
import { randomUUID } from "../crypto";

// =============================================================================
// Migration Helpers
// =============================================================================

/**
 * Migrate SVGPathSource target values from old format to new library ID format.
 * Old: 'logo', 'text', 'heart'
 * New: 'builtin:logo', 'builtin:text', 'builtin:heart'
 */
function migrateBlockParams(type: string, params: Record<string, unknown>): Record<string, unknown> {
  if (type === 'SVGPathSource' && params.target !== undefined) {
    const target = params.target;
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

  /**
   * Unique identifier for this patch.
   * Generated once when the patch is created, persisted across saves.
   */
  patchId: string = randomUUID();

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
      patchId: observable,
      patchRevision: observable,

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
      updateConnection: action,
      addLensToConnection: action,
      removeLensFromConnection: action,
      updateConnectionLens: action,
      setConnectionEnabled: action,
      updateBlockParams: action,
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
    this.patchId = newId ?? randomUUID();
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
  // ID Generation
  // =============================================================================

  generateBlockId(): BlockId {
    return this.root.generateId('block');
  }

  generateConnectionId(): string {
    return this.root.generateId('conn');
  }

  // =============================================================================
  // Actions - Block Management
  // =============================================================================

  /**
   * Internal block creation - the shared implementation for addBlock and expandMacro.
   * Does NOT check for macros (caller must handle that).
   * Does NOT emit GraphCommitted (caller emits one for the entire operation).
   *
   * @param type - Block type
   * @param params - Block parameters
   * @param laneKind - Optional lane kind to place block in
   * @param label - Optional label override
   * @returns The created block ID
   */
  private _createBlock(
    type: BlockType,
    params?: Record<string, unknown>,
    laneKind?: LaneKind,
    label?: string
  ): BlockId {
    const id = this.generateBlockId();
    const definition = getBlockDefinition(type);

    if (definition === undefined) {
      throw new Error(`Block type "${type}" not found in registry`);
    }

    // Merge params with defaults and migrate old values
    const rawParams = params ?? definition.defaultParams ?? {};
    const migratedParams = migrateBlockParams(type, rawParams);

    const block: Block = {
      id,
      type,
      label: label ?? definition.label ?? type,
      inputs: definition.inputs ?? [],
      outputs: definition.outputs ?? [],
      params: migratedParams,
      category: definition.subcategory ?? 'Other',
      description: definition.description ?? `${type} block`,
    };

    this.blocks.push(block);

    // Add to lane if specified
    if (laneKind !== undefined) {
      const lane = this.root.viewStore.lanes.find((l) => l.kind === laneKind);
      if (lane !== undefined) {
        lane.blockIds = [...lane.blockIds, id];
      }
    }

    // Create default sources for inputs with defaultSource metadata
    this.root.defaultSourceStore.createDefaultSourcesForBlock(
      id,
      block.inputs,
      SLOT_TYPE_TO_TYPE_DESC
    );

    // Process auto-bus connections for this block
    this.processAutoBusConnections(id, type);

    // Emit BlockAdded event
    this.root.events.emit({
      type: 'BlockAdded',
      blockId: id,
      blockType: type,
      laneId: '', // Legacy payload, unused by ViewStore now
    });

    return id;
  }

  /**
   * Process auto-bus connections for a block based on its definition.
   * This handles:
   * - Primitive blocks with autoBusSubscriptions/autoBusPublications
   * - Composite blocks with busSubscriptions/busPublications in their graph
   * - Input slots with defaultSource.defaultBus specified
   */
  private processAutoBusConnections(blockId: BlockId, blockType: string): void {
    const definition = getBlockDefinition(blockType);
    if (definition === undefined) {
      throw new Error(`Cannot process auto-bus connections: block type "${blockType}" not found in registry`);
    }

    // Check for primitive block auto-bus definitions
    if (definition.autoBusSubscriptions !== undefined) {
      for (const [inputPort, busName] of Object.entries(definition.autoBusSubscriptions)) {
        const bus = this.root.busStore.buses.find(b => b.name === busName);
        if (bus !== undefined) {
          this.root.busStore.addListener(bus.id, blockId, inputPort);
        }
      }
    }

    if (definition.autoBusPublications !== undefined) {
      for (const [outputPort, busName] of Object.entries(definition.autoBusPublications)) {
        const bus = this.root.busStore.buses.find(b => b.name === busName);
        if (bus !== undefined) {
          this.root.busStore.addPublisher(bus.id, blockId, outputPort);
        }
      }
    }

    // Check for input slots with defaultBus in their defaultSource
    if (definition.inputs !== undefined) {
      for (const inputSlot of definition.inputs) {
        if (inputSlot.defaultSource?.defaultBus !== undefined) {
          const busName = inputSlot.defaultSource.defaultBus;
          const bus = this.root.busStore.buses.find(b => b.name === busName);
          if (bus !== undefined) {
            this.root.busStore.addListener(bus.id, blockId, inputSlot.id);
          }
        }
      }
    }

    // Check for composite block bus definitions
    if (blockType.startsWith('composite:')) {
      const compositeId = blockType.slice('composite:'.length);
      const composites = listCompositeDefinitions();
      const compositeDef = composites.find(c => c.id === compositeId);

      if (compositeDef !== undefined && compositeDef.graph.busSubscriptions !== undefined) {
        for (const [inputPort, busName] of Object.entries(compositeDef.graph.busSubscriptions)) {
          const bus = this.root.busStore.buses.find(b => b.name === busName);
          if (bus !== undefined) {
            this.root.busStore.addListener(bus.id, blockId, inputPort);
          }
        }
      }

      if (compositeDef !== undefined && compositeDef.graph.busPublications !== undefined) {
        for (const [outputPort, busName] of Object.entries(compositeDef.graph.busPublications)) {
          const bus = this.root.busStore.buses.find(b => b.name === busName);
          if (bus !== undefined) {
            this.root.busStore.addPublisher(bus.id, blockId, outputPort);
          }
        }
      }
    }
  }

  /**
   * Add a block to the patch.
   */
  addBlock(type: BlockType, params?: Record<string, unknown>): BlockId {
    // Check if this is a macro that should expand
    const macroKey = getMacroKey(type, params);
    if (macroKey !== null && macroKey !== undefined && macroKey !== '') {
      const expansion = getMacroExpansion(macroKey);
      if (expansion !== null && expansion !== undefined) {
        return this.expandMacro(expansion);
      }
      // Macro has no expansion - crash immediately
      throw new Error(`Macro "${macroKey}" has no expansion registered in MACRO_REGISTRY`);
    }

    // Guard: Never add raw macro: blocks - they must always expand
    if (type.startsWith('macro:')) {
      throw new Error(`Cannot add macro block "${type}" directly. Macros must have an expansion in MACRO_REGISTRY.`);
    }

    // Use shared block creation logic
    const id = this._createBlock(type, params);

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
    if (macroKey !== null && macroKey !== undefined && macroKey !== '') {
      const expansion = getMacroExpansion(macroKey);
      if (expansion !== null && expansion !== undefined) {
        return this.expandMacro(expansion);
      }
      throw new Error(`Macro "${macroKey}" has no expansion registered in MACRO_REGISTRY`);
    }

    if (type.startsWith('macro:')) {
      throw new Error(`Cannot add macro block "${type}" directly. Macros must have an expansion in MACRO_REGISTRY.`);
    }

    const id = this.generateBlockId();
    const definition = getBlockDefinition(type);
    const laneObj = this.root.viewStore.lanes.find((l) => l.id === laneId);

    const rawParams = params ?? definition?.defaultParams ?? {};
    const migratedParams = migrateBlockParams(type, rawParams);

    const block: Block = {
      id,
      type,
      label: definition?.label ?? type,
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
      params: migratedParams,
      category: definition?.subcategory ?? this.inferSubcategory(laneObj?.kind ?? 'Program'),
      description: definition?.description ?? `${type} block`,
    };

    this.blocks.push(block);

    // Create default sources for inputs with defaultSource metadata
    this.root.defaultSourceStore.createDefaultSourcesForBlock(
      id,
      block.inputs,
      SLOT_TYPE_TO_TYPE_DESC
    );

    // Add to lane at specific index
    if (laneObj !== null && laneObj !== undefined) {
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

    // Create all blocks using shared _createBlock method
    // This ensures all automatic features work (defaultBus, autoBus, etc.)
    for (const macroBlock of expansion.blocks) {
      // Use shared block creation with lane placement and label override
      const id = this._createBlock(
        macroBlock.type,
        macroBlock.params,
        macroBlock.laneKind,
        macroBlock.label
      );
      refToId.set(macroBlock.ref, id);
    }

    // Create all connections
    for (const conn of expansion.connections) {
      const fromId = refToId.get(conn.fromRef);
      const toId = refToId.get(conn.toRef);
      if (fromId === undefined) {
        throw new Error(`Macro connection references unknown source block ref "${conn.fromRef}"`);
      }
      if (toId === undefined) {
        throw new Error(`Macro connection references unknown target block ref "${conn.toRef}"`);
      }
      const connection: Connection = {
        id: this.generateConnectionId(),
        from: { blockId: fromId, slotId: conn.fromSlot, direction: 'output' },
        to: { blockId: toId, slotId: conn.toSlot, direction: 'input' },
      };
      this.connections.push(connection);

      // Emit WireAdded event for this connection
      this.root.events.emit({
        type: 'WireAdded',
        wireId: connection.id,
        from: connection.from,
        to: connection.to,
      });
    }

    // Create bus publishers if defined
    if (expansion.publishers !== null && expansion.publishers !== undefined) {
      for (const pub of expansion.publishers) {
        const blockId = refToId.get(pub.fromRef);
        if (blockId === undefined) {
          throw new Error(`Macro publisher references unknown block ref "${pub.fromRef}"`);
        }

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === pub.busName);
        if (bus === null || bus === undefined) {
          throw new Error(`Macro publisher references unknown bus "${pub.busName}"`);
        }

        // Add publisher
        this.root.busStore.addPublisher(bus.id, blockId, pub.fromSlot);
      }
    }

    // Create bus listeners if defined
    if (expansion.listeners !== null && expansion.listeners !== undefined) {
      for (const lis of expansion.listeners) {
        const blockId = refToId.get(lis.toRef);
        if (blockId === undefined) {
          throw new Error(`Macro listener references unknown block ref "${lis.toRef}"`);
        }

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === lis.busName);
        if (bus === null || bus === undefined) {
          throw new Error(`Macro listener references unknown bus "${lis.busName}"`);
        }

        // Add listener with optional lens
        const lensDefinition = lis.lens !== undefined && lis.lens !== null
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
    const firstBlock = expansion.blocks[0];
    if (firstBlock != null) {
      const mappedId = refToId.get(firstBlock.ref);
      return mappedId ?? '';
    }
    return '';
  }

  /**
   * Map lane kind to block subcategory.
   */
  private inferSubcategory(kind: LaneKind): BlockSubcategory {
    const mapping: Record<LaneKind, BlockSubcategory> = {
      Scene: 'Sources',
      Phase: 'Time',
      Fields: 'Fields',
      Scalars: 'Math',
      Spec: 'Compose',
      Program: 'Compose',
      Output: 'Render',
    };
    return mapping[kind];
  }

  updateBlock(id: BlockId, updates: Partial<Block>): void {
    const block = this.blocks.find((b) => b.id === id);
    if (block === undefined || block === null) return;
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

    // Remove default sources for this block's inputs
    this.root.defaultSourceStore.removeDefaultSourcesForBlock(id);

    // Remove connections to/from this block (with cascade event emission)
    for (const conn of connectionsToRemove) {
      this.disconnect(conn.id, { suppressGraphCommitted: true });
    }

    // Remove from lanes
    for (const lane of this.root.viewStore.lanes) {
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
    if (options?.suppressGraphCommitted !== true) {
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
    if (oldBlock === undefined || oldBlock === null) {
      return {
        success: false,
        preservedConnections: 0,
        droppedConnections: [],
        error: `Block ${oldBlockId} not found`,
      };
    }

    const newDef = getBlockDefinition(newBlockType);
    if (newDef === undefined || newDef === null) {
      return {
        success: false,
        preservedConnections: 0,
        droppedConnections: [],
        error: `Block type ${newBlockType} not found`,
      };
    }

    // Find the lane for this block
    const lane = this.root.viewStore.lanes.find((l) => l.blockIds.includes(oldBlockId));
    if (lane === undefined || lane === null) {
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
      category: newDef.subcategory ?? 'Other',
      description: newDef.description,
    };

    // Add new block
    this.blocks.push(newBlock);

    // Create default sources for inputs with defaultSource metadata
    this.root.defaultSourceStore.createDefaultSourcesForBlock(
      newBlockId,
      newBlock.inputs,
      SLOT_TYPE_TO_TYPE_DESC
    );

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
      if (oldSlot !== undefined && oldSlot !== null) {
        const newSlot = newBlock.outputs.find((s) => s.type === oldSlot.type);
        if (newSlot !== undefined && newSlot !== null) {
          this.root.busStore.addPublisher(oldPub.busId, newBlockId, newSlot.id, oldPub.adapterChain);
        }
      }
    }

    // Handle bus listeners
    const oldListeners = this.root.busStore.listeners.filter((l) => l.to.blockId === oldBlockId);
    for (const oldLis of oldListeners) {
      // Try to find a compatible input slot on new block
      const oldSlot = oldBlock.inputs.find((s) => s.id === oldLis.to.slotId);
      if (oldSlot !== undefined && oldSlot !== null) {
        const newSlot = newBlock.inputs.find((s) => s.type === oldSlot.type);
        if (newSlot !== undefined && newSlot !== null) {
          this.root.busStore.addListener(
            oldLis.busId,
            newBlockId,
            newSlot.id,
            oldLis.adapterChain,
            oldLis.lensStack
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
    if (block !== null && block !== undefined) {
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
   * Disconnect everything connected to an input port (wires AND bus listeners).
   * Call this before connecting to ensure exclusive input.
   */
  disconnectInputPort(blockId: BlockId, slotId: string): void {
    // Remove any wire connections to this input
    const wiresToRemove = this.connections.filter(
      (c) => c.to.blockId === blockId && c.to.slotId === slotId
    );
    for (const wire of wiresToRemove) {
      this.disconnect(wire.id, { suppressGraphCommitted: true });
    }

    // Remove any bus listeners to this input
    const listenersToRemove = this.root.busStore.listeners.filter(
      (l) => l.to.blockId === blockId && l.to.slotId === slotId
    );
    for (const listener of listenersToRemove) {
      this.root.busStore.removeListener(listener.id);
    }
  }

  /**
   * Create a connection between two blocks (helper method).
   * Uses semantic Validator for preflight validation.
   * Automatically disconnects any existing connection to the target input.
   *
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

    // INVARIANT: An input can only have one source.
    // Disconnect any existing wire or bus listener before connecting.
    this.disconnectInputPort(toBlockId, toSlotId);

    // Preflight validation using Semantic Validator (warn-only, does not block)
    // The compiler will catch real errors during compilation.
    // This provides early warnings for invalid connections.
    try {
      const patchDoc = storeToPatchDocument(this.root);
      const validator = new Validator(patchDoc, this.patchRevision);
      const validationResult = validator.canAddConnection(
        patchDoc,
        { blockId: fromBlockId, slotId: fromSlotId, direction: 'output' },
        { blockId: toBlockId, slotId: toSlotId, direction: 'input' }
      );

      if (!validationResult.ok) {
        // Log warning but don't block - compiler will catch real errors
        const firstError = validationResult.errors[0];
        console.warn('[PatchStore] Preflight validation warning:', firstError?.message);
        // Continue with connection creation despite warning
      }
    } catch (e) {
      // Preflight validation should never crash the connection flow
      console.warn('[PatchStore] Preflight validation error:', e);
    }

    const id = this.generateConnectionId();

    const connection: Connection = {
      id,
      from: { blockId: fromBlockId, slotId: fromSlotId, direction: 'output' },
      to: { blockId: toBlockId, slotId: toSlotId, direction: 'input' },
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
    if (options?.suppressGraphCommitted !== true) {
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
    if (connection === null || connection === undefined) return;

    this.connections = this.connections.filter((c) => c.id !== connectionId);

    // Emit WireRemoved event AFTER removal
    this.root.events.emit({
      type: 'WireRemoved',
      wireId: connection.id,
      from: connection.from,
      to: connection.to,
    });

    // Emit GraphCommitted unless suppressed
    if (options?.suppressGraphCommitted !== true) {
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

  // ===========================================================================
  // Wire Lens Management
  // ===========================================================================

  /**
   * Update a connection's properties (lensStack, adapterChain, enabled).
   */
  updateConnection(
    connectionId: string,
    updates: Partial<Pick<Connection, 'lensStack' | 'adapterChain' | 'enabled'>>
  ): void {
    const index = this.connections.findIndex((c) => c.id === connectionId);
    if (index === -1) return;

    const connection = this.connections[index];
    const updated: Connection = {
      ...connection,
      ...updates,
    };

    this.connections[index] = updated;

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

  /**
   * Add a lens to a connection's lens stack.
   * @param connectionId - The connection to modify
   * @param lens - The lens instance to add
   * @param index - Optional position (default: end of stack)
   */
  addLensToConnection(connectionId: string, lens: LensInstance, index?: number): void {
    const connection = this.connections.find((c) => c.id === connectionId);
    if (!connection) return;

    const currentStack = connection.lensStack ?? [];
    const newStack = [...currentStack];

    if (index !== undefined && index >= 0 && index <= newStack.length) {
      newStack.splice(index, 0, lens);
    } else {
      newStack.push(lens);
    }

    // Update sortKeys to maintain order
    const sortedStack = newStack.map((l, i) => ({ ...l, sortKey: i }));

    this.updateConnection(connectionId, { lensStack: sortedStack });
  }

  /**
   * Remove a lens from a connection's lens stack.
   * @param connectionId - The connection to modify
   * @param index - The index of the lens to remove
   */
  removeLensFromConnection(connectionId: string, index: number): void {
    const connection = this.connections.find((c) => c.id === connectionId);
    if (!connection) return;

    const currentStack = connection.lensStack ?? [];
    if (index < 0 || index >= currentStack.length) return;

    const newStack = currentStack.filter((_, i) => i !== index);

    // Update sortKeys to maintain order
    const sortedStack = newStack.map((l, i) => ({ ...l, sortKey: i }));

    this.updateConnection(connectionId, {
      lensStack: sortedStack.length > 0 ? sortedStack : undefined,
    });
  }

  /**
   * Update a specific lens in a connection's lens stack.
   * @param connectionId - The connection to modify
   * @param index - The index of the lens to update
   * @param updates - The lens properties to update
   */
  updateConnectionLens(
    connectionId: string,
    index: number,
    updates: Partial<Pick<LensInstance, 'params' | 'enabled'>>
  ): void {
    const connection = this.connections.find((c) => c.id === connectionId);
    if (!connection) return;

    const currentStack = connection.lensStack ?? [];
    if (index < 0 || index >= currentStack.length) return;

    const newStack = currentStack.map((lens, i) =>
      i === index ? { ...lens, ...updates } : lens
    );

    this.updateConnection(connectionId, { lensStack: newStack });
  }

  /**
   * Enable or disable a connection.
   */
  setConnectionEnabled(connectionId: string, enabled: boolean): void {
    this.updateConnection(connectionId, { enabled });
  }
}
