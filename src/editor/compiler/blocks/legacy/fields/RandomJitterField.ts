/**
 * RandomJitterField Block Compiler
 *
 * Emits Field<number> with per-element random jitter in range [-amp, amp].
 */

import type { BlockCompiler, Field } from '../../../types';

export const RandomJitterFieldBlock: BlockCompiler = {
  type: 'randomJitterField',
  inputs: [],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const baseAmp = Number(params.amplitude ?? 0.1);
    const jitter = Number(params.jitter ?? 1);
    const amp = isFinite(baseAmp * jitter) ? Math.abs(baseAmp * jitter) : 0;

    const out: Field<number> = (seed, n) => {
      const arr = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand = t - Math.floor(t); // [0,1)
        const centered = (rand - 0.5) * 2; // [-1,1]
        arr[i] = centered * amp;
      }
      return arr;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
