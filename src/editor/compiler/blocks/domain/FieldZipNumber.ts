/**
 * FieldZipNumber Block Compiler
 *
 * Combines two numeric Fields element-wise using a binary operation.
 * Supports add, sub, mul, min, max operations.
 */

import type { BlockCompiler, Field } from '../../types';

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

export const FieldZipNumberBlock: BlockCompiler = {
  type: 'FieldZipNumber',

  inputs: [
    { name: 'a', type: { kind: 'Field:number' }, required: true },
    { name: 'b', type: { kind: 'Field:number' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const fieldA = inputs.a;
    const fieldB = inputs.b;

    if (!fieldA || fieldA.kind !== 'Field:number') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipNumber requires a Field<number> for input A',
        },
      };
    }

    if (!fieldB || fieldB.kind !== 'Field:number') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipNumber requires a Field<number> for input B',
        },
      };
    }

    const op = String(params.op ?? 'add');

    const fieldAFn = fieldA.value as Field<number>;
    const fieldBFn = fieldB.value as Field<number>;
    const zipOp = getZipOperation(op);

    // Create zipped field
    const field: Field<number> = (seed, n, ctx) => {
      const valuesA = fieldAFn(seed, n, ctx);
      const valuesB = fieldBFn(seed, n, ctx);
      const count = Math.min(valuesA.length, valuesB.length);

      const out = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        out[i] = zipOp(valuesA[i]!, valuesB[i]!);
      }

      return out;
    };

    return {
      out: { kind: 'Field:number', value: field },
    };
  },
};
