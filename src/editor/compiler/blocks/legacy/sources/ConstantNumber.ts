/**
 * ConstantNumber Block Compiler
 *
 * Outputs a constant scalar number and its lifted Field form.
 */

import type { BlockCompiler, Field } from '../../../types';

export const ConstantNumberBlock: BlockCompiler = {
  type: 'constNumber',
  inputs: [],
  outputs: [
    { name: 'scalar', type: { kind: 'Scalar:number' } },
    { name: 'field', type: { kind: 'Field:number' } },
  ],

  compile({ params }) {
    const v = Number(params.value ?? 0);
    const f: Field<number> = (_seed, n) => {
      const out = new Array<number>(n);
      for (let i = 0; i < n; i++) out[i] = v;
      return out;
    };
    return {
      scalar: { kind: 'Scalar:number', value: v },
      field: { kind: 'Field:number', value: f },
    };
  },
};
