/**
 * DSConstSignalPoint Compiler Block
 *
 * Trivial pass-through: output = input.
 * This block exists to enable "all defaults are blocks" architecture.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DSConstSignalPoint to IR.
 * Pure pass-through: out = value.
 */
const lowerDSConstSignalPoint: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const value = inputsById?.value ?? inputs[0]; // Signal<Point>

  if (value.k !== 'sig') {
    throw new Error(`DSConstSignalPoint: expected sig input for value, got ${value.k}`);
  }

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DSConstSignalPoint_out');

  // Pass-through: output is same as input
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: value.id, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DSConstSignalPoint',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: "signal", domain: "vec2", category: "core", busEligible: true }, defaultSource: { value: { x: 0, y: 0 } } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: "signal", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerDSConstSignalPoint,
});

