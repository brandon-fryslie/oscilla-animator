/**
 * SinField Block Compiler
 *
 * Applies Math.sin element-wise to a Field<number>.
 */

import type { BlockCompiler, Field } from '../../../types';

export const SinFieldBlock: BlockCompiler = {
  type: 'sinFieldNumber',
  inputs: [{ name: 'in', type: { kind: 'Field:number' }, required: true }],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ inputs }) {
    const input = inputs.in;
    if (input.kind !== 'Field:number') {
      return { out: { kind: 'Error', message: 'sinFieldNumber: input must be Field<number>' } };
    }

    const out: Field<number> = (seed, n, ctx) => {
      const X = input.value(seed, n, ctx);
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        Y[i] = Math.sin(X[i] ?? 0);
      }
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
