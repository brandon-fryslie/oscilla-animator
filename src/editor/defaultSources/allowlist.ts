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
 * - All const providers (13 types for Signal/Field/Scalar)
 * - Oscillator (Sprint 15)
 */
export const DEFAULT_SOURCE_PROVIDER_BLOCKS: readonly DefaultSourceProviderBlockSpec[] =
  [
    // Signal const providers (no inputs - value comes from params)
    {
      blockType: 'DSConstSignalFloat',
      label: 'Constant (Signal<float>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstSignalInt',
      label: 'Constant (Signal<int>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstSignalColor',
      label: 'Constant (Signal<color>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstSignalPoint',
      label: 'Constant (Signal<vec2>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstSignalPhase',
      label: 'Constant (Signal<phase>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstSignalTime',
      label: 'Constant (Signal<time>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },

    // Field const providers (no inputs - value comes from params)
    {
      blockType: 'DSConstFieldFloat',
      label: 'Constant (Field<float>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstFieldVec2',
      label: 'Constant (Field<vec2>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstFieldColor',
      label: 'Constant (Field<color>)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },

    // Scalar const providers (no inputs - value comes from params)
    {
      blockType: 'DSConstScalarInt',
      label: 'Constant (Scalar:int)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstScalarFloat',
      label: 'Constant (Scalar:float)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstScalarString',
      label: 'Constant (Scalar:string)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },
    {
      blockType: 'DSConstScalarWaveform',
      label: 'Constant (Scalar:waveform)',
      outputPortId: 'out',
      editableInputs: [],
      busInputs: {},
    },

    // Advanced providers with real inputs
    {
      blockType: 'Oscillator',
      label: 'Oscillator (Sine/LFO)',
      outputPortId: 'out',
      editableInputs: ['shape', 'amplitude', 'bias'],
      busInputs: { phase: 'phaseA' },
    },
  ];
