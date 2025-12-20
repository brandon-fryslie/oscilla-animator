/**
 * NoiseField Block Compiler
 *
 * Creates a noise-based Field<number> using seed.
 */

import type { BlockCompiler, Field } from '../../../types';

export const NoiseFieldBlock: BlockCompiler = {
  type: 'noiseField',
  inputs: [],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const amplitude = Number(params.amplitude ?? 1);
    const offset = Number(params.offset ?? 0);

    const out: Field<number> = (seed, n) => {
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        // Simple seeded pseudo-random
        const t = seed * 12.9898 + i * 78.233;
        const noise = Math.sin(t) * 43758.5453;
        Y[i] = offset + (noise - Math.floor(noise)) * amplitude;
      }
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
