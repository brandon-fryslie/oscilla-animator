/**
 * StaggerField Block Compiler
 *
 * Creates a staggered delay Field<number> based on index.
 */

import type { BlockCompiler, Field } from '../../../types';

export const StaggerFieldBlock: BlockCompiler = {
  type: 'staggerField',
  inputs: [],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const delay = Number(params.delay ?? 0.05);
    const offset = Number(params.offset ?? 0);

    const out: Field<number> = (_seed, n) => {
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) Y[i] = offset + i * delay;
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
