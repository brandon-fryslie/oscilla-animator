/**
 * ConstantFieldDuration Block Compiler
 *
 * Creates a Field<number> where all elements have the same duration value.
 */

import type { BlockCompiler, Field } from '../../../types';

export const ConstantFieldDurationBlock: BlockCompiler = {
  type: 'constantFieldDuration',
  inputs: [],
  outputs: [{ name: 'durations', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const duration = Number(params.duration ?? 1.0);

    const durations: Field<number> = (_seed, n, _ctx) => {
      const result = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        result[i] = duration;
      }
      return result;
    };

    return { durations: { kind: 'Field:number', value: durations } };
  },
};
