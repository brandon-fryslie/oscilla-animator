/**
 * DSConstSignalColor Compiler Block
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
 * Lower DSConstSignalColor to IR.
 * Pure pass-through: out = value.
 */
const lowerDSConstSignalColor: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Signal<color>

  if (value.k !== 'sig') {
    throw new Error(`DSConstSignalColor: expected sig input for value, got ${value.k}`);
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
  type: 'DSConstSignalColor',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "signal", domain: "color", category: "core", busEligible: true }, defaultSource: { value: '#ffffff' } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "signal", domain: "color", category: "core", busEligible: true } },
  ],
  lower: lowerDSConstSignalColor,
});

// =============================================================================
// Legacy Compiler
// =============================================================================

/**
 * Legacy compiler implementation (will be removed in Phase 4).
 * Pass-through: outputs.out = inputs.value
 */
export const DSConstSignalColorBlock: BlockCompiler = {
  type: 'DSConstSignalColor',

  inputs: [
    { name: 'value', type: { kind: 'Signal:color' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:color' } },
  ],

  compile({ inputs }) {
    const valueArtifact = inputs.value;

    if (valueArtifact === undefined || valueArtifact.kind !== 'Signal:color') {
      return {
        out: {
          kind: 'Error',
          message: 'DSConstSignalColor requires Signal<color> for value input',
        },
      };
    }

    // Trivial pass-through
    return {
      out: valueArtifact,
    };
  },
};
