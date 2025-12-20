/**
 * WobbleParams Block Compiler
 *
 * Generates per-element wobble behavior parameters.
 * Used for liquid animations with organic, decaying oscillation.
 *
 * Outputs: Field<WobbleConfig> with amplitude, frequency, phase, decay.
 */

import type { BlockCompiler } from '../../../types';

interface WobbleConfig {
  amplitude: number;
  frequency: number;
  phase: number;
  decay: number;
}

type WobbleField = (seed: number, n: number) => readonly WobbleConfig[];

export const WobbleParamsBlock: BlockCompiler = {
  type: 'WobbleParams',
  inputs: [],
  outputs: [{ name: 'wobble', type: { kind: 'Field:Wobble' } }],

  compile({ params }) {
    const baseAmplitude = Number(params.baseAmplitude ?? 5);
    const amplitudeVariation = Number(params.amplitudeVariation ?? 2);
    const baseFrequency = Number(params.baseFrequency ?? 3);
    const frequencyVariation = Number(params.frequencyVariation ?? 1);
    const decayRate = Number(params.decayRate ?? 2);
    const decayVariation = Number(params.decayVariation ?? 0.5);

    const wobble: WobbleField = (seed, n) => {
      const out = new Array<WobbleConfig>(n);

      for (let i = 0; i < n; i++) {
        // Seeded random variations
        const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand1 = t1 - Math.floor(t1);
        const t2 = (seed * 43.758 + i * 12.989) * 78.233;
        const rand2 = t2 - Math.floor(t2);
        const t3 = (seed * 78.233 + i * 43.758) * 12.989;
        const rand3 = t3 - Math.floor(t3);
        const t4 = (seed * 12.989 + i * 78.233) * 43.758;
        const rand4 = t4 - Math.floor(t4);

        out[i] = {
          amplitude: baseAmplitude + (rand1 - 0.5) * 2 * amplitudeVariation,
          frequency: baseFrequency + (rand2 - 0.5) * 2 * frequencyVariation,
          phase: rand3 * Math.PI * 2, // Random phase 0-2π
          decay: decayRate + (rand4 - 0.5) * 2 * decayVariation,
        };
      }

      return out;
    };

    return { wobble: { kind: 'Field:Wobble' as const, value: wobble } };
  },
};
