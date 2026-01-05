/**
 * DivSignal Block Compiler
 *
 * Divides two signals element-wise (a / b).
 * Division by zero returns 0 (safe default, no NaN propagation).
 * Useful for ratio calculations, reciprocals, etc.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir';
import { OpCode } from '../../ir';


// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerDivSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('DivSignal requires signal inputs');
  }

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Div }, outType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'DivSignal_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DivSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 1 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerDivSignal,
});
