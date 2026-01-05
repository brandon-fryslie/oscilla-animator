/**
 * SubSignal Block Compiler
 *
 * Subtracts two signals element-wise (a - b).
 * Useful for offset modulation, differential signals, etc.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';


// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerSubSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('SubSignal requires signal inputs');
  }

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Sub }, outType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'SubSignal_out');
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'SubSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerSubSignal,
});
