/**
 * Validation for default source attachments.
 *
 * This module validates that DefaultSourceAttachments are well-formed:
 * - Provider output types are compatible with target input types (Sprint 16)
 * - Provider block types are allowlisted (Sprint 17)
 * - Required buses exist (Sprint 17)
 * - No feedback cycles (Sprint 18 - future)
 *
 * Validation is performed during semantic validation and emits diagnostics
 * that appear in the diagnostic panel.
 */

import type { RootStore } from '../stores/RootStore';
import type { Diagnostic } from '../diagnostics/types';
import { createDiagnostic } from '../diagnostics/types';
import { getBlockDefinition } from '../blocks/registry';
import { areSlotTypesCompatible } from '../semantic';
import type { SlotType } from '../types';
import type { DefaultSourceAttachment } from './types';
import { DEFAULT_SOURCE_PROVIDER_BLOCKS } from './allowlist';

/**
 * Validate all default source attachments in the patch.
 *
 * Checks:
 * - Type compatibility: provider output type matches target input type (Sprint 16)
 * - Provider is in allowlist (Sprint 17)
 * - Required buses exist (Sprint 17)
 *
 * Future checks (Sprint 18):
 * - No feedback cycles
 *
 * @param rootStore - Root store containing patch state
 * @returns Array of diagnostic objects (errors/warnings)
 */
export function validateDefaultSourceAttachments(
  rootStore: RootStore
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // Default to revision 0 - will be updated when integrated into semantic validator
  const patchRevision = 0;

  // Skip validation if defaultSourceStore is unavailable (e.g., in tests with minimal mocks)
  // If there's no store, there are no attachments to validate
  if (!rootStore.defaultSourceStore) {
    return diagnostics;
  }

  // Get all attachments from store
  const attachments = Array.from(
    rootStore.defaultSourceStore.attachmentsByTarget.values()
  );

  for (const attachment of attachments) {
    // Validate type compatibility
    const typeErrors = validateTypeCompatibility(
      attachment,
      rootStore,
      patchRevision
    );
    diagnostics.push(...typeErrors);

    // Sprint 17: Validate provider is allowlisted
    const allowlistErrors = validateProviderAllowlisted(
      attachment,
      rootStore,
      patchRevision
    );
    diagnostics.push(...allowlistErrors);

    // Sprint 17: Validate required buses exist
    const busErrors = validateRequiredBusesExist(
      attachment,
      rootStore,
      patchRevision
    );
    diagnostics.push(...busErrors);
  }

  return diagnostics;
}

/**
 * Validate that provider output type is compatible with target input type.
 *
 * @param attachment - The attachment to validate
 * @param rootStore - Root store to look up block instances
 * @param patchRevision - Current patch revision for diagnostic metadata
 * @returns Array of diagnostics (empty if valid)
 */
function validateTypeCompatibility(
  attachment: DefaultSourceAttachment,
  rootStore: RootStore,
  patchRevision: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const { target, provider } = attachment;

  // Get target block instance to find its type
  const targetBlockInstance = rootStore.patchStore.blocks.find(
    (b) => b.id === target.blockId
  );
  if (!targetBlockInstance) {
    // Block instance doesn't exist - this is a different error, skip type check
    return diagnostics;
  }

  // Get target block definition and slot
  const targetBlockDef = getBlockDefinition(targetBlockInstance.type);
  if (!targetBlockDef) {
    // Block type doesn't exist in registry - skip type check
    return diagnostics;
  }

  const targetSlot = targetBlockDef.inputs?.find((s) => s.id === target.slotId);
  if (!targetSlot) {
    // Slot doesn't exist - skip type check
    return diagnostics;
  }

  // Get provider block definition and output slot
  const providerBlockDef = getBlockDefinition(provider.blockType);
  if (!providerBlockDef) {
    // Provider block type doesn't exist - skip type check (allowlist validation will catch this)
    return diagnostics;
  }

  const providerOutput = providerBlockDef.outputs?.find(
    (o) => o.id === provider.outputPortId
  );
  if (!providerOutput) {
    // Provider output doesn't exist - configuration error
    diagnostics.push(
      createDiagnostic({
        code: 'E_TYPE_MISMATCH',
        severity: 'error',
        domain: 'compile',
        primaryTarget: {
          kind: 'block',
          blockId: target.blockId,
        },
        title: 'Default source configuration error',
        message: `Default source provider "${provider.blockType}" does not have output port "${provider.outputPortId}". This is a configuration error in the provider specification.`,
        patchRevision,
      })
    );
    return diagnostics;
  }

  // Check semantic type compatibility
  const providerOutputType = providerOutput.type as SlotType;
  const targetInputType = targetSlot.type as SlotType;

  if (!areSlotTypesCompatible(providerOutputType, targetInputType)) {
    // Get friendly block name for error message
    const targetBlockName = targetBlockDef.label ?? targetBlockDef.type;
    const targetInputName = targetSlot.label ?? targetSlot.id;
    const providerLabel =
      DEFAULT_SOURCE_PROVIDER_BLOCKS.find(
        (spec) => spec.blockType === provider.blockType
      )?.label ?? provider.blockType;

    diagnostics.push(
      createDiagnostic({
        code: 'E_TYPE_MISMATCH',
        severity: 'error',
        domain: 'compile',
        primaryTarget: {
          kind: 'port',
          portRef: {
            blockId: target.blockId,
            slotId: target.slotId,
            direction: 'input',
          },
        },
        affectedTargets: [
          {
            kind: 'block',
            blockId: provider.providerId,
          },
        ],
        title: 'Default source type mismatch',
        message: `Default source provider "${providerLabel}" output type "${providerOutputType}" is incompatible with ${targetBlockName}.${targetInputName} type "${targetInputType}". Select a different provider or change the block configuration.`,
        payload: {
          kind: 'typeMismatch',
          expected: targetInputType,
          actual: providerOutputType,
        },
        patchRevision,
      })
    );
  }

  return diagnostics;
}

