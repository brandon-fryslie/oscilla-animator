/**
 * @file Patch Store
 * @description Manages the core patch data: blocks and connections.
 */
import { makeObservable, observable, action, computed } from 'mobx';
import type {
  Block,
  BlockId,
  BlockType,
  LensInstance,
  Edge,
  AdapterStep,
} from '../types';
import { getBlockDefinition } from '../blocks';
import { getBlockForm } from '../blocks/types';
import { getMacroKey, getMacroExpansion, type MacroExpansion } from '../macros';
import type { RootStore } from './RootStore';
import { mapConnections, copyCompatibleParams, type ReplacementResult } from '../replaceUtils';
import type { GraphCommitReason, GraphDiffSummary } from '../events/types';
import { Validator } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';
import { randomUUID } from "../crypto";
import { runTx } from '../transactions/TxBuilder';
import { extractLenses, extractAdapters, buildTransforms } from '../transforms/normalize';
import { normalize, type NormalizedGraph } from '../graph';

// =============================================================================
// Migration Helpers
// =============================================================================

/**
 * Migration helper: Upgrade old block params to new format.
 * Currently handles:
 * - Oscillator: rename 'frequency' -> 'freq'
 * - Add more migrations as needed
 */
function migrateBlockParams(blockType: BlockType, params: Record<string, unknown>): Record<string, unknown> {
  if (blockType === 'Oscillator') {
    // Oscillator renamed 'frequency' to 'freq'
    if ('frequency' in params && !('freq' in params)) {
      const migrated = { ...params };
      migrated.freq = params.frequency;
      delete migrated.frequency;
      console.log(`[PatchStore] Migrated Oscillator param: frequency -> freq`);
      return migrated;
    }
  }

  // No migration needed
  return params;
}

// =============================================================================
// PatchStore: Core Patch Data
// =============================================================================

/**
 * Core patch state: blocks, edges, metadata.
 * This is the source of truth for the editor.
 *
 * Sprint: Graph Normalization Layer (2026-01-03)
 * - Added getNormalizedGraph() for compiler integration
 * - Eager normalization with caching and invalidation
 */
export class PatchStore {
  // Reactive state
  blocks: Block[] = [];
  edges: Edge[] = [];
  metadata = { name: 'Untitled Patch', description: '' };

  /**
   * Stable patch ID.
   * Used by CompiledProgramIR and events.
   */
  patchId: string;

  /**
   * Patch revision counter.
   * Incremented on every structural change (block added, edge added, etc.).
   * Used to detect stale validation results.
   */
  patchRevision = 0;

  /**
   * Normalized graph cache.
   * Invalidated on any structural change (block/edge mutations).
   *
   * Sprint: Graph Normalization Layer (2026-01-03)
   */
  private normalizedCache: NormalizedGraph | null = null;

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    this.patchId = randomUUID(); // Generate a stable patch ID

