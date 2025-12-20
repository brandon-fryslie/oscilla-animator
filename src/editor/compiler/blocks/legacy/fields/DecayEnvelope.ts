/**
 * DecayEnvelope Block Compiler
 *
 * Generates per-element decay multipliers for amplitude reduction over time.
 * Used for wave ripple damping, liquid wobble decay, etc.
 *
 * Outputs: Field<number> of decay rate multipliers.
 */

import type { BlockCompiler, Field } from '../../../types';

// type DecayCurve = 'linear' | 'exponential' | 'easeOut' | 'sudden';

export const DecayEnvelopeBlock: BlockCompiler = {
  type: 'DecayEnvelope',
  inputs: [],
  outputs: [{ name: 'decay', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const rate = Number(params.rate ?? 1.0);
    const variation = Number(params.variation ?? 0.1);

    const decay: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        // Per-element variation in decay rate
        const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand = t - Math.floor(t);
        const varRate = rate * (1 + (rand - 0.5) * 2 * variation);

        // Store the decay rate for this element (used at runtime)
        out[i] = varRate;
      }

      return out;
    };

    return { decay: { kind: 'Field:number', value: decay } };
  },
};
