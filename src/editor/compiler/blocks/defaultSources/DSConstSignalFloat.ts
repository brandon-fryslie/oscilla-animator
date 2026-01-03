/**
 * DSConstSignalFloat Compiler Block
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
 * Lower DSConstSignalFloat to IR.
 *
 * DSConst blocks work in two modes:
 * 1. Provider mode: No input connection, value comes from params.value
 * 2. Pass-through mode: Has input connection, passes it through
 *
 * Signals are time-indexed values, but for constants we just emit sigConst.
 */
const lowerDSConstSignalFloat: BlockLowerFn = ({ ctx, inputs, inputsById, config }) => {
  const inputValue = inputsById?.value ?? inputs[0];

  // If we have a valid input, pass it through
  if (inputValue !== undefined && inputValue.k === 'sig') {
    const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DSConstSignalFloat_out');
    return {
      outputs: [],
      outputsById: { out: { k: 'sig', id: inputValue.id, slot } },
    };
  }

  // Provider mode: use config.value (set by pass0-materialize or user params)
  const params = config as { value?: number } | undefined;
  const rawValue = params?.value ?? 0;
  const type = ctx.outTypes[0];
  const sigId = ctx.b.sigConst(rawValue, type);
  const slot = ctx.b.allocValueSlot(type, 'DSConstSignalFloat_out');
  ctx.b.registerSigSlot(sigId, slot);

  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
// Note: No defaultSource on value input - DSConst blocks read from params directly
registerBlockType({
  type: 'DSConstSignalFloat',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, optional: true },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerDSConstSignalFloat,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstSignalFloatBlock: BlockCompiler = {
  type: 'DSConstSignalFloat',

  inputs: [
    { name: 'value', type: { kind: 'Signal:float' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:float' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstSignalFloat requires Signal<float> for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