    makeObservable(this, {
      blocks: observable,
      edges: observable,
      metadata: observable,
      patchId: observable,
      patchRevision: observable,
      addBlock: action,
      removeBlock: action,
      updateBlock: action,
      connect: action,
      disconnect: action,
      setMetadata: action,
      clearPatch: action,
      // Computed
      userBlocks: computed,
    });
  }

  /**
   * Increment patch revision counter.
   * Called after any structural change to the patch.
   */
  private incrementRevision() {
    this.patchRevision += 1;
  }

  /**
   * Invalidate the normalized graph cache.
   * Called after any structural change to the patch.
   *
   * Sprint: Graph Normalization Layer (2026-01-03)
   */
  private invalidateNormalizedCache() {
    this.normalizedCache = null;
  }

  // ===========================================================================
  // Computed Properties
  // ===========================================================================

  /**
   * User-created blocks (exclude hidden structural blocks).
   * Used by the editor to determine which blocks to render on the canvas.
   */
  get userBlocks(): Block[] {
    return this.blocks.filter((b) => {
      // Check block definition to see if it's hidden
      const def = getBlockDefinition(b.type);
      if (!def) return true; // Include if definition not found
      // For now, just include all blocks - isBlockHidden needs BlockDefinition
      // TODO: Refactor to use block role or tags
      return true;
    });
  }

  /**
   * Get the normalized graph (user + structural blocks/edges).
   * This is the compiler input.
   *
   * Eager normalization: Recomputes on every RawGraph mutation, cached until next edit.
   * Anchor-based IDs: Deterministic from structure, not creation order.
   *
   * Sprint: Graph Normalization Layer (2026-01-03)
   *
   * @returns NormalizedGraph with all structural artifacts materialized
   */
  getNormalizedGraph(): NormalizedGraph {
    if (this.normalizedCache === null) {
      // Filter to user-only blocks and edges for RawGraph
      // For now, we assume all current blocks/edges are user-created
      // (structural blocks from old system will be filtered out in future migration)
      const rawGraph = {
        blocks: this.blocks.filter(b => b.role.kind === 'user'),
        edges: this.edges.filter(e => e.role.kind === 'user'),
      };

      this.normalizedCache = normalize(rawGraph);
    }

    return this.normalizedCache;
  }

  // ===========================================================================
  // Block Management
  // ===========================================================================

  /**
   * Generate a unique block ID using UUID v4.
   */
  private generateBlockId(): string {
    return randomUUID();
  }

  /**
   * Generate a unique connection ID using UUID v4.
   */
  private generateConnectionId(): string {
    return randomUUID();
  }

  /**
   * Add a block to the patch (generic creation, does not track position).
   * Used by block library, toolbar, and macro expansion.
   *
   * IMPORTANT: This creates the basic block structure but does NOT set a position.
   * Callers are responsible for updating the block position after creation if needed.
   *
   * @param type - The block type (e.g., 'Oscillator')
   * @param params - Initial param values (merged with defaults)
   * @param label - Optional custom label (defaults to block definition's label)
   * @returns The new block's ID
   */
  addBlock(
    type: BlockType,
    params?: Record<string, unknown>,
    label?: string
  ): BlockId {
    return this._createBlock(type, params, label);
  }

  /**
   * Shared block creation logic used by addBlock and expandMacro.
   * All block creation should go through this method to ensure consistency.
   *
   * @param type - Block type
   * @param params - Initial params
   * @param label - Optional label override
   * @returns The created block's ID
   */
  private _createBlock(
    type: BlockType,
    params?: Record<string, unknown>,
    label?: string
  ): BlockId {
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
      position: { x: 0, y: 0 }, // Default position - caller should update if needed
      params: migratedParams,
      form: getBlockForm(definition),
      role: { kind: 'user' }, // User-created blocks get user role
    };

    // Use transaction system for undo/redo
    runTx(this.root, { label: `Add ${type}` }, tx => {
      tx.add('blocks', block);
    });

    // Create default sources for inputs with defaultSource metadata
    // NOTE: This currently doesn't use transactions (deferred to later migration)
    // Commenting out until SLOT_TYPE_TO_TYPE_DESC is available
    // this.root.defaultSourceStore.createDefaultSourcesForBlock(
    //   id,
    //   definition.inputs,
    //   SLOT_TYPE_TO_TYPE_DESC,
    //   migratedParams
    // );

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
   */
  expandMacro(expansion: MacroExpansion): BlockId {
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

      // Preflight validation - skip invalid connections but don't crash
      const canConnect = validator.canAddConnection(
        patchDoc,
        { blockId: fromId, slotId: conn.fromSlot, direction: 'output' },
        { blockId: toId, slotId: conn.toSlot, direction: 'input' }
      );

      if (!canConnect.ok) {
        console.warn(
          `[expandMacro] Skipping invalid connection: ${conn.fromRef}.${conn.fromSlot} -> ${conn.toRef}.${conn.toSlot}`,
          canConnect.errors
        );
        continue;
      }

      // Connection is valid - create it
      this.connect(fromId, conn.fromSlot, toId, conn.toSlot);
    }

    // Get first block type for event
    const firstBlockType = expansion.blocks[0]?.type ?? 'unknown';
    const createdBlockIds = Array.from(refToId.values());

    // Emit MacroExpanded event
    this.root.events.emit({
      type: 'MacroExpanded',
      macroType: firstBlockType,
      createdBlockIds,
    });

    // Return the first block ID as a handle
    return refToId.values().next().value ?? '';
  }

  /**
   * Remove a block and all connected edges.
   */
  removeBlock(id: BlockId): void {
    const block = this.blocks.find((b) => b.id === id);
    if (block == null) return;

    // Remove connected edges first
    const connectedEdges = this.edges.filter(
      (e) =>
        (e.from.kind === 'port' && e.from.blockId === id) ||
        (e.to.kind === 'port' && e.to.blockId === id)
    );

    // Use transaction system for undo/redo
    runTx(this.root, { label: `Remove ${block.type}` }, tx => {
      // Remove edges first
      connectedEdges.forEach(edge => tx.remove('edges', edge.id));
      // Then remove block
      tx.remove('blocks', id);
    });

    // Emit BlockRemoved event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BlockRemoved',
      blockId: id,
      blockType: block.type,
    });
  }

  /**
   * Update a block's position or params.
   * @param id - The block ID
   * @param updates - Partial block updates (position and/or params)
   */
  updateBlock(id: BlockId, updates: Partial<Block>): void {
    const block = this.blocks.find((b) => b.id === id);
    if (block == null) return;

    // Position updates don't trigger GraphCommitted (they're visual-only)
    const isPositionOnlyUpdate =
      updates.position !== undefined &&
      Object.keys(updates).length === 1;

    if (isPositionOnlyUpdate) {
      // Direct mutation for position (no transaction, no graph event)
      Object.assign(block, updates);

      // NOTE: BlockMoved event removed from EditorEvent union - commenting out
      // this.root.events.emit({
      //   type: 'BlockMoved',
      //   blockId: id,
      //   position: updates.position!,
      // });
    } else {
      // Use transaction system for param updates
      runTx(this.root, { label: `Update ${block.type}` }, tx => {
        tx.replace('blocks', id, { ...block, ...updates });
      });

      // NOTE: BlockParamsChanged event removed from EditorEvent union - commenting out
      // if (updates.params !== undefined) {
      //   this.root.events.emit({
      //     type: 'BlockParamsChanged',
      //     blockId: id,
      //     params: updates.params,
      //   });
      // }
    }
  }

  // ===========================================================================
  // Edge Management
  // ===========================================================================

  /**
   * Create an edge between two blocks.
   * Performs semantic validation before connecting.
   *
   * @param fromBlockId - Source block ID
   * @param fromSlotId - Source output slot
   * @param toBlockId - Target block ID
   * @param toSlotId - Target input slot
   * @param options - Optional settings
   */
  connect(
    fromBlockId: BlockId,
    fromSlotId: string,
    toBlockId: BlockId,
    toSlotId: string,
    options?: { suppressGraphCommitted?: boolean }
  ): void {
    // Prevent duplicate edges between the same ports
    const exists = this.edges.some(
      (e) =>
        e.from.blockId === fromBlockId &&
        e.from.slotId === fromSlotId &&
        e.to.blockId === toBlockId &&
        e.to.slotId === toSlotId
    );
    if (exists) return;


    // Preflight validation using Semantic Validator (warn-only, does not block)
    try {
      const patchDoc = storeToPatchDocument(this.root);
      const validator = new Validator(patchDoc, this.patchRevision);
      const validationResult = validator.canAddConnection(
        patchDoc,
        { blockId: fromBlockId, slotId: fromSlotId, direction: 'output' },
        { blockId: toBlockId, slotId: toSlotId, direction: 'input' }
      );

      if (!validationResult.ok) {
        const firstError = validationResult.errors[0];
        console.warn('[PatchStore] Preflight validation warning:', firstError?.message);
      }
    } catch (e) {
      console.warn('[PatchStore] Preflight validation error:', e);
    }

    const id = this.generateConnectionId();
    const edge: Edge = {
      id,
      from: { kind: 'port', blockId: fromBlockId, slotId: fromSlotId },
      to: { kind: 'port', blockId: toBlockId, slotId: toSlotId },
      enabled: true,
      role: { kind: 'user' }, // User-created edges get user role
    };

    // Conservative migration: check if this is an internal call
    if (options?.suppressGraphCommitted === true) {
      // Direct mutation for internal use (not yet migrated)
      this.edges.push(edge);

      // Emit WireAdded event
      this.root.events.emit({
        type: 'WireAdded',
        wireId: edge.id,
        from: edge.from,
        to: edge.to,
      });

      // No GraphCommitted (suppressed)
    } else {
      // Use transaction system for user-facing calls
      runTx(this.root, { label: 'Connect' }, tx => {
        tx.add('edges', edge);
      });

      // Emit WireAdded event (fine-grained event, coexists with GraphCommitted)
      this.root.events.emit({
        type: 'WireAdded',
        wireId: edge.id,
        from: edge.from,
        to: edge.to,
      });
    }
  }

  /**
   * Remove an edge by ID.
   *
   * @param edgeId - The ID of the edge to remove
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, use direct mutation (for internal use)
   */
  disconnect(edgeId: string, options?: { suppressGraphCommitted?: boolean }): void {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (edge == null) return;

    if (options?.suppressGraphCommitted === true) {
      // Direct mutation for internal use
      this.edges = this.edges.filter((e) => e.id !== edgeId);
      this.root.events.emit({
        type: 'WireRemoved',
        wireId: edge.id,
        from: edge.from,
        to: edge.to,
      });
    } else {
      // Use transaction system for user-facing calls
      runTx(this.root, { label: 'Disconnect' }, tx => {
        tx.remove('edges', edgeId);
      });
      this.root.events.emit({
        type: 'WireRemoved',
        wireId: edge.id,
        from: edge.from,
        to: edge.to,
      });
    }
  }

  /**
   * Replace an existing wire with a new one (same endpoints, different transforms).
   * Used by adapter insertion/removal logic.
   *
   * @param edgeId - The ID of the edge to replace
   * @param updates - Partial edge updates (transforms, enabled, etc.)
   */
  updateEdge(edgeId: string, updates: Partial<Edge>): void {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (edge == null) return;

    // Use transaction system for edge updates
    runTx(this.root, { label: 'Update Edge' }, tx => {
      tx.replace('edges', edgeId, { ...edge, ...updates });
    });

    // NOTE: WireTransformsChanged event removed from EditorEvent union - commenting out
    // if (updates.transforms !== undefined) {
    //   this.root.events.emit({
    //     type: 'WireTransformsChanged',
    //     wireId: edgeId,
    //     transforms: updates.transforms,
    //   });
    // }
  }

  // ===========================================================================
  // Lens Management (Adapters + Lenses)
  // ===========================================================================

  /**
   * Get the current adapter chain for an edge.
   * @returns Array of adapter steps, or empty array if none
   */
  getEdgeAdapters(edgeId: string): AdapterStep[] {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (edge == null) return [];
    return extractAdapters(edge.transforms ?? []) as AdapterStep[];
  }

  /**
   * Get the current lens stack for an edge.
   * @returns Array of lenses, or empty array if none
   */
  getEdgeLenses(edgeId: string): LensInstance[] {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (edge == null) return [];
    return extractLenses(edge.transforms ?? []) as LensInstance[];
  }

  /**
   * Update the lens stack for an edge.
   * Preserves existing adapters, only modifies lenses.
   *
   * @param edgeId - The edge ID
   * @param lenses - The new lens stack
   */
  setEdgeLenses(edgeId: string, lenses: LensInstance[]): void {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (edge == null) return;

    const adapters = extractAdapters(edge.transforms ?? []) as AdapterStep[];
    const newTransforms = buildTransforms(adapters, lenses);

    this.updateEdge(edgeId, { transforms: newTransforms });
  }

  /**
   * Update the adapter chain for an edge.
   * Preserves existing lenses, only modifies adapters.
   *
   * @param edgeId - The edge ID
   * @param adapters - The new adapter chain
   */
  setEdgeAdapters(edgeId: string, adapters: AdapterStep[]): void {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (edge == null) return;

    const lenses = extractLenses(edge.transforms ?? []) as LensInstance[];
    const newTransforms = buildTransforms(adapters, lenses);

    this.updateEdge(edgeId, { transforms: newTransforms });
  }

  // ===========================================================================
  // Patch-Level Operations
  // ===========================================================================

  /**
   * Clear all blocks and edges.
   */
  clearPatch(): void {
    // Use transaction system
    runTx(this.root, { label: 'Clear Patch' }, tx => {
      // Remove all edges first
      this.edges.forEach(edge => tx.remove('edges', edge.id));
      // Then remove all blocks
      this.blocks.forEach(block => tx.remove('blocks', block.id));
    });

    // Emit PatchCleared event
    this.root.events.emit({
      type: 'PatchCleared',
    });
  }

  /**
   * Set patch metadata (name, description).
   */
  setMetadata(metadata: { name?: string; description?: string }): void {
    if (metadata.name !== undefined) {
      this.metadata.name = metadata.name;
    }
    if (metadata.description !== undefined) {
      this.metadata.description = metadata.description;
    }

    // Metadata changes don't trigger GraphCommitted (no structural change)
  }

  // ===========================================================================
  // Block Replacement (Composite → Primitive, etc.)
  // ===========================================================================

  /**
   * Replace a block with a new block, preserving compatible connections and params.
   * Used for composite → primitive conversion, block type swaps, etc.
   *
   * @param oldBlockId - The ID of the block to replace
   * @param newBlockType - The type of the new block
   * @returns Result object with new block ID and mapping details
   */
  replaceBlock(oldBlockId: BlockId, newBlockType: BlockType): ReplacementResult {
    const oldBlock = this.blocks.find(b => b.id === oldBlockId);
    if (oldBlock == null) {
      throw new Error(`replaceBlock: Block ${oldBlockId} not found`);
    }

    const newBlockDef = getBlockDefinition(newBlockType);
    if (newBlockDef === undefined) {
      throw new Error(`replaceBlock: Block type "${newBlockType}" not found`);
    }

    // Map connections: determine which edges can be preserved
    const mapping = mapConnections(oldBlock, newBlockDef, this.edges);

    // Copy compatible params
    const newParams = copyCompatibleParams(
      oldBlock.params,
      newBlockDef
    );

    // Create new block at same position
    const newBlockId = this.generateBlockId();
    const newBlock: Block = {
      id: newBlockId,
      type: newBlockType,
      label: newBlockDef.label ?? newBlockType,
      position: oldBlock.position,
      params: newParams,
      form: getBlockForm(newBlockDef),
      role: { kind: 'user' }, // Replacement blocks are user blocks
    };

    // Track selection state
    const wasSelected = this.root.uiStore.uiState.selectedBlockId === oldBlockId;

    // Execute replacement in single transaction
    runTx(this.root, { label: `Replace ${oldBlock.type} with ${newBlockType}` }, tx => {
      // 1. Remove dropped edges
      mapping.dropped.forEach(conn => {
        const edge = this.edges.find(e => e.id === conn.connectionId);
        if (edge) tx.remove('edges', edge.id);
      });

      // 2. Remove old block
      tx.remove('blocks', oldBlockId);

      // 3. Add new block
      tx.add('blocks', newBlock);

      // 4. Add preserved edges with updated endpoints
      mapping.preserved.forEach(conn => {
        const edge: Edge = {
          id: this.generateConnectionId(),
          from: { kind: 'port', blockId: conn.fromBlockId === oldBlockId ? newBlockId : conn.fromBlockId, slotId: conn.fromSlot },
          to: { kind: 'port', blockId: conn.toBlockId === oldBlockId ? newBlockId : conn.toBlockId, slotId: conn.toSlot },
          enabled: true,
          role: { kind: 'user' },
        };
        tx.add('edges', edge);
      });
    });

    // Emit BlockReplaced event with required fields
    this.root.events.emit({
      type: 'BlockReplaced',
      oldBlockId,
      newBlockId,
      oldBlockType: oldBlock.type,
      newBlockType,
      preservedConnections: mapping.preserved.length,
      droppedConnections: mapping.dropped,
      wasSelected,
    });

    return {
      success: true,
      newBlockId,
      preservedConnections: mapping.preserved.length,
      droppedConnections: mapping.dropped,
    };
  }
}
