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
import { makeObservable, observable, action, makeAutoObservable } from 'mobx';
import type { DefaultSourceState, TypeDesc, UIControlHint, Slot, BlockId, SlotWorld, SLOT_TYPE_TO_TYPE_DESC } from '../types';
import type { RootStore } from './RootStore';
import type { DefaultSourceAttachment } from '../defaultSources/types';
import { CONST_PROVIDER_MAPPING } from '../defaultSources/constProviders';
import { DEFAULT_SOURCE_PROVIDER_BLOCKS } from '../defaultSources/allowlist';
import { getBlockDefinition } from '../blocks/registry';

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
 * Map from SlotWorld to TypeDesc world.
 * Used when creating DefaultSource from Slot defaultSource.
 */
function slotWorldToTypeWorld(world: SlotWorld): 'signal' | 'field' | 'scalar' | 'config' {
  return world;
}

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

  /**
   * Maps target inputs to their provider attachments.
   * Key format: `${blockId}:${slotId}`
   *
   * Attachments define which hidden provider block (e.g., Const, Oscillator)
   * feeds a default value to an undriven input.
   */
  attachmentsByTarget: Map<string, DefaultSourceAttachment> = new Map();

  /**
   * Root store reference - used for attachment creation (Sprint 7+)
   */
  private root: RootStore | null = null;

  // Revision counter to force updates even when structural equality checks might fail
  valueRevision = 0;

  constructor() {
    makeObservable(this, {
      // observable.shallow: track Map add/delete, but entries are self-observable
      sources: observable.shallow,
      attachmentsByTarget: observable.shallow,
      valueRevision: observable,
      ensureDefaultSource: action,
      setDefaultValue: action,
      setDefaultValueForInput: action,
      createDefaultSourcesForBlock: action,
      removeDefaultSourcesForBlock: action,
      load: action,
      clear: action,
      getAttachmentForInput: action,
      setAttachmentForInput: action,
      removeAttachmentForInput: action,
      createDefaultAttachmentForSlot: action,
      createAttachmentWithProvider: action,
      rebuildAttachmentsFromBlocks: action,
    });
  }

  /**
   * Set the root store reference.
   * Called after RootStore is constructed to avoid circular dependency.
   * Used for attachment creation in Sprint 7+.
   */
  setRoot(root: RootStore): void {
    this.root = root;
  }

  /**
   * Get root store reference (used in Sprint 7+).
   */
  get rootStore(): RootStore | null {
    return this.root;
  }

  /**
   * Generate deterministic key for target input.
   * Format: `${blockId}:${slotId}`
   */
  private targetKey(blockId: string, slotId: string): string {
    return `${blockId}:${slotId}`;
  }

  /**
   * Get the attachment for a specific block input.
   * Returns undefined if no attachment exists for this input.
   */
  getAttachmentForInput(blockId: string, slotId: string): DefaultSourceAttachment | undefined {
    const key = this.targetKey(blockId, slotId);
    return this.attachmentsByTarget.get(key);
  }

  /**
   * Set or update the attachment for a specific block input.
   */
  setAttachmentForInput(blockId: string, slotId: string, attachment: DefaultSourceAttachment): void {
    const key = this.targetKey(blockId, slotId);
    this.attachmentsByTarget.set(key, attachment);
  }

  /**
   * Remove the attachment for a specific block input.
   */
  removeAttachmentForInput(blockId: string, slotId: string): void {
    const key = this.targetKey(blockId, slotId);
    this.attachmentsByTarget.delete(key);
  }

  /**
   * Create a default attachment for a slot with appropriate Const provider.
   *
   * Selects the Const provider block type based on the slot type and creates
   * a complete attachment with deterministic IDs.
   *
   * @param blockId - The target block ID
   * @param slotId - The target input slot ID
   * @param slotType - The slot type signature (e.g., 'Signal<float>')
   * @returns Complete DefaultSourceAttachment with Const provider
   */
  createDefaultAttachmentForSlot(blockId: string, slotId: string, slotType: string): DefaultSourceAttachment {
    // Generate deterministic provider ID
    const providerId = `dsprov:${blockId}:${slotId}`;

    // Select appropriate Const provider based on slot type
    const blockType = CONST_PROVIDER_MAPPING[slotType] ?? 'DSConstSignalFloat';

    if (CONST_PROVIDER_MAPPING[slotType] === undefined) {
      console.warn(`No const provider mapping for slot type '${slotType}', falling back to DSConstSignalFloat`);
    }

    // Create default source for provider's 'value' input
    const providerInputDefaultId = `ds:prov:${providerId}:value`;

    // Build attachment
    const attachment: DefaultSourceAttachment = {
      target: {
        blockId,
        slotId,
      },
      provider: {
        providerId,
        blockType,
        outputPortId: 'out',
        editableInputSourceIds: {
          value: providerInputDefaultId,
        },
      },
    };

    return attachment;
  }

  /**
   * Create an attachment with a specific provider type.
   *
   * Sprint 15: Allows creating attachments for any allowlisted provider (not just Const).
   * Used by UI to create attachments when user selects a provider type.
   *
   * @param blockId - The target block ID
   * @param slotId - The target input slot ID
   * @param providerBlockType - The provider block type (e.g., 'Oscillator', 'DSConstSignalFloat')
   * @param slotType - The target slot type (for type checking and default values)
   * @returns Complete DefaultSourceAttachment with specified provider
   */
  createAttachmentWithProvider(
    blockId: string,
    slotId: string,
    providerBlockType: string,
    slotType: string
  ): DefaultSourceAttachment {
    // Generate deterministic provider ID
    const providerId = `dsprov:${blockId}:${slotId}`;

    // Find provider spec from allowlist
    const providerSpec = DEFAULT_SOURCE_PROVIDER_BLOCKS.find(
      (spec) => spec.blockType === providerBlockType
    );

    if (providerSpec == null) {
      console.warn(
        `Provider block type '${providerBlockType}' not found in allowlist, falling back to Const provider`
      );
      return this.createDefaultAttachmentForSlot(blockId, slotId, slotType);
    }

    // Get provider block definition to access default values for editable inputs
    const providerDefinition = getBlockDefinition(providerBlockType);
    if (providerDefinition == null) {
      console.warn(
        `Provider block definition not found for '${providerBlockType}', falling back to Const provider`
      );
      return this.createDefaultAttachmentForSlot(blockId, slotId, slotType);
    }

    // Create default sources for all editable inputs
    const editableInputSourceIds: Record<string, string> = {};

    for (const inputId of providerSpec.editableInputs) {
      const inputSlot = providerDefinition.inputs.find((s) => s.id === inputId);
      if (inputSlot == null || inputSlot.defaultSource == null) {
        console.warn(
          `Provider '${providerBlockType}' input '${inputId}' not found or has no defaultSource, skipping`
        );
        continue;
      }

      // Generate deterministic ID for this provider input's default source
      const providerInputDefaultId = `ds:prov:${providerId}:${inputId}`;
      editableInputSourceIds[inputId] = providerInputDefaultId;

      // Create the DefaultSource for this provider input if it doesn't exist
      const existingSource = this.sources.get(providerInputDefaultId);
      if (existingSource == null) {
        // Derive TypeDesc from input slot
        const baseTypeDesc = inputSlot.type as unknown as TypeDesc;
        const typeDesc: TypeDesc =
          typeof baseTypeDesc === 'object' && 'world' in baseTypeDesc
            ? baseTypeDesc
            : ({
                world: slotWorldToTypeWorld(inputSlot.defaultSource.world ?? 'signal'),
                domain: 'float', // fallback
                category: 'core',
                busEligible: false,
              } as unknown as TypeDesc);

        const newSource = new ObservableDefaultSource({
          id: providerInputDefaultId,
          type: typeDesc,
          value: inputSlot.defaultSource.value,
          uiHint: inputSlot.defaultSource.uiHint,
        });

        this.sources.set(providerInputDefaultId, newSource);
      }
    }

    // Build attachment
    const attachment: DefaultSourceAttachment = {
      target: {
        blockId,
        slotId,
      },
      provider: {
        providerId,
        blockType: providerBlockType,
        outputPortId: providerSpec.outputPortId,
        editableInputSourceIds,
      },
    };

    return attachment;
  }

  /**
   * Rebuild attachments from existing blocks.
   *
   * Used for backward compatibility when loading old patches that don't have
   * defaultSourceAttachments field. Iterates through all blocks and creates
   * Const provider attachments for any inputs with defaultSource metadata.
   *
   * This preserves existing default values from the defaultSources map.
   */
  rebuildAttachmentsFromBlocks(): void {
    if (this.root == null) {
      console.warn('Cannot rebuild attachments: root store not set');
      return;
    }

    console.info('Rebuilding default source attachments from blocks (backward compatibility)');

    let attachmentsCreated = 0;

    for (const block of this.root.patchStore.blocks) {
      const definition = getBlockDefinition(block.type);
      if (definition == null) {
        continue;
      }

      // Check each input slot for defaultSource metadata
      for (const input of definition.inputs) {
        if (input.defaultSource == null) {
          continue;
        }

        // Create attachment with appropriate Const provider
        const attachment = this.createDefaultAttachmentForSlot(block.id, input.id, input.type);

        // Get existing default source value if it exists
        const existingSource = this.getDefaultSourceForInput(block.id, input.id);
        if (existingSource != null) {
          // Create provider input default with existing value
          const providerInputDefaultId = attachment.provider.editableInputSourceIds.value;
          const providerInputDefault = new ObservableDefaultSource({
            id: providerInputDefaultId,
            type: existingSource.type,
            value: existingSource.value,
            uiHint: existingSource.uiHint,
            rangeHint: existingSource.rangeHint,
          });

          this.sources.set(providerInputDefaultId, providerInputDefault);
        }

        // Store attachment
        this.setAttachmentForInput(block.id, input.id, attachment);
        attachmentsCreated++;
      }
    }

    console.info(`Rebuilt ${attachmentsCreated} default source attachments`);
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
   * Now also creates DefaultSourceAttachments with appropriate Const providers.
   *
   * @param blockId - The block's unique ID
   * @param inputs - The block's input slots
   * @param slotTypeToTypeDesc - Mapping from SlotType to TypeDesc
   * @param params - Optional params to override default values (e.g., from macros)
   */
  createDefaultSourcesForBlock(
    blockId: BlockId,
    inputs: readonly Slot[],
    slotTypeToTypeDesc: typeof SLOT_TYPE_TO_TYPE_DESC,
    params?: Record<string, unknown>
  ): void {
    const slotMap = new Map<string, string>();

    for (const slot of inputs) {
      if (slot.defaultSource === null || slot.defaultSource === undefined) continue;

      // Generate deterministic ID for input default: ds:input:${blockId}:${slotId}
      const dsId = `ds:input:${blockId}:${slot.id}`;

      // Derive TypeDesc from slot type and defaultSource world
      const baseTypeDesc = slotTypeToTypeDesc[slot.type];
      const typeDesc: TypeDesc = baseTypeDesc ?? ({
        world: slotWorldToTypeWorld(slot.defaultSource.world ?? 'signal'),
        domain: 'float', // fallback
        category: 'core',
        busEligible: false,
      } as unknown as TypeDesc);

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

      // Create DefaultSourceAttachment with Const provider
      const attachment = this.createDefaultAttachmentForSlot(blockId, slot.id, slot.type);

      // Create DefaultSource for provider's 'value' input
      const providerInputDefaultId = attachment.provider.editableInputSourceIds.value;
      const providerInputDefault = new ObservableDefaultSource({
        id: providerInputDefaultId,
        type: typeDesc,
        value,
        uiHint: slot.defaultSource.uiHint,
      });

      this.sources.set(providerInputDefaultId, providerInputDefault);

      // Store attachment
      this.setAttachmentForInput(blockId, slot.id, attachment);
    }

    if (slotMap.size > 0) {
      this.blockSlotIndex.set(blockId, slotMap);
    }
  }

  /**
   * Remove all default sources associated with a block.
   * Called when a block is removed from the patch.
   *
   * Now also removes associated attachments and provider input defaults.
   */
  removeDefaultSourcesForBlock(blockId: BlockId): void {
    const slotMap = this.blockSlotIndex.get(blockId);
    if (slotMap === null || slotMap === undefined) return;

    for (const [slotId, dsId] of slotMap.entries()) {
      // Remove input default source
      this.sources.delete(dsId);

      // Remove attachment and provider input defaults
      const attachment = this.getAttachmentForInput(blockId, slotId);
      if (attachment != null) {
        // Remove provider input defaults
        for (const providerInputDefaultId of Object.values(attachment.provider.editableInputSourceIds)) {
          this.sources.delete(providerInputDefaultId);
        }

        // Remove attachment
        this.removeAttachmentForInput(blockId, slotId);
      }
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
   * Clear all default sources and attachments.
   */
  clear(): void {
    this.sources.clear();
    this.blockSlotIndex.clear();
    this.attachmentsByTarget.clear();
  }
}
