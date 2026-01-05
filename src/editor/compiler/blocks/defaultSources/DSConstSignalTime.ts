/**
 * DSConstSignalTime Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 * Provides Signal:time values (absolute time in milliseconds).
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DSConstSignalTime to IR.
 *
 * DSConst blocks work in two modes:
 * 1. Provider mode: No input connection, value comes from params.value
 * 2. Pass-through mode: Has input connection, passes it through
 *
 * For Signal:time, in provider mode we emit the absolute time signal from the time model.
 */
const lowerDSConstSignalTime: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const inputValue = inputsById?.value ?? inputs[0];

  // If we have a valid input, pass it through
  if (inputValue !== undefined && inputValue.k === 'sig') {
    const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DSConstSignalTime_out');
    return {
      outputs: [],
      outputsById: { out: { k: 'sig', id: inputValue.id, slot } },
    };
  }

  // Provider mode: emit time signal from time model
  // Signal:time represents absolute time in milliseconds
  const type = { world: "signal" as const, domain: "timeMs" as const, category: "internal" as const, busEligible: false };
  const sigId = ctx.b.sigTimeAbsMs();
  const slot = ctx.b.allocValueSlot(type, 'DSConstSignalTime_out');
  ctx.b.registerSigSlot(sigId, slot);

  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
// Note: No defaultSource on value input - DSConst blocks read from params directly
registerBlockType({
  type: 'DSConstSignalTime',
  capability: 'pure',
  inputs: [
    {
      portId: 'value',
      label: 'Value',
      dir: 'in',
      type: { world: "signal", domain: "timeMs", category: "internal", busEligible: false },
      optional: true,
    },
  ],
  outputs: [
    {
      portId: 'out',
      label: 'Output',
      dir: 'out',
      type: { world: "signal", domain: "timeMs", category: "internal", busEligible: false },
    },
  ],
  lower: lowerDSConstSignalTime,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 *
 * Works in two modes:
 * 1. Pass-through mode: If value input is connected, pass it through
 * 2. Provider mode: If value input is not connected, emit absolute time signal
 */
export const DSConstSignalTimeBlock: BlockCompiler = {
  type: 'DSConstSignalTime',

  inputs: [
    { name: 'value', type: { kind: 'Signal:Time' }, required: false }, // Optional for provider mode
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:Time' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    // Pass-through mode: if we have a valid input, forward it
    if (valueArtifact !== undefined && valueArtifact.kind === 'Signal:Time') {
      return {
        out: valueArtifact,
      };
    }

    // Provider mode: emit time signal (absolute time in ms)
    // This gets the current time from RuntimeCtx
    return {
      out: {
        kind: 'Signal:Time',
        value: (_t: number, ctx: RuntimeCtx) => ctx.tMs ?? 0,
      },
    };
  },
};
