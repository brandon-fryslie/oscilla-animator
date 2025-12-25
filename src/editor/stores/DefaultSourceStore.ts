/**
 * @file Default Source Store
 * @description Manages implicit default sources for block inputs and lens parameters.
 *
 * Default Sources provide fallback values for inputs when no wire or bus listener
 * is connected. They are:
 * - Created automatically when a block is added
 * - Kept in storage even when the input is driven (for restoration when disconnected)
 * - Removed when the block is deleted
 *
 * @see design-docs/10-Refactor-for-UI-prep/14-RemoveParams.md
 */
import { makeObservable, observable, action } from 'mobx';
import type { DefaultSourceState, TypeDesc, UIControlHint, Slot, BlockId, SlotWorld, SLOT_TYPE_TO_TYPE_DESC } from '../types';
import type { RootStore } from './RootStore';

/**
 * Map from SlotWorld to TypeDesc world.
 * Used when creating DefaultSourceState from Slot defaultSource.
 */
function slotWorldToTypeWorld(world: SlotWorld): 'signal' | 'field' | 'scalar' | 'config' {
  return world;
}

export class DefaultSourceStore {
  sources: Map<string, DefaultSourceState> = new Map();

  /**
   * Maps blockId -> Map of slotId -> defaultSource ID.
   * Used for efficient lookup and cleanup.
   */
  private blockSlotIndex: Map<string, Map<string, string>> = new Map();

  private root: RootStore | null = null;

  constructor() {
    makeObservable(this, {
      sources: observable,
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
   * Set the root store reference.
   * Called after RootStore is constructed to avoid circular dependency.
   */
  setRoot(root: RootStore): void {
    this.root = root;
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

    const created: DefaultSourceState = {
      id,
      type: spec.type,
      value: spec.value,
      uiHint: spec.uiHint,
      rangeHint: spec.rangeHint,
    };
    this.sources.set(id, created);
    return created;
  }

  /**
   * Update the value of an existing default source.
   */
  setDefaultValue(id: string, value: unknown): void {
    const existing = this.sources.get(id);
    if (existing === undefined) return;
    existing.value = value;
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
    if (!slotMap) return undefined;
    const dsId = slotMap.get(slotId);
    if (!dsId) return undefined;
    return this.sources.get(dsId);
  }

  /**
   * Update the value of a block input's default source.
   */
  setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
    const ds = this.getDefaultSourceForInput(blockId, slotId);
    if (!ds) return;
    ds.value = value;
  }

  /**
   * Create default sources for all inputs of a block that have defaultSource metadata.
   * Called when a block is added to the patch.
   *
   * @param blockId - The block's unique ID
   * @param inputs - The block's input slots
   * @param slotTypeToTypeDesc - Mapping from SlotType to TypeDesc
   */
  createDefaultSourcesForBlock(
    blockId: BlockId,
    inputs: readonly Slot[],
    slotTypeToTypeDesc: typeof SLOT_TYPE_TO_TYPE_DESC
  ): void {
    const slotMap = new Map<string, string>();

    for (const slot of inputs) {
      if (!slot.defaultSource) continue;

      // Generate opaque ID
      const dsId = this.root?.generateId('ds') ?? `ds-${Date.now()}-${Math.random()}`;

      // Derive TypeDesc from slot type and defaultSource world
      const baseTypeDesc = slotTypeToTypeDesc[slot.type];
      const typeDesc: TypeDesc = baseTypeDesc ?? {
        world: slotWorldToTypeWorld(slot.defaultSource.world),
        domain: 'number', // fallback
        category: 'core',
        busEligible: false,
      };

      const ds: DefaultSourceState = {
        id: dsId,
        type: typeDesc,
        value: slot.defaultSource.value,
        uiHint: slot.defaultSource.uiHint,
      };

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
    if (!slotMap) return;

    for (const dsId of slotMap.values()) {
      this.sources.delete(dsId);
    }
    this.blockSlotIndex.delete(blockId);
  }

  /**
   * Load default sources from serialized state.
   */
  load(defaultSources: DefaultSourceState[]): void {
    this.sources = new Map(defaultSources.map((source) => [source.id, source]));
    // Note: The blockSlotIndex must be rebuilt separately
    // by calling registerBlockSlotMapping for each block
    this.blockSlotIndex.clear();
  }

  /**
   * Register the mapping from block/slot to default source ID.
   * Used when loading a patch to rebuild the index.
   */
  registerBlockSlotMapping(blockId: BlockId, slotId: string, dsId: string): void {
    let slotMap = this.blockSlotIndex.get(blockId);
    if (!slotMap) {
      slotMap = new Map();
      this.blockSlotIndex.set(blockId, slotMap);
    }
    slotMap.set(slotId, dsId);
  }

  /**
   * Clear all default sources.
   */
  clear(): void {
    this.sources.clear();
    this.blockSlotIndex.clear();
  }
}
