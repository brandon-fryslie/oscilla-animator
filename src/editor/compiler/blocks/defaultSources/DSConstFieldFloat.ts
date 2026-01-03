/**
 * DSConstFieldFloat Compiler Block
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
 * Lower DSConstFieldFloat to IR.
 *
 * DSConst blocks work in two modes:
 * 1. Provider mode: No input connection, value comes from params.value
 * 2. Pass-through mode: Has input connection, passes it through
 */
const lowerDSConstFieldFloat: BlockLowerFn = ({ ctx, inputs, inputsById, config }) => {
  const inputValue = inputsById?.value ?? inputs[0];

  // If we have a valid field input, pass it through
  if (inputValue !== undefined && inputValue.k === 'field') {
    const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DSConstFieldFloat_out');
    return {
      outputs: [],
      outputsById: { out: { k: 'field', id: inputValue.id, slot } },
    };
  }

  // Provider mode: use config.value (set by pass0-materialize or user params)
  const params = config as { value?: number } | undefined;
  const rawValue = params?.value ?? 0;
  const type = ctx.outTypes[0];
  const fieldId = ctx.b.fieldConst(rawValue, type);
  const slot = ctx.b.allocValueSlot(type, 'DSConstFieldFloat_out');
  ctx.b.registerFieldSlot(fieldId, slot);

  return {
    outputs: [],
    outputsById: { out: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
// Note: No defaultSource on value input - DSConst blocks read from params directly when no input connected
registerBlockType({
  type: 'DSConstFieldFloat',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, optional: true },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerDSConstFieldFloat,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstFieldFloatBlock: BlockCompiler = {
  type: 'DSConstFieldFloat',

  inputs: [
    { name: 'value', type: { kind: 'Field:float' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:float' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Field:float') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstFieldFloat requires Field<float> for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
