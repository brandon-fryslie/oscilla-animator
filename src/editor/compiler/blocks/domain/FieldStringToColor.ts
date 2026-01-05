/**
 * FieldStringToColor Block Compiler
 *
 * Simple adapter that reinterprets Field<string> as Field<color>.
 * The strings should be valid CSS color values (hex, rgb, hsl, etc.)
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldStringToColor: BlockLowerFn = ({ inputs, inputsById }) => {
  // Use inputsById with fallback to positional input
  const strings = inputsById?.strings ?? inputs[0];

  if (!strings || strings.k !== 'field') {
    throw new Error(`FieldStringToColor requires field input, got ${strings?.k ?? 'undefined'}`);
  }

  // This is a pure type reinterpretation - Field<string> -> Field<color>
  // In the IR, both are represented the same way (field of values)
  // The type annotation changes but the actual data structure is identical
  //
  // This is a no-op in IR - just pass through the field reference
  return {
    outputs: [],  // Legacy array - empty for migrated blocks
    outputsById: {
      colors: strings,
    },
  };
};

registerBlockType({
  type: 'FieldStringToColor',
  capability: 'pure',
  inputs: [
    { portId: 'strings', label: 'Strings', dir: 'in', type: { world: "field", domain: "string", category: "internal", busEligible: false }, defaultSource: { value: '' } },
  ],
  outputs: [
    { portId: 'colors', label: 'Colors', dir: 'out', type: { world: "field", domain: "color", category: "core", busEligible: true } },
  ],
  lower: lowerFieldStringToColor,
});
