/**
 * @file Default Source Store
 * @description Manages default source values for block inputs.
 *
 * Default Sources provide fallback values for inputs when no wire or bus listener
 * is connected. They are:
 * - Created automatically when a block is added
 * - Kept in storage even when the input is driven (for restoration when disconnected)
 * - Removed when the block is deleted
 *
 * Note: This store ONLY manages values. Structural blocks and edges are created
 * by GraphNormalizer. This separation ensures single source of truth for structure.
 *
 * @see design-docs/10-Refactor-for-UI-prep/14-RemoveParams.md
 */
import { makeObservable, observable, action, makeAutoObservable } from 'mobx';
import type { DefaultSourceState, TypeDesc, UIControlHint, Slot, BlockId, SLOT_TYPE_TO_TYPE_DESC } from '../types';

// =============================================================================
// DefaultSourceState Class (Observable)
// =============================================================================

/**
 * Observable DefaultSourceState class.
 *
 * This is the canonical way to create observable DefaultSourceState instances.
 * By using a class with makeAutoObservable in the constructor, we guarantee
 * that every instance is properly observable - mutations to .value are
 * automatically tracked by MobX reactions.
 *
 * Pattern: All DefaultSource creation goes through this class.
 */
export class ObservableDefaultSource implements DefaultSourceState {
  id: string;
  type: TypeDesc;
  value: unknown;
  uiHint?: UIControlHint;
  rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };

  constructor(init: {
    id: string;
    type: TypeDesc;
    value: unknown;
    uiHint?: UIControlHint;
    rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
  }) {
    this.id = init.id;
    this.type = init.type;
    this.value = init.value;
    this.uiHint = init.uiHint;
    this.rangeHint = init.rangeHint;

    // Make this instance observable - all property mutations are tracked
    makeAutoObservable(this);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if ID matches deterministic pattern for input defaults.
 * Pattern: ds:input:${blockId}:${slotId}
 */
function isDeterministicInputId(id: string): boolean {
  return /^ds:input:.+:.+$/.test(id);
}

export class DefaultSourceStore {
  // Store DefaultSourceState instances (which are self-observable via makeAutoObservable)
  // We use observable.shallow because the Map entries themselves are already observable
  sources: Map<string, DefaultSourceState> = new Map();

  /**
   * Maps blockId -> Map of slotId -> defaultSource ID.
   * Used for efficient lookup and cleanup.
   */
  private blockSlotIndex: Map<string, Map<string, string>> = new Map();

  // Revision counter to force updates even when structural equality checks might fail
  valueRevision = 0;

  constructor() {
    makeObservable(this, {
      // observable.shallow: track Map add/delete, but entries are self-observable
      sources: observable.shallow,
      valueRevision: observable,
      ensureDefaultSource: action,
      setDefaultValue: action,
      setDefaultValueForInput: action,
      createDefaultSourcesForBlock: action,
      removeDefaultSourcesForBlock: action,
      load: action,
      clear: action,
    });
  }

  /**
   * Ensure a default source exists with the given ID.
   * If it already exists, returns the existing one unchanged.
   */
  ensureDefaultSource(
    id: string,
    spec: { type: TypeDesc; value: unknown; uiHint?: UIControlHint; rangeHint?: DefaultSourceState['rangeHint'] }
  ): DefaultSourceState {
    const existing = this.sources.get(id);
    if (existing !== undefined) return existing;

    // ObservableDefaultSource class handles its own observability via makeAutoObservable
    const created = new ObservableDefaultSource({
      id,
      type: spec.type,
      value: spec.value,
      uiHint: spec.uiHint,
      rangeHint: spec.rangeHint,
    });
    this.sources.set(id, created);
    return created;
  }

  /**
   * Update the value of an existing default source.
   * Since ObservableDefaultSource objects are observable, this mutation triggers reactions.
   */
  setDefaultValue(id: string, value: unknown): void {
    const existing = this.sources.get(id);
    if (existing === undefined) return;
    existing.value = value;
    this.valueRevision++;
  }

  /**
   * Get a default source by ID.
   */
  getDefaultSource(id: string): DefaultSourceState | undefined {
    return this.sources.get(id);
  }

  /**
   * Get the default source for a block input.
   * Returns undefined if no default source exists for this input.
   */
  getDefaultSourceForInput(blockId: BlockId, slotId: string): DefaultSourceState | undefined {
    const slotMap = this.blockSlotIndex.get(blockId);
    if (slotMap === null || slotMap === undefined) return undefined;
    const dsId = slotMap.get(slotId);
    if (dsId === null || dsId === undefined || dsId === '') return undefined;
    return this.sources.get(dsId);
  }

  /**
   * Update the value of a block input's default source.
   */
  setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
    const ds = this.getDefaultSourceForInput(blockId, slotId);
    if (ds === null || ds === undefined) return;
    ds.value = value;
    this.valueRevision++;
  }

  /**
   * Create default sources for all inputs of a block that have defaultSource metadata.
   * Called when a block is added to the patch.
   *
   * Note: This only creates value storage. Structural blocks and edges are created
   * by GraphNormalizer.
   *
   * @param blockId - The block's unique ID
   * @param inputs - The block's input slots
   * @param _slotTypeToTypeDesc - Mapping from SlotType to TypeDesc (deprecated, unused)
   * @param params - Optional params to override default values (e.g., from macros)
   */
  createDefaultSourcesForBlock(
    blockId: BlockId,
    inputs: readonly Slot[],
    _slotTypeToTypeDesc: typeof SLOT_TYPE_TO_TYPE_DESC,
    params?: Record<string, unknown>
  ): void {
    const slotMap = new Map<string, string>();

    for (const slot of inputs) {
      if (slot.defaultSource === null || slot.defaultSource === undefined) continue;

      // Generate deterministic ID for input default: ds:input:${blockId}:${slotId}
      const dsId = `ds:input:${blockId}:${slot.id}`;

      // Slot.type is now a TypeDesc object directly
      const typeDesc = slot.type;

      // Use param value if provided (e.g., from macro), otherwise use slot default
      const value = params?.[slot.id] !== undefined ? params[slot.id] : slot.defaultSource.value;

      // Create DefaultSource for input
      const ds = new ObservableDefaultSource({
        id: dsId,
        type: typeDesc,
        value,
        uiHint: slot.defaultSource.uiHint,
      });

      this.sources.set(dsId, ds);
      slotMap.set(slot.id, dsId);
    }

    if (slotMap.size > 0) {
      this.blockSlotIndex.set(blockId, slotMap);
    }
  }

  /**
   * Remove all default sources associated with a block.
   * Called when a block is removed from the patch.
   */
  removeDefaultSourcesForBlock(blockId: BlockId): void {
    const slotMap = this.blockSlotIndex.get(blockId);
    if (slotMap === null || slotMap === undefined) return;

    for (const dsId of slotMap.values()) {
      this.sources.delete(dsId);
    }
    this.blockSlotIndex.delete(blockId);
  }

  /**
   * Load default sources from serialized state.
   * Implements backward compatibility: regenerates non-deterministic IDs.
   */
  load(defaultSources: DefaultSourceState[]): void {
    // Create DefaultSourceState instances from serialized state
    // Check for non-deterministic IDs and regenerate if needed
    const regeneratedSources = defaultSources.map((source) => {
      if (!isDeterministicInputId(source.id)) {
        // Old-style random ID detected - need to regenerate deterministically
        // We can't regenerate here without block context, so just load as-is
        // The regeneration will happen in RootStore.loadPatch when we have block context
        console.warn(`DefaultSource ${source.id} has non-deterministic ID - will be regenerated on next save`);
      }
      return new ObservableDefaultSource(source);
    });

    this.sources = new Map(regeneratedSources.map((source) => [source.id, source]));
    // Note: The blockSlotIndex must be rebuilt separately
    // by calling registerBlockSlotMapping for each block
    this.blockSlotIndex.clear();
  }

  /**
   * Register the mapping from block/slot to default source ID.
   * Used when loading a patch to rebuild the index.
   *
   * If the provided dsId is non-deterministic, this will regenerate it
   * deterministically and update the source map.
   */
  registerBlockSlotMapping(blockId: BlockId, slotId: string, dsId: string): void {
    let actualDsId = dsId;

    // Check if ID is non-deterministic and needs regeneration
    if (!isDeterministicInputId(dsId)) {
      const newDsId = `ds:input:${blockId}:${slotId}`;
      const oldSource = this.sources.get(dsId);

      if (oldSource !== undefined) {
        // Regenerate with deterministic ID, preserving value and metadata
        console.warn(`Regenerating non-deterministic ID ${dsId} -> ${newDsId}`);

        const newSource = new ObservableDefaultSource({
          id: newDsId,
          type: oldSource.type,
          value: oldSource.value,
          uiHint: oldSource.uiHint,
          rangeHint: oldSource.rangeHint,
        });

        // Replace old source with new one
        this.sources.delete(dsId);
        this.sources.set(newDsId, newSource);
        actualDsId = newDsId;
      }
    }

    let slotMap = this.blockSlotIndex.get(blockId);
    if (slotMap === null || slotMap === undefined) {
      slotMap = new Map();
      this.blockSlotIndex.set(blockId, slotMap);
    }
    slotMap.set(slotId, actualDsId);
  }

  /**
   * Clear all default sources.
   */
  clear(): void {
    this.sources.clear();
    this.blockSlotIndex.clear();
  }
}
