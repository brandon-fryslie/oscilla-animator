/**
 * MinSignal Block Compiler
 *
 * Component-wise minimum of two signals.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';


// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerMinSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('MinSignal requires signal inputs');
  }

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Min }, outType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'MinSignal_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'MinSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: Infinity } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: Infinity } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerMinSignal,
});