/**
 * Validate that provider block type is in the allowlist.
 *
 * Sprint 17: Only allowlisted blocks may be used as default source providers.
 *
 * @param attachment - The attachment to validate
 * @param rootStore - Root store to look up block instances
 * @param patchRevision - Current patch revision for diagnostic metadata
 * @returns Array of diagnostics (empty if valid)
 */
function validateProviderAllowlisted(
  attachment: DefaultSourceAttachment,
  rootStore: RootStore,
  patchRevision: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { target, provider } = attachment;

  // Check if provider blockType is in allowlist
  const isAllowed = DEFAULT_SOURCE_PROVIDER_BLOCKS.some(
    (spec) => spec.blockType === provider.blockType
  );

  if (!isAllowed) {
    // Get target block info for friendly error message
    const targetBlockInstance = rootStore.patchStore.blocks.find(
      (b) => b.id === target.blockId
    );
    const targetBlockDef = targetBlockInstance
      ? getBlockDefinition(targetBlockInstance.type)
      : null;
    const targetBlockName = targetBlockDef?.label ?? targetBlockDef?.type ?? target.blockId;
    const targetSlot = targetBlockDef?.inputs?.find((s) => s.id === target.slotId);
    const targetInputName = targetSlot?.label ?? targetSlot?.id ?? target.slotId;

    // Get list of allowed types for helpful error message
    const allowedTypes = DEFAULT_SOURCE_PROVIDER_BLOCKS.map(
      (spec) => spec.label ?? spec.blockType
    ).join(', ');

    diagnostics.push(
      createDiagnostic({
        code: 'E_INVALID_DEFAULT_SOURCE_PROVIDER',
        severity: 'error',
        domain: 'compile',
        primaryTarget: {
          kind: 'port',
          portRef: {
            blockId: target.blockId,
            slotId: target.slotId,
            direction: 'input',
          },
        },
        title: 'Provider block type not allowlisted',
        message: `Default provider for ${targetBlockName}.${targetInputName} uses block type '${provider.blockType}' which is not allowlisted. Allowed provider types: ${allowedTypes}`,
        patchRevision,
      })
    );
  }

  return diagnostics;
}

/**
 * Validate that all required buses exist in the patch.
 *
 * Sprint 17: Providers with busInputs require those buses to exist.
 * Per user directive: fail compilation with clear error if bus is missing.
 *
 * @param attachment - The attachment to validate
 * @param rootStore - Root store to look up buses
 * @param patchRevision - Current patch revision for diagnostic metadata
 * @returns Array of diagnostics (empty if valid)
 */
function validateRequiredBusesExist(
  attachment: DefaultSourceAttachment,
  rootStore: RootStore,
  patchRevision: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { target, provider } = attachment;

  // Get provider spec from allowlist
  const spec = DEFAULT_SOURCE_PROVIDER_BLOCKS.find(
    (s) => s.blockType === provider.blockType
  );

  if (!spec) {
    // Provider not in allowlist - allowlist validation will catch this
    return diagnostics;
  }

  // Check each required bus
  if (spec.busInputs) {
    for (const [inputId, busName] of Object.entries(spec.busInputs)) {
      // Look up bus by name
      const bus = rootStore.busStore.buses.find((b) => b.name === busName);

      if (!bus) {
        // Bus doesn't exist - emit error
        // Get target block info for friendly error message
        const targetBlockInstance = rootStore.patchStore.blocks.find(
          (b) => b.id === target.blockId
        );
        const targetBlockDef = targetBlockInstance
          ? getBlockDefinition(targetBlockInstance.type)
          : null;
        const targetBlockName = targetBlockDef?.label ?? targetBlockDef?.type ?? target.blockId;
        const targetSlot = targetBlockDef?.inputs?.find((s) => s.id === target.slotId);
        const targetInputName = targetSlot?.label ?? targetSlot?.id ?? target.slotId;

        const providerLabel = spec.label ?? provider.blockType;

        diagnostics.push(
          createDiagnostic({
            code: 'E_MISSING_REQUIRED_BUS',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              portRef: {
                blockId: target.blockId,
                slotId: target.slotId,
                direction: 'input',
              },
            },
            title: 'Required bus does not exist',
            message: `Default provider for ${targetBlockName}.${targetInputName} requires bus '${busName}' which does not exist. Create the bus or select a different provider.`,
            patchRevision,
            payload: {
              kind: 'generic',
              data: {
                providerType: provider.blockType,
                providerLabel,
                busName,
                inputId,
              },
            },
          })
        );
      }
    }
  }

  return diagnostics;
}
