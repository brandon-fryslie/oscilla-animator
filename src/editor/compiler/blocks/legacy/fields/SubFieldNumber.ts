/**
 * SubFieldNumber Block Compiler
 *
 * Subtracts two Field<number> element-wise (a - b).
 */

import type { BlockCompiler, Field } from '../../../types';

export const SubFieldNumberBlock: BlockCompiler = {
  type: 'subFieldNumber',
  inputs: [
    { name: 'a', type: { kind: 'Field:number' }, required: true },
    { name: 'b', type: { kind: 'Field:number' }, required: true },
  ],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ inputs }) {
    if (inputs.a?.kind !== 'Field:number' || inputs.b?.kind !== 'Field:number') {
      return { out: { kind: 'Error', message: 'subFieldNumber: inputs must be Field<number>' } };
    }

    const a = inputs.a.value;
    const b = inputs.b.value;

    const out: Field<number> = (seed, n, ctx) => {
      const A = a(seed, n, ctx);
      const B = b(seed, n, ctx);
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) Y[i] = (A[i] ?? 0) - (B[i] ?? 0);
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
