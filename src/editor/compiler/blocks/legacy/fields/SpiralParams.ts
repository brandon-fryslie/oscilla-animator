/**
 * SpiralParams Block Compiler
 *
 * Generates per-element spiral motion parameters.
 * Used for particle behaviors with circular/spiral motion.
 *
 * Outputs: Field<SpiralConfig> with radius, frequency, phase, decay.
 */

import type { BlockCompiler } from '../../../types';

interface SpiralConfig {
  radius: number;
  frequency: number;
  phase: number;
  decay: number;
}

type SpiralField = (seed: number, n: number) => readonly SpiralConfig[];

export const SpiralParamsBlock: BlockCompiler = {
  type: 'SpiralParams',
  inputs: [],
  outputs: [{ name: 'spiral', type: { kind: 'Field:Spiral' } }],

  compile({ params }) {
    const baseRadius = Number(params.baseRadius ?? 10);
    const radiusVariation = Number(params.radiusVariation ?? 5);
    const baseFrequency = Number(params.baseFrequency ?? 2);
    const frequencyVariation = Number(params.frequencyVariation ?? 0.5);
    const decayRate = Number(params.decayRate ?? 1.5);

    const spiral: SpiralField = (seed, n) => {
      const out = new Array<SpiralConfig>(n);

      for (let i = 0; i < n; i++) {
        // Seeded random variations
        const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand1 = t1 - Math.floor(t1);
        const t2 = (seed * 43.758 + i * 12.989) * 78.233;
        const rand2 = t2 - Math.floor(t2);
        const t3 = (seed * 78.233 + i * 43.758) * 12.989;
        const rand3 = t3 - Math.floor(t3);

        out[i] = {
          radius: baseRadius + (rand1 - 0.5) * 2 * radiusVariation,
          frequency: baseFrequency + (rand2 - 0.5) * 2 * frequencyVariation,
          phase: rand3 * Math.PI * 2,
          decay: decayRate,
        };
      }

      return out;
    };

    return { spiral: { kind: 'Field:Spiral' as const, value: spiral } };
  },
};
