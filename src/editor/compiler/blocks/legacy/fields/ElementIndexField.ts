/**
 * ElementIndexField Block Compiler
 *
 * Emits Field<number> where each element is its index (0..n-1).
 */

import type { BlockCompiler, Field } from '../../../types';

export const ElementIndexFieldBlock: BlockCompiler = {
  type: 'elementIndexField',
  inputs: [],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile() {
    const out: Field<number> = (_seed, n) => {
      const arr = new Array<number>(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      return arr;
    };
    return { out: { kind: 'Field:number', value: out } };
  },
};
