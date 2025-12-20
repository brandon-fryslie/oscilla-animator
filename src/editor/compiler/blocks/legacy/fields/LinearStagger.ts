/**
 * LinearStagger Block Compiler
 *
 * Generates delays that increase linearly by element index.
 * Outputs: Field<number> of delays in seconds.
 */

import type { BlockCompiler, Field } from '../../../types';

export const LinearStaggerBlock: BlockCompiler = {
  type: 'LinearStagger',
  inputs: [],
  outputs: [{ name: 'delays', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const baseStagger = Number(params.baseStagger ?? 0.08);
    const jitter = Number(params.jitter ?? 0.2);

    const delays: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        const baseDelay = i * baseStagger;

        // Add jitter if specified
        let delay = baseDelay;
        if (jitter > 0) {
          const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
          const rand = t - Math.floor(t);
          delay += (rand - 0.5) * 2 * jitter * baseStagger;
        }

        out[i] = Math.max(0, delay);
      }

      return out;
    };

    return { delays: { kind: 'Field:number', value: delays } };
  },
};
