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
 * Pure pass-through: out = value.
 */
const lowerDSConstSignalFloat: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Signal<float>

  if (value.k !== 'sig') {
    throw new Error(`DSConstSignalFloat: expected sig input for value, got ${value.k}`);
  }

  const slot = ctx.b.allocValueSlot();

  // Pass-through: output is same as input
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: value.id, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DSConstSignalFloat',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: 'signal', domain: 'float' } },
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
