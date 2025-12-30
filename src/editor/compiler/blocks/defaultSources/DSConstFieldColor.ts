/**
 * DSConstFieldColor Compiler Block
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
 * Lower DSConstFieldColor to IR.
 * Pure pass-through: out = value.
 */
const lowerDSConstFieldColor: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Field<color>

  if (value.k !== 'field') {
    throw new Error(`DSConstFieldColor: expected field input for value, got ${value.k}`);
  }

  const slot = ctx.b.allocValueSlot();

  // Pass-through: output is same as input
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'field', id: value.id, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DSConstFieldColor',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: 'field', domain: 'color' }, defaultSource: { value: '#ffffff' } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: 'field', domain: 'color' } },
  ],
  lower: lowerDSConstFieldColor,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstFieldColorBlock: BlockCompiler = {
  type: 'DSConstFieldColor',

  inputs: [
    { name: 'value', type: { kind: 'Field:color' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:color' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Field:color') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstFieldColor requires Field<color> for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
