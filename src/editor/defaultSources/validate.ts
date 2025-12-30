/**
 * Validation for default source attachments.
 *
 * This module validates that DefaultSourceAttachments are well-formed:
 * - Provider output types are compatible with target input types (Sprint 16)
 * - Provider block types are allowlisted (Sprint 17)
 * - Required buses exist (Sprint 17)
 * - No feedback cycles (Sprint 18)
 * - Edge case validations (Sprint 18)
 *
 * Validation is performed during semantic validation and emits diagnostics
 * that appear in the diagnostic panel.
 */

import type { RootStore } from '../stores/RootStore';
import type { Diagnostic } from '../diagnostics/types';
import { createDiagnostic } from '../diagnostics/types';
import { getBlockDefinition } from '../blocks/registry';
import { areSlotTypesCompatible } from '../semantic';
import type { DefaultSourceAttachment } from './types';
import { DEFAULT_SOURCE_PROVIDER_BLOCKS } from './allowlist';

/**
 * Validate all default source attachments in the patch.
 *
 * Checks:
 * - Type compatibility: provider output type matches target input type (Sprint 16)
 * - Provider is in allowlist (Sprint 17)
 * - Required buses exist (Sprint 17)
 * - No feedback cycles (Sprint 18)
 * - Edge case validations (Sprint 18)
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

    // Sprint 18: Validate no feedback cycles
    const cycleWarnings = validateNoCycles(
      attachment,
      rootStore,
      patchRevision
    );
    diagnostics.push(...cycleWarnings);

    // Sprint 18: Edge case validations
    const edgeCaseErrors = validateEdgeCases(
      attachment,
      rootStore,
      patchRevision
    );
    diagnostics.push(...edgeCaseErrors);
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
  const providerOutputType = providerOutput.type;
  const targetInputType = targetSlot.type;

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

/**
 * Validate that no feedback cycles are created by the provider attachment.
 *
 * Sprint 18: Detect cycles where provider reads from bus X and target block publishes to bus X.
 * This creates a feedback loop which may be intentional (e.g., delay feedback) but is suspicious.
 *
 * Emits WARNING (not error) since cycles may be intentional design.
 *
 * @param attachment - The attachment to validate
 * @param rootStore - Root store to look up buses and publishers
 * @param patchRevision - Current patch revision for diagnostic metadata
 * @returns Array of diagnostics (empty if valid)
 */
function validateNoCycles(
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

  // If provider has no bus inputs, no cycle is possible
  if (!spec.busInputs || Object.keys(spec.busInputs).length === 0) {
    return diagnostics;
  }

  // Get all buses that the provider reads from
  const providerReadsBuses = new Set<string>();
  for (const busName of Object.values(spec.busInputs)) {
    const bus = rootStore.busStore.buses.find((b) => b.name === busName);
    if (bus) {
      providerReadsBuses.add(bus.id);
    }
  }

  // Get all buses that the target block publishes to
  const targetPublisherBuses = rootStore.busStore.publishers
    .filter((p) => p.from.blockId === target.blockId && p.enabled)
    .map((p) => p.busId);

  // Check for overlap: if provider reads from a bus that target publishes to, we have a cycle
  for (const busId of targetPublisherBuses) {
    if (providerReadsBuses.has(busId)) {
      // Cycle detected - emit WARNING (not error, may be intentional)
      const bus = rootStore.busStore.buses.find((b) => b.id === busId);
      const busName = bus?.name ?? busId;

      // Get target block info for friendly warning message
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
          code: 'W_FEEDBACK_CYCLE',
          severity: 'warn',
          domain: 'compile',
          primaryTarget: {
            kind: 'port',
            portRef: {
              blockId: target.blockId,
              slotId: target.slotId,
              direction: 'input',
            },
          },
          title: 'Potential feedback cycle detected',
          message: `Potential feedback cycle: default source provider "${providerLabel}" for ${targetBlockName}.${targetInputName} reads from bus '${busName}', but ${targetBlockName} also publishes to '${busName}'. This may cause unexpected behavior unless intentional (e.g., delay feedback).`,
          patchRevision,
          payload: {
            kind: 'generic',
            data: {
              providerType: provider.blockType,
              providerLabel,
              busName,
              targetBlockId: target.blockId,
              targetBlockName,
            },
          },
        })
      );
    }
  }

  return diagnostics;
}

