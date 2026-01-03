/**
 * DSConstScalarFloat Compiler Block
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
 * Lower DSConstScalarFloat to IR.
 *
 * DSConst blocks work in two modes:
 * 1. Provider mode: No input connection, value comes from params.value
 * 2. Pass-through mode: Has input connection, passes it through
 *
 * Scalars are compile-time constants stored in the const pool.
 */
const lowerDSConstScalarFloat: BlockLowerFn = ({ ctx, inputs, inputsById, config }) => {
  const inputValue = inputsById?.value ?? inputs[0];

  // If we have a valid input, pass it through
  if (inputValue !== undefined && inputValue.k === 'scalarConst') {
    return {
      outputs: [],
      outputsById: { out: { k: 'scalarConst', constId: inputValue.constId } },
    };
  }

  // Provider mode: use config.value (set by pass0-materialize or user params)
  const params = config as { value?: number } | undefined;
  const rawValue = params?.value ?? 0;
  const constId = ctx.b.allocConstId(rawValue);

  return {
    outputs: [],
    outputsById: { out: { k: 'scalarConst', constId } },
  };
};

// Register block type for IR lowering
// Note: No defaultSource on value input - DSConst blocks read from params directly
registerBlockType({
  type: 'DSConstScalarFloat',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "scalar", domain: "float", category: "core", busEligible: false }, optional: true },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "scalar", domain: "float", category: "core", busEligible: false } },
  ],
  lower: lowerDSConstScalarFloat,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstScalarFloatBlock: BlockCompiler = {
  type: 'DSConstScalarFloat',

  inputs: [
    { name: 'value', type: { kind: 'Scalar:float' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Scalar:float' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Scalar:float') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstScalarFloat requires Scalar:float for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
