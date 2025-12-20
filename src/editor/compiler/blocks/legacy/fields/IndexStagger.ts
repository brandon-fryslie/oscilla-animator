/**
 * IndexStagger Block Compiler
 *
 * Generates delays based purely on element index.
 * Creates sequential, predictable staggering (e.g., typewriter, line drawing).
 *
 * Outputs: Field<number> of delays in seconds.
 */

import type { BlockCompiler, Field } from '../../../types';

export const IndexStaggerBlock: BlockCompiler = {
  type: 'IndexStagger',
  inputs: [],
  outputs: [{ name: 'delays', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const delayPerElement = Number(params.delayPerElement ?? 0.1);
    const startDelay = Number(params.startDelay ?? 0);
    const reverse = Boolean(params.reverse ?? false);

    const delays: Field<number> = (_seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        const index = reverse ? (n - 1 - i) : i;
        out[i] = startDelay + index * delayPerElement;
      }

      return out;
    };

    return { delays: { kind: 'Field:number', value: delays } };
  },
};
