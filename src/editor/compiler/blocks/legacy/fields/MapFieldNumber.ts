/**
 * MapFieldNumber Block Compiler
 *
 * Applies a function to each element of a Field<number>.
 */

import type { BlockCompiler, Field } from '../../../types';

function getFn(name: string): (x: number) => number {
  switch (name) {
    case 'sin':
      return Math.sin;
    case 'cos':
      return Math.cos;
    case 'abs':
      return Math.abs;
    case 'sqrt':
      return Math.sqrt;
    case 'negate':
      return (x) => -x;
    case 'square':
      return (x) => x * x;
    default:
      return (x) => x;
  }
}

export const MapFieldNumberBlock: BlockCompiler = {
  type: 'mapFieldNumber',
  inputs: [{ name: 'field', type: { kind: 'Field:number' }, required: true }],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ params, inputs }) {
    const field = inputs.field;

    if (field.kind !== 'Field:number') {
      return {
        out: { kind: 'Error', message: 'mapFieldNumber: field must be Field:number' },
      };
    }

    const fnName = String(params.fn ?? 'abs');
    const fn = getFn(fnName);

    const out: Field<number> = (seed, n, ctx) => {
      const F = field.value(seed, n, ctx);
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) Y[i] = fn(F[i] ?? 0);
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
