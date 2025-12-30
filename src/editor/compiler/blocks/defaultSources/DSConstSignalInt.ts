/**
 * DSConstSignalInt Compiler Block
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
 * Lower DSConstSignalInt to IR.
 * Pure pass-through: out = value.
 */
const lowerDSConstSignalInt: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Signal<int>

  if (value.k !== 'sig') {
    throw new Error(`DSConstSignalInt: expected sig input for value, got ${value.k}`);
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
  type: 'DSConstSignalInt',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: 'signal', domain: 'int' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: 'signal', domain: 'int' } },
  ],
  lower: lowerDSConstSignalInt,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstSignalIntBlock: BlockCompiler = {
  type: 'DSConstSignalInt',

  inputs: [
    { name: 'value', type: { kind: 'Signal:int' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:int' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Signal:int') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstSignalInt requires Signal<int> for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
