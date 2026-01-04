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

  // Provider mode: use config.value (set by GraphNormalizer or user params)
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
 *
 * Works in two modes:
 * 1. Pass-through mode: If value input is connected, pass it through
 * 2. Provider mode: If value input is not connected, emit constant from params
 */
export const DSConstScalarFloatBlock: BlockCompiler = {
  type: 'DSConstScalarFloat',

  inputs: [
    { name: 'value', type: { kind: 'Scalar:float' }, required: false }, // Optional for provider mode
  ],

  outputs: [
    { name: 'out', type: { kind: 'Scalar:float' } },
  ],

  compile({ inputs, params }) {
    const valueArtifact = inputs.value;

    // Pass-through mode: if we have a valid input, forward it
    if (valueArtifact !== undefined && valueArtifact.kind === 'Scalar:float') {
      return {
        out: valueArtifact,
      };
    }

    // Provider mode: emit constant from params
    const constValue = (params?.value as number) ?? 0;
    return {
      out: {
        kind: 'Scalar:float',
        value: constValue,
      },
    };
  },
};
