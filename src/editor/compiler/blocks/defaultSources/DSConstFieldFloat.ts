/**
 * DSConstFieldFloat Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 */

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

  // Provider mode: use config.value (set by GraphNormalizer or user params)
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

