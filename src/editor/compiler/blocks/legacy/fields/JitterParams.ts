/**
 * JitterParams Block Compiler
 *
 * Generates per-element jitter/shake parameters.
 * Used for glitch effects, unstable motion, nervous energy.
 *
 * Outputs: Field<JitterConfig> with amplitude, frequency, and bounds.
 */

import type { BlockCompiler } from '../../../types';

interface JitterConfig {
  amplitudeX: number;
  amplitudeY: number;
  frequency: number;
  bounded: boolean;
}

type JitterField = (seed: number, n: number) => readonly JitterConfig[];

export const JitterParamsBlock: BlockCompiler = {
  type: 'JitterParams',
  inputs: [],
  outputs: [{ name: 'jitter', type: { kind: 'Field:Jitter' } }],

  compile({ params }) {
    const baseAmplitudeX = Number(params.baseAmplitudeX ?? 5);
    const baseAmplitudeY = Number(params.baseAmplitudeY ?? 5);
    const variation = Number(params.variation ?? 0.3);
    const frequency = Number(params.frequency ?? 10);
    const bounded = Boolean(params.bounded ?? true);

    const jitter: JitterField = (seed, n) => {
      const out = new Array<JitterConfig>(n);

      for (let i = 0; i < n; i++) {
        // Seeded random variations
        const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand1 = t1 - Math.floor(t1);
        const t2 = (seed * 43.758 + i * 12.989) * 78.233;
        const rand2 = t2 - Math.floor(t2);

        out[i] = {
          amplitudeX: baseAmplitudeX * (1 + (rand1 - 0.5) * 2 * variation),
          amplitudeY: baseAmplitudeY * (1 + (rand2 - 0.5) * 2 * variation),
          frequency,
          bounded,
        };
      }

      return out;
    };

    return { jitter: { kind: 'Field:Jitter' as const, value: jitter } };
  },
};
