/**
 * DSConstFieldVec2 Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DSConstFieldVec2 to IR.
 * Pure pass-through: out = value.
 */
const lowerDSConstFieldVec2: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Field<vec2>

  if (value.k !== 'field') {
    throw new Error(`DSConstFieldVec2: expected field input for value, got ${value.k}`);
  }

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DSConstFieldVec2_out');

  // Pass-through: output is same as input
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'field', id: value.id, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DSConstFieldVec2',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "field", domain: "vec2", category: "core", busEligible: true }, defaultSource: { value: { x: 0, y: 0 } } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerDSConstFieldVec2,
});

