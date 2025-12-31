/**
 * DSConstScalarString Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 */

import type { BlockCompiler } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DSConstScalarString to IR.
 * Pure pass-through: out = value.
 *
 * Scalars are compile-time constants, so we pass through the scalarConst reference.
 */
const lowerDSConstScalarString: BlockLowerFn = ({ inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Scalar:string

  if (value.k !== 'scalarConst') {
    throw new Error(`DSConstScalarString: expected scalarConst input for value, got ${value.k}`);
  }

  // Pass-through: output is same as input (scalar const reference)
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'scalarConst', constId: value.constId } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DSConstScalarString',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "scalar", domain: "string", category: "internal", busEligible: false }, defaultSource: { value: '' } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "scalar", domain: "string", category: "internal", busEligible: false } },
  ],
  lower: lowerDSConstScalarString,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstScalarStringBlock: BlockCompiler = {
  type: 'DSConstScalarString',

  inputs: [
    { name: 'value', type: { kind: 'Scalar:string' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Scalar:string' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Scalar:string') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstScalarString requires Scalar:string for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
