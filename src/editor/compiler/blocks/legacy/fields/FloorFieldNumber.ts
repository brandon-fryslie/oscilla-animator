/**
 * FloorFieldNumber Block Compiler
 *
 * Applies Math.floor element-wise to a Field<number>.
 */

import type { BlockCompiler, Field } from '../../../types';

export const FloorFieldNumberBlock: BlockCompiler = {
  type: 'floorFieldNumber',
  inputs: [{ name: 'in', type: { kind: 'Field:number' }, required: true }],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ inputs }) {
    if (inputs.in?.kind !== 'Field:number') {
      return { out: { kind: 'Error', message: 'floorFieldNumber: input must be Field<number>' } };
    }

    const input = inputs.in.value;

    const out: Field<number> = (seed, n, ctx) => {
      const X = input(seed, n, ctx);
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) Y[i] = Math.floor(X[i] ?? 0);
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
