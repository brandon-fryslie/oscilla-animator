/**
 * @file Patch Store
 * @description Manages the core patch data: blocks and connections.
 */
import { makeObservable, observable, action } from 'mobx';
import type {
  Block,
  Connection,
  BlockId,
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
import { Validator, isAssignable, getTypeDesc } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';
import { randomUUID } from "../crypto";
import { runTx } from '../transactions/TxBuilder';

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
   * @param label - Optional label override
   * @returns The created block ID
   */
  private _createBlock(
    type: BlockType,
    params?: Record<string, unknown>,
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

    // Create default sources for inputs with defaultSource metadata
    // Pass migratedParams so macro params override slot defaults
    this.root.defaultSourceStore.createDefaultSourcesForBlock(
      id,
      block.inputs,
      SLOT_TYPE_TO_TYPE_DESC,
      migratedParams
    );

    // Process auto-bus connections for this block (suppress GraphCommitted - caller emits one for entire operation)
    this.processAutoBusConnections(id, type, { suppressGraphCommitted: true });

    // Emit BlockAdded event
    this.root.events.emit({
      type: 'BlockAdded',
      blockId: id,
      blockType: type,
    });

    return id;
  }

  /**
   * Process auto-bus connections for a block based on its definition.
   * This handles:
   * - Primitive blocks with autoBusSubscriptions/autoBusPublications
   * - Composite blocks with busSubscriptions/busPublications in their graph
   * - Input slots with defaultSource.defaultBus specified
   *
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, suppress GraphCommitted events from internal bus operations
   */
  private processAutoBusConnections(
    blockId: BlockId,
    blockType: string,
    options?: { suppressGraphCommitted?: boolean }
  ): void {
    const definition = getBlockDefinition(blockType);
    if (definition === undefined) {
      throw new Error(`Cannot process auto-bus connections: block type "${blockType}" not found in registry`);
    }

    const busOptions = options?.suppressGraphCommitted === true ? { suppressGraphCommitted: true } : undefined;

    // Check for primitive block auto-bus definitions
    if (definition.autoBusSubscriptions !== undefined) {
      for (const [inputPort, busName] of Object.entries(definition.autoBusSubscriptions)) {
        const bus = this.root.busStore.buses.find(b => b.name === busName);
        if (bus !== undefined) {
          this.root.busStore.addListener(bus.id, blockId, inputPort, undefined, undefined, busOptions);
        }
      }
    }

    if (definition.autoBusPublications !== undefined) {
      for (const [outputPort, busName] of Object.entries(definition.autoBusPublications)) {
        const bus = this.root.busStore.buses.find(b => b.name === busName);
        if (bus !== undefined) {
          this.root.busStore.addPublisher(bus.id, blockId, outputPort, undefined, undefined, busOptions);
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
            this.root.busStore.addListener(bus.id, blockId, inputSlot.id, undefined, undefined, busOptions);
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
            this.root.busStore.addListener(bus.id, blockId, inputPort, undefined, undefined, busOptions);
          }
        }
      }

      if (compositeDef !== undefined && compositeDef.graph.busPublications !== undefined) {
        for (const [outputPort, busName] of Object.entries(compositeDef.graph.busPublications)) {
          const bus = this.root.busStore.buses.find(b => b.name === busName);
          if (bus !== undefined) {
            this.root.busStore.addPublisher(bus.id, blockId, outputPort, undefined, undefined, busOptions);
          }
        }
      }
    }
  }

  /**
   * Add a block to the patch.
   *
   * P0-1 MIGRATED: Now uses runTx() for undo/redo support.
   */
  addBlock(type: BlockType, params?: Record<string, unknown>): BlockId {
    // Check if this is a macro that should expand
    const macroKey = getMacroKey(type, params);
    if (macroKey !== null && macroKey !== undefined && macroKey !== '') {
      const expansion = getMacroExpansion(macroKey);
      if (expansion !== null && expansion !== undefined) {
        return this.expandMacro(expansion, macroKey);
      }
      // Macro has no expansion - crash immediately
      throw new Error(`Macro "${macroKey}" has no expansion registered in MACRO_REGISTRY`);
    }

    // Guard: Never add raw macro: blocks - they must always expand
    if (type.startsWith('macro:')) {
      throw new Error(`Cannot add macro block "${type}" directly. Macros must have an expansion in MACRO_REGISTRY.`);
    }

    // Generate block ID before transaction
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
      label: definition.label ?? type,
      inputs: definition.inputs ?? [],
      outputs: definition.outputs ?? [],
      params: migratedParams,
      category: definition.subcategory ?? 'Other',
      description: definition.description ?? `${type} block`,
    };

    // Use transaction system for undo/redo
    runTx(this.root, { label: `Add ${type}` }, tx => {
      tx.add('blocks', block);
    });

    // Create default sources for inputs with defaultSource metadata
    // NOTE: This currently doesn't use transactions (deferred to later migration)
    this.root.defaultSourceStore.createDefaultSourcesForBlock(
      id,
      block.inputs,
      SLOT_TYPE_TO_TYPE_DESC,
      migratedParams
    );

    // Process auto-bus connections for this block (suppress GraphCommitted - already emitted from runTx above)
    this.processAutoBusConnections(id, type, { suppressGraphCommitted: true });

    // Emit BlockAdded event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BlockAdded',
      blockId: id,
      blockType: type,
    });

    return id;
  }


  /**
   * Expand a macro into multiple blocks with connections.
   * Also creates bus publishers and listeners if defined in the macro.
   * @param expansion - The macro expansion definition
   * @param macroKey - The original macro key (e.g., 'macro:tutorial') for event emission
   */
  expandMacro(expansion: MacroExpansion, macroKey?: string): BlockId {
    // Clear the patch first - macros replace everything
    this.root.clearPatch();

    // Map from macro ref IDs to actual block IDs
    const refToId = new Map<string, BlockId>();

    // Create all blocks using shared _createBlock method
    // This ensures all automatic features work (defaultBus, autoBus, etc.)
    for (const macroBlock of expansion.blocks) {
      // Use shared block creation with label override
      const id = this._createBlock(
        macroBlock.type,
        macroBlock.params,
        macroBlock.label
      );
      refToId.set(macroBlock.ref, id);
    }

    // Create all connections (with validation - skip invalid ones)
    // Build a fresh patch document for validation after blocks are created
    const patchDoc = storeToPatchDocument(this.root);
    const validator = new Validator(patchDoc, this.patchRevision);

    for (const conn of expansion.connections) {
      const fromId = refToId.get(conn.fromRef);
      const toId = refToId.get(conn.toRef);
      if (fromId === undefined) {
        console.warn(`[expandMacro] Skipping connection: unknown source block ref "${conn.fromRef}"`);
        continue;
      }
      if (toId === undefined) {
        console.warn(`[expandMacro] Skipping connection: unknown target block ref "${conn.toRef}"`);
        continue;
      }

      // Validate this connection before adding it
      try {
        const validationResult = validator.canAddConnection(
          patchDoc,
          { blockId: fromId, slotId: conn.fromSlot, direction: 'output' },
          { blockId: toId, slotId: conn.toSlot, direction: 'input' }
        );

        if (!validationResult.ok) {
          // Skip invalid connections instead of creating broken wires
          const firstError = validationResult.errors[0];
          console.warn(
            `[expandMacro] Skipping invalid connection ${conn.fromRef}.${conn.fromSlot} → ${conn.toRef}.${conn.toSlot}: ${firstError?.message ?? 'unknown error'}`
          );
          continue;
        }
      } catch (e) {
        // If validation itself fails, skip the connection to be safe
        console.warn(`[expandMacro] Skipping connection due to validation error:`, e);
        continue;
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

    // Create bus publishers if defined (with validation - skip invalid ones)
    if (expansion.publishers !== null && expansion.publishers !== undefined) {
      for (const pub of expansion.publishers) {
        const blockId = refToId.get(pub.fromRef);
        if (blockId === undefined) {
          console.warn(`[expandMacro] Skipping publisher: unknown block ref "${pub.fromRef}"`);
          continue;
        }

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === pub.busName);
        if (bus === null || bus === undefined) {
          console.warn(`[expandMacro] Skipping publisher: unknown bus "${pub.busName}"`);
          continue;
        }

        // Validate type compatibility between source slot and bus
        const sourceBlock = this.blocks.find((b) => b.id === blockId);
        const sourceSlot = sourceBlock?.outputs.find((s) => s.id === pub.fromSlot);
        if (sourceBlock === undefined || sourceSlot === undefined) {
          console.warn(`[expandMacro] Skipping publisher: slot "${pub.fromSlot}" not found on block "${pub.fromRef}"`);
          continue;
        }

        // Get TypeDesc for the slot and check compatibility with bus type
        const slotTypeDesc = getTypeDesc(sourceSlot.type);
        if (slotTypeDesc !== undefined && bus.type !== undefined && !isAssignable(slotTypeDesc, bus.type)) {
          console.warn(
            `[expandMacro] Skipping incompatible bus publisher: ${pub.fromRef}.${pub.fromSlot} (${sourceSlot.type}) → bus "${pub.busName}" (${bus.type.world}:${bus.type.domain})`
          );
          continue;
        }

        // Add publisher
        this.root.busStore.addPublisher(bus.id, blockId, pub.fromSlot);
      }
    }

    // Create bus listeners if defined (with validation - skip invalid ones)
    if (expansion.listeners !== null && expansion.listeners !== undefined) {
      for (const lis of expansion.listeners) {
        const blockId = refToId.get(lis.toRef);
        if (blockId === undefined) {
          console.warn(`[expandMacro] Skipping listener: unknown block ref "${lis.toRef}"`);
          continue;
        }

        // Find the bus by name
        const bus = this.root.busStore.buses.find((b) => b.name === lis.busName);
        if (bus === null || bus === undefined) {
          console.warn(`[expandMacro] Skipping listener: unknown bus "${lis.busName}"`);
          continue;
        }

        // Validate type compatibility between bus and target slot
        const targetBlock = this.blocks.find((b) => b.id === blockId);
        const targetSlot = targetBlock?.inputs.find((s) => s.id === lis.toSlot);
        if (targetBlock === undefined || targetSlot === undefined) {
          console.warn(`[expandMacro] Skipping listener: slot "${lis.toSlot}" not found on block "${lis.toRef}"`);
          continue;
        }

        // Get TypeDesc for the slot and check compatibility with bus type
        const slotTypeDesc = getTypeDesc(targetSlot.type);
        if (slotTypeDesc !== undefined && bus.type !== undefined && !isAssignable(bus.type, slotTypeDesc)) {
          console.warn(
            `[expandMacro] Skipping incompatible bus listener: bus "${lis.busName}" (${bus.type.world}:${bus.type.domain}) → ${lis.toRef}.${lis.toSlot} (${targetSlot.type})`
          );
          continue;
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
      macroType: macroKey ?? expansion.blocks[0]?.type ?? 'unknown',
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
   * Update a block's properties.
   *
   * P0-3 MIGRATED: Now uses runTx() for undo/redo support.
   */
  updateBlock(id: BlockId, updates: Partial<Block>): void {
    runTx(this.root, { label: 'Update Block' }, tx => {
      const block = this.root.patchStore.blocks.find(b => b.id === id);
      if (block === undefined) return; // Silently ignore if block not found

      const next = { ...block, ...updates };
      tx.replace('blocks', id, next);
    });
  }

  /**
   * Remove a block from the patch.
   *
   * P0-2 MIGRATED: Now uses tx.removeBlockCascade() for undo/redo support.
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, suppress GraphCommitted event (for internal use)
   */
  removeBlock(id: BlockId, options?: { suppressGraphCommitted?: boolean }): void {
    // Capture block type before deletion (needed for event)
    const block = this.blocks.find((b) => b.id === id);
    const blockType = block?.type ?? 'unknown';

    // Capture connections involving this block BEFORE deletion (for WireRemoved events)
    const connectionsToRemove = this.connections.filter(
      (c) => c.from.blockId === id || c.to.blockId === id
    );

    runTx(this.root, { label: 'Remove Block', suppressGraphCommitted: options?.suppressGraphCommitted }, tx => {
      tx.removeBlockCascade(id);
    });

    // Emit WireRemoved events for each cascade-deleted connection
    for (const conn of connectionsToRemove) {
      this.root.events.emit({
        type: 'WireRemoved',
        wireId: conn.id,
        from: conn.from,
        to: conn.to,
      });
    }

    // Emit BlockRemoved event AFTER state changes committed
    this.root.events.emit({
      type: 'BlockRemoved',
      blockId: id,
      blockType,
    });
  }

  /**
   * Replace a block with a new block type, preserving connections where possible.
   *
   * NOTE: Phase 2 - suppressGraphCommitted pattern is still needed for replaceBlock().
   * This complex operation will be refactored in Phase 3 to use a single multi-step
   * transaction. For now, it uses the legacy dual-path mutation pattern.
   *
   * See: .agent_planning/undo-redo/PLAN-2025-12-27-phase2.md (P0-5: Deferred to Phase 3)
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

    // Map connections
    const mapping = mapConnections(oldBlock, newDef, this.connections);

    // Copy compatible parameters
    const newParams = copyCompatibleParams(oldBlock.params, newDef);

    // Create new block for replacement
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
    // Pass newParams so copied params override slot defaults
    this.root.defaultSourceStore.createDefaultSourcesForBlock(
      newBlockId,
      newBlock.inputs,
      SLOT_TYPE_TO_TYPE_DESC,
      newParams
    );

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
          this.root.busStore.addPublisher(oldPub.busId, newBlockId, newSlot.id, oldPub.adapterChain, oldPub.lensStack, { suppressGraphCommitted: true });
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
            oldLis.lensStack,
            { suppressGraphCommitted: true }
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
   *
   * P0-3 MIGRATED: Now uses runTx() for undo/redo support.
   */
  updateBlockParams(blockId: BlockId, params: Record<string, unknown>): void {
    runTx(this.root, { label: 'Update Params' }, tx => {
      const block = this.root.patchStore.blocks.find(b => b.id === blockId);
      if (block === undefined) return; // Silently ignore if block not found

      const next = { ...block, params: { ...block.params, ...params } };
      tx.replace('blocks', blockId, next);
    });
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

    // Remove any bus listeners to this input (suppress GraphCommitted for internal use)
    const listenersToRemove = this.root.busStore.listeners.filter(
      (l) => l.to.blockId === blockId && l.to.slotId === slotId
    );
    for (const listener of listenersToRemove) {
      this.root.busStore.removeListener(listener.id, { suppressGraphCommitted: true });
    }
  }

  /**
   * Create a connection between two blocks (helper method).
   * Uses semantic Validator for preflight validation.
   * Automatically disconnects any existing connection to the target input.
   *
   * Conservative migration: Uses runTx() for user-facing calls, but supports
   * suppressGraphCommitted for internal use by complex methods not yet migrated.
   *
   * NOTE: Phase 2 - suppressGraphCommitted option is still needed for replaceBlock().
   * This will be removed in Phase 3 when replaceBlock is refactored to use a proper
   * multi-step transaction.
   *
   * See: .agent_planning/undo-redo/PLAN-2025-12-27-phase2.md (P0-5: Deferred to Phase 3)
   *
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, use direct mutation (for internal use)
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

    // Conservative migration: check if this is an internal call
    if (options?.suppressGraphCommitted === true) {
      // Direct mutation for internal use (not yet migrated)
      this.connections.push(connection);

      // Emit WireAdded event
      this.root.events.emit({
        type: 'WireAdded',
        wireId: connection.id,
        from: connection.from,
        to: connection.to,
      });

      // No GraphCommitted (suppressed)
    } else {
      // Use transaction system for user-facing calls
      runTx(this.root, { label: 'Connect' }, tx => {
        tx.add('connections', connection);
      });

      // Emit WireAdded event (fine-grained event, coexists with GraphCommitted)
      this.root.events.emit({
        type: 'WireAdded',
        wireId: connection.id,
        from: connection.from,
        to: connection.to,
      });
    }
  }

  /**
   * Remove a connection (helper method).
   *
   * Conservative migration: Uses runTx() for user-facing calls, but supports
   * suppressGraphCommitted for internal use by complex methods not yet migrated.
   *
   * NOTE: Phase 2 - suppressGraphCommitted option is still needed for replaceBlock().
   * This will be removed in Phase 3 when replaceBlock is refactored to use a proper
   * multi-step transaction.
   *
   * See: .agent_planning/undo-redo/PLAN-2025-12-27-phase2.md (P0-5: Deferred to Phase 3)
   *
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, use direct mutation (for internal use)
   */
  disconnect(connectionId: string, options?: { suppressGraphCommitted?: boolean }): void {
    // Capture connection data BEFORE removal (for event)
    const connection = this.connections.find((c) => c.id === connectionId);
    if (connection === null || connection === undefined) return;

    // Conservative migration: check if this is an internal call
    if (options?.suppressGraphCommitted === true) {
      // Direct mutation for internal use (not yet migrated)
      this.connections = this.connections.filter((c) => c.id !== connectionId);

      // Emit WireRemoved event
      this.root.events.emit({
        type: 'WireRemoved',
        wireId: connection.id,
        from: connection.from,
        to: connection.to,
      });

      // No GraphCommitted (suppressed)
    } else {
      // Use transaction system for user-facing calls
      runTx(this.root, { label: 'Disconnect' }, tx => {
        tx.remove('connections', connectionId);
      });

      // Emit WireRemoved event (fine-grained event, coexists with GraphCommitted)
      this.root.events.emit({
        type: 'WireRemoved',
        wireId: connection.id,
        from: connection.from,
        to: connection.to,
      });
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
    if (connection === undefined) return;

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
    if (connection === undefined) return;

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
    if (connection === undefined) return;

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
