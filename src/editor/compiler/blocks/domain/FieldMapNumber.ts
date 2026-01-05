/**
 * FieldMapNumber Block Compiler
 *
 * Applies a unary function to each element of a numeric Field.
 * Supports various math functions and transformations.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Map function name to OpCode (for simple cases)
 */
function getOpCode(fn: string): OpCode | undefined {
  switch (fn) {
    case 'neg':
      return undefined; // Use kernel
    case 'abs':
      return OpCode.Abs;
    case 'sin':
      return OpCode.Sin;
    case 'cos':
      return OpCode.Cos;
    default:
      return undefined; // Use kernel for complex operations
  }
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldMapNumber: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [x] = inputs;

  if (x.k !== 'field') {
    throw new Error('FieldMapNumber requires field input');
  }

  // Extract params from config
  const configObj = config as { fn?: string; k?: unknown; a?: unknown; b?: unknown } | undefined;
  const fn = configObj?.fn ?? 'sin';
  const kRaw = Number(configObj?.k);
  const k = !isNaN(kRaw) && kRaw !== 0 ? kRaw : 1;
  const aRaw = Number(configObj?.a);
  const a = !isNaN(aRaw) ? aRaw : 0;
  const bRaw = Number(configObj?.b);
  const b = !isNaN(bRaw) ? bRaw : 1;

  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const opcode = getOpCode(fn);

  // Build the function reference using PureFnRef union types
  const fnRef = opcode !== undefined
    ? { kind: 'opcode' as const, opcode }
    : { kind: 'kernel' as const, kernelId: `map_${fn}` };

  const fieldId = ctx.b.fieldMap(x.id, fnRef, outType, { k, a, b });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldMapNumber_out');
  return {
    outputs: [],
    outputsById: { y: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldMapNumber',
  capability: 'pure',
  inputs: [
    { portId: 'x', label: 'X', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'y', label: 'Y', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldMapNumber,
});
