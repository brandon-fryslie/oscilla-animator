/**
 * DSConstScalarInt Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DSConstScalarInt to IR.
 * Pure pass-through: out = value.
 *
 * Scalars are compile-time constants, so we pass through the scalarConst reference.
 */
const lowerDSConstScalarInt: BlockLowerFn = ({ inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Scalar:int

  if (value.k !== 'scalarConst') {
    throw new Error(`DSConstScalarInt: expected scalarConst input for value, got ${value.k}`);
  }

  // Pass-through: output is same as input (scalar const reference)
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'scalarConst', constId: value.constId } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DSConstScalarInt',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "scalar", domain: "int", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "scalar", domain: "int", category: "core", busEligible: true } },
  ],
  lower: lowerDSConstScalarInt,
});

