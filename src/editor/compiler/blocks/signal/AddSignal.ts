/**
 * AddSignal Block Compiler
 *
 * Adds two signals element-wise.
 * Useful for combining energy sources, modulation, etc.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerAddSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('AddSignal requires signal inputs');
  }

  const outType = ctx.outTypes[0];
  const sigId = ctx.b.sigZip(a.id, b.id, {
    kind: 'opcode',
    opcode: OpCode.Add,
  }, outType);

  const slot = ctx.b.allocValueSlot(outType, 'AddSignal_out');
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'AddSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerAddSignal,
});
