/**
 * FieldZipNumber Block Compiler
 *
 * Combines two numeric Fields element-wise using a binary operation.
 * Supports add, sub, mul, min, max operations.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Map operation name to OpCode
 */
function getOpCode(op: string): OpCode {
  switch (op) {
    case 'add':
      return OpCode.Add;
    case 'sub':
      return OpCode.Sub;
    case 'mul':
      return OpCode.Mul;
    case 'min':
      return OpCode.Min;
    case 'max':
      return OpCode.Max;
    default:
      return OpCode.Add;
  }
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldZipNumber: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [a, b] = inputs;

  if (a.k !== 'field' || b.k !== 'field') {
    throw new Error('FieldZipNumber requires field inputs');
  }

  // Extract operation from config
  const configObj = config as { op?: string } | undefined;
  const op = configObj?.op ?? 'add';
  const opcode = getOpCode(op);

  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.fieldZip(a.id, b.id, {
    kind: 'opcode',
    opcode,
  }, outType);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldZipNumber_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldZipNumber',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldZipNumber,
});