/**
 * Validate edge cases in provider configuration.
 *
 * Sprint 18: Final edge case validations:
 * - Provider output port exists
 * - All editableInputs exist in provider definition
 * - All editableInputs have defaultSource metadata
 * - Provider has no other required inputs besides busInputs and editableInputs
 *
 * @param attachment - The attachment to validate
 * @param rootStore - Root store to look up block definitions
 * @param patchRevision - Current patch revision for diagnostic metadata
 * @returns Array of diagnostics (empty if valid)
 */
function validateEdgeCases(
  attachment: DefaultSourceAttachment,
  _rootStore: RootStore,
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

  // Get provider block definition
  const providerBlockDef = getBlockDefinition(provider.blockType);
  if (!providerBlockDef) {
    // Provider block type doesn't exist - skip edge case validation
    return diagnostics;
  }

  // 1. Validate provider output port exists (already checked in type validation, but be explicit)
  const providerOutput = providerBlockDef.outputs?.find(
    (o) => o.id === provider.outputPortId
  );
  if (!providerOutput) {
    // This is caught by validateTypeCompatibility, but emit explicit error if we get here
    diagnostics.push(
      createDiagnostic({
        code: 'E_INVALID_DEFAULT_SOURCE_PROVIDER',
        severity: 'error',
        domain: 'compile',
        primaryTarget: {
          kind: 'block',
          blockId: target.blockId,
        },
        title: 'Provider output port does not exist',
        message: `Default source provider "${provider.blockType}" specification references output port "${provider.outputPortId}" which does not exist in the block definition.`,
        patchRevision,
      })
    );
  }

  // 2. Validate all editableInputs exist in provider definition
  for (const editableInputId of spec.editableInputs) {
    const inputSlot = providerBlockDef.inputs?.find(
      (s) => s.id === editableInputId
    );
    if (!inputSlot) {
      diagnostics.push(
        createDiagnostic({
          code: 'E_INVALID_DEFAULT_SOURCE_PROVIDER',
          severity: 'error',
          domain: 'compile',
          primaryTarget: {
            kind: 'block',
            blockId: target.blockId,
          },
          title: 'Provider editable input does not exist',
          message: `Default source provider "${provider.blockType}" specification references editable input "${editableInputId}" which does not exist in the block definition.`,
          patchRevision,
        })
      );
    } else {
      // 3. Validate editableInput has defaultSource metadata
      if (!inputSlot.defaultSource) {
        diagnostics.push(
          createDiagnostic({
            code: 'E_INVALID_DEFAULT_SOURCE_PROVIDER',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'block',
              blockId: target.blockId,
            },
            title: 'Provider editable input missing defaultSource metadata',
            message: `Default source provider "${provider.blockType}" editable input "${editableInputId}" does not have defaultSource metadata. All editable provider inputs must have default values.`,
            patchRevision,
          })
        );
      }
    }
  }

  // 4. Validate provider has no other required inputs besides busInputs and editableInputs
  if (providerBlockDef.inputs) {
    // Build set of all allowed inputs (busInputs + editableInputs)
    const allowedInputs = new Set<string>([
      ...spec.editableInputs,
      ...Object.keys(spec.busInputs ?? {}),
    ]);

    // Check each input in provider definition
    for (const inputSlot of providerBlockDef.inputs) {
      // If input is required (no defaultSource metadata) and not in allowed set, error
      if (!inputSlot.defaultSource && !allowedInputs.has(inputSlot.id)) {
        diagnostics.push(
          createDiagnostic({
            code: 'E_INVALID_DEFAULT_SOURCE_PROVIDER',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'block',
              blockId: target.blockId,
            },
            title: 'Provider has unsatisfiable required input',
            message: `Default source provider "${provider.blockType}" has required input "${inputSlot.id}" which is not declared as busInput or editableInput in the provider specification. All required inputs must be explicitly declared.`,
            patchRevision,
          })
        );
      }
    }
  }

  return diagnostics;
}
