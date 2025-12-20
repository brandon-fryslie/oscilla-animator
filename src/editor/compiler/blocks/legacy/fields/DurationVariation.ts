/**
 * DurationVariation Block Compiler
 *
 * Generates per-element durations with optional variation.
 * Used when elements should animate at different speeds.
 *
 * Outputs: Field<number> of durations in seconds.
 */

import type { BlockCompiler, Field } from '../../../types';

export const DurationVariationBlock: BlockCompiler = {
  type: 'DurationVariation',
  inputs: [],
  outputs: [{ name: 'durations', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const baseDuration = Number(params.baseDuration ?? 1.0);
    const variation = Number(params.variation ?? 0.2);
    const minDuration = Number(params.minDuration ?? 0.1);

    const durations: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        // Seeded random variation
        const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand = t - Math.floor(t);
        const varAmount = (rand - 0.5) * 2 * variation * baseDuration;

        out[i] = Math.max(minDuration, baseDuration + varAmount);
      }

      return out;
    };

    return { durations: { kind: 'Field:number', value: durations } };
  },
};
