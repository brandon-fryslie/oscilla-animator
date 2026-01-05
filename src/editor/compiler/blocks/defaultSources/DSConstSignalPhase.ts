/**
 * DSConstSignalPhase Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 * Provides Signal:phase values (0..1 normalized phase).
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DSConstSignalPhase to IR.
 *
 * DSConst blocks work in two modes:
 * 1. Provider mode: No input connection, value comes from params.value
 * 2. Pass-through mode: Has input connection, passes it through
 *
 * Signals are time-indexed values, but for constants we just emit sigConst.
 */
const lowerDSConstSignalPhase: BlockLowerFn = ({ ctx, inputs, inputsById, config }) => {
  const inputValue = inputsById?.value ?? inputs[0];

  // If we have a valid input, pass it through
  if (inputValue !== undefined && inputValue.k === 'sig') {
    const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DSConstSignalPhase_out');
    return {
      outputs: [],
      outputsById: { out: { k: 'sig', id: inputValue.id, slot } },
    };
  }

  // Provider mode: use config.value (set by GraphNormalizer or user params)
  const params = config as { value?: number } | undefined;
  const rawValue = params?.value ?? 0;
  const type = ctx.outTypes[0];
  const sigId = ctx.b.sigConst(rawValue, type);
  const slot = ctx.b.allocValueSlot(type, 'DSConstSignalPhase_out');
  ctx.b.registerSigSlot(sigId, slot);

  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
// Note: No defaultSource on value input - DSConst blocks read from params directly
registerBlockType({
  type: 'DSConstSignalPhase',
  capability: 'pure',
  inputs: [
    {
      portId: 'value',
      label: 'Value',
      dir: 'in',
      type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true },
      optional: true,
    },
  ],
  outputs: [
    {
      portId: 'out',
      label: 'Output',
      dir: 'out',
      type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true },
    },
  ],
  lower: lowerDSConstSignalPhase,
});

