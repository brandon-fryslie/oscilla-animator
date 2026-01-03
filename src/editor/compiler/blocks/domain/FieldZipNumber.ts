/**
 * FieldZipNumber Block Compiler
 *
 * Combines two numeric Fields element-wise using a binary operation.
 * Supports add, sub, mul, min, max operations.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Get the binary operation by name
 */
function getZipOperation(op: string): (a: number, b: number) => number {
  switch (op) {
    case 'add':
      return (a, b) => a + b;
    case 'sub':
      return (a, b) => a - b;
    case 'mul':
      return (a, b) => a * b;
    case 'min':
      return (a, b) => Math.min(a, b);
    case 'max':
      return (a, b) => Math.max(a, b);
    default:
      return (a, _b) => a; // default to first
  }
}

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
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
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

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldZipNumberBlock: BlockCompiler = {
  type: 'FieldZipNumber',

  inputs: [
    { name: 'a', type: { kind: 'Field:float' }, required: true },
    { name: 'b', type: { kind: 'Field:float' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:float' } },
  ],

  compile({ params, inputs }) {
    const fieldA = inputs.a;
    const fieldB = inputs.b;

    if (!isDefined(fieldA) || fieldA.kind !== 'Field:float') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipNumber requires a Field<float> for input A',
        },
      };
    }

    if (!isDefined(fieldB) || fieldB.kind !== 'Field:float') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipNumber requires a Field<float> for input B',
        },
      };
    }

    const op = typeof params.op === 'string' ? params.op : 'add';

    const fieldAFn = fieldA.value;
    const fieldBFn = fieldB.value;
    const zipOp = getZipOperation(op);

    // Create zipped field
    const field: Field<float> = (seed, n, ctx) => {
      const valuesA = fieldAFn(seed, n, ctx);
      const valuesB = fieldBFn(seed, n, ctx);
      const count = Math.min(valuesA.length, valuesB.length);

      const out = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        out[i] = zipOp(valuesA[i], valuesB[i]);
      }

      return out;
    };

    return {
      out: { kind: 'Field:float', value: field },
    };
  },
};
