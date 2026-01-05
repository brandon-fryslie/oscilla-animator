/**
 * FieldColorize Block Compiler
 *
 * Maps a numeric Field to colors using a gradient.
 * Takes Field<float> (typically in [0,1]) and produces Field<color>.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldColorize: BlockLowerFn = ({ inputs, config }) => {
  const values = inputs[0];

  if (values.k !== 'field') {
    throw new Error('FieldColorize requires field input');
  }

  // This block requires field-level color interpolation operations.
  // Options:
  // 1. Use OpCode.ColorLerp with fieldMap to interpolate between two color constants
  // 2. Implement custom color gradient kernel
  //
  // The current IR doesn't support:
  // - Field-level color operations (ColorLerp is signal-level)
  // - Color constants in the const pool
  // - Hex color string handling
  //
  // We'd need:
  // - fieldMap with ColorLerp opcode
  // - Color constant support
  // - Color string encoding/decoding

  const mode = (config != null && typeof config === 'object' && 'mode' in config)
    ? String(config.mode)
    : 'lerp';

  throw new Error(
    `FieldColorize IR lowering requires field-level color operations (mode: ${mode}). ` +
    'This needs: (1) fieldMap with ColorLerp opcode support, ' +
    '(2) color constant pool support, and ' +
    '(3) color string encoding in IR. ' +
    'This block is not yet supported in IR until field color operations are implemented.'
  );
};

registerBlockType({
  type: 'FieldColorize',
  capability: 'pure',
  inputs: [
    { portId: 'values', label: 'Values', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'colors', label: 'Colors', dir: 'out', type: { world: "field", domain: "color", category: "core", busEligible: true } },
  ],
  lower: lowerFieldColorize,
});
