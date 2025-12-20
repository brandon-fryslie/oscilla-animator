/**
 * RandomStagger Block Compiler
 *
 * Generates random delays within a specified range.
 * Used for particle explosions, liquid drops, and other organic staggering.
 *
 * Outputs: Field<number> of delays in seconds.
 */

import type { BlockCompiler, Field } from '../../../types';

export const RandomStaggerBlock: BlockCompiler = {
  type: 'RandomStagger',
  inputs: [],
  outputs: [{ name: 'delays', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const minDelay = Number(params.minDelay ?? 0);
    const maxDelay = Number(params.maxDelay ?? 0.5);
    const distribution = (params.distribution as string) ?? 'uniform';

    const delays: Field<number> = (seed, n) => {
      const out = new Array<number>(n);
      const range = maxDelay - minDelay;

      for (let i = 0; i < n; i++) {
        // Seeded random
        const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
        let rand = t - Math.floor(t);

        // Apply distribution curve
        if (distribution === 'easeIn') {
          rand = rand * rand; // Cluster toward min
        } else if (distribution === 'easeOut') {
          rand = 1 - (1 - rand) * (1 - rand); // Cluster toward max
        } else if (distribution === 'gaussian') {
          // Box-Muller approximation for more central clustering
          const t2 = (seed * 43.758 + i * 12.989) * 78.233;
          const rand2 = t2 - Math.floor(t2);
          rand = (rand + rand2) / 2; // Simple averaging for bell-ish curve
        }

        out[i] = minDelay + rand * range;
      }

      return out;
    };

    return { delays: { kind: 'Field:number', value: delays } };
  },
};
