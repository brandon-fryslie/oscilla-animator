/**
 * Allowlist of block types that can be used as default source providers.
 *
 * This is the SINGLE SOURCE OF TRUTH for which blocks can provide default
 * values to undriven inputs.
 *
 * Only blocks in this allowlist can be:
 * - Selected as default source providers in the UI
 * - Injected as hidden provider blocks during compilation
 * - Validated as legitimate provider attachments
 *
 * Any block type NOT in this allowlist will be rejected by validation.
 */

import { DEFAULT_CONST_PROVIDER_BLOCKS } from './constProviders';

/**
 * Complete specification for a default source provider block.
 *
 * Defines:
 * - Block type and label
 * - Which output port provides the value
 * - Which inputs are editable by the user (via DefaultSourceControl)
 * - Which inputs are fed by buses (read-only in UI)
 */
export type DefaultSourceProviderBlockSpec = Readonly<{
  /** Block type identifier (e.g., 'DSConstSignalFloat', 'Oscillator') */
  blockType: string;

  /** Human-readable label for provider selection UI */
  label: string;

  /** Which output port of the provider feeds the target input */
  outputPortId: string;

  /** Input IDs that user can edit (show DefaultSourceControl in UI) */
  editableInputs: readonly string[];

  /** Input IDs fed by buses: { inputId: busName } (read-only in UI) */
  busInputs: Readonly<Record<string, string>>;
}>;

/**
 * Master allowlist of default source provider blocks.
 *
 * Currently includes:
 * - All const providers (9 types for Signal/Field/Scalar)
 * - Oscillator will be added in Sprint 15
 */
export const DEFAULT_SOURCE_PROVIDER_BLOCKS: readonly DefaultSourceProviderBlockSpec[] =
  [
    // Spread all const providers
    ...DEFAULT_CONST_PROVIDER_BLOCKS.map(
      (spec): DefaultSourceProviderBlockSpec => ({
        blockType: spec.blockType,
        label: spec.label,
        outputPortId: spec.outputPortId,
        editableInputs: spec.editableInputs,
        busInputs: {}, // Const providers have no bus inputs
      })
    ),

    // Advanced providers (Oscillator, etc.) will be added in Sprint 15
  ];
