/**
 * Validation for default source attachments.
 *
 * This module validates that DefaultSourceAttachments are well-formed:
 * - Provider output types are compatible with target input types
 * - Provider block types are allowlisted (Sprint 17)
 * - Required buses exist (Sprint 17)
 * - No feedback cycles (Sprint 18)
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
 * - Type compatibility: provider output type matches target input type
 *
 * Future checks (Sprint 17+):
 * - Provider is in allowlist
 * - Required buses exist
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
