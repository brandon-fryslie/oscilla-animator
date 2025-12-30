/**
 * Const provider blocks - trivial pass-through blocks that provide constant values.
 *
 * Each const provider:
 * - Has one input: 'value' (with defaultSource metadata for editability)
 * - Has one output: 'out' (same type as value)
 * - Acts as pure pass-through: out = value
 *
 * This enables "all defaults are blocks" architecture - even constant defaults
 * are implemented as hidden provider blocks.
 */

/**
 * Specification for a const provider block.
 */
export type ConstProviderSpec = Readonly<{
  /** Block type identifier (e.g., 'DSConstSignalFloat') */
  blockType: string;

  /** Human-readable label for UI */
  label: string;

  /** Output port ID (always 'out' for const providers) */
  outputPortId: string;

  /** Editable inputs (always ['value'] for const providers) */
  editableInputs: readonly string[];
}>;

/**
 * Comprehensive set of const provider blocks covering all common slot types.
 *
 * Signal types:
 * - Signal<float> → DSConstSignalFloat
 * - Signal<int> → DSConstSignalInt
 * - Signal<color> → DSConstSignalColor
 * - Signal<vec2> → DSConstSignalVec2
 *
 * Field types:
 * - Field<float> → DSConstFieldFloat
 * - Field<vec2> → DSConstFieldVec2
 * - Field<color> → DSConstFieldColor
 *
 * Scalar types:
 * - Scalar:string → DSConstScalarString
 * - Scalar:waveform → DSConstScalarWaveform
 */
export const DEFAULT_CONST_PROVIDER_BLOCKS: readonly ConstProviderSpec[] = [
  {
    blockType: 'DSConstSignalFloat',
    label: 'Constant (Signal<float>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstSignalInt',
    label: 'Constant (Signal<int>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstSignalColor',
    label: 'Constant (Signal<color>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstSignalVec2',
    label: 'Constant (Signal<vec2>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstFieldFloat',
    label: 'Constant (Field<float>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstFieldVec2',
    label: 'Constant (Field<vec2>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstFieldColor',
    label: 'Constant (Field<color>)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstScalarString',
    label: 'Constant (Scalar:string)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
  {
    blockType: 'DSConstScalarWaveform',
    label: 'Constant (Scalar:waveform)',
    outputPortId: 'out',
    editableInputs: ['value'],
  },
];

/**
 * Mapping from slot type patterns to const provider block types.
 *
 * Used to automatically select the appropriate const provider based on
 * an input slot's type signature.
 */
export const CONST_PROVIDER_MAPPING: Readonly<
  Record<string, string>
> = Object.freeze({
  'Signal<float>': 'DSConstSignalFloat',
  'Signal<int>': 'DSConstSignalInt',
  'Signal<color>': 'DSConstSignalColor',
  'Signal<vec2>': 'DSConstSignalVec2',
  'Field<float>': 'DSConstFieldFloat',
  'Field<vec2>': 'DSConstFieldVec2',
  'Field<color>': 'DSConstFieldColor',
  'Scalar:string': 'DSConstScalarString',
  'Scalar:waveform': 'DSConstScalarWaveform',
});
