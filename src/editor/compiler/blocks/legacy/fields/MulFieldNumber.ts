/**
 * MulFieldNumber Block Compiler
 *
 * Multiplies two Field<number> element-wise.
 */

import type { BlockCompiler, Field } from '../../../types';

export const MulFieldNumberBlock: BlockCompiler = {
  type: 'mulFieldNumber',
  inputs: [
    { name: 'a', type: { kind: 'Field:number' }, required: true },
    { name: 'b', type: { kind: 'Field:number' }, required: true },
  ],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ inputs }) {
    const a = inputs.a;
    const b = inputs.b;

    if (a.kind !== 'Field:number' || b.kind !== 'Field:number') {
      return {
        out: { kind: 'Error', message: 'mulFieldNumber: inputs must be Field:number' },
      };
    }

    const out: Field<number> = (seed, n, ctx) => {
      const A = a.value(seed, n, ctx);
      const B = b.value(seed, n, ctx);
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) Y[i] = (A[i] ?? 0) * (B[i] ?? 0);
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
