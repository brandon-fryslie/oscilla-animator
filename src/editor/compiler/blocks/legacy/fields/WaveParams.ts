/**
 * WaveParams Block Compiler
 *
 * Generates per-element wave motion parameters.
 * Used for wave ripple effects with propagating sinusoidal motion.
 *
 * Outputs: Field<WaveConfig> with amplitude, frequency, phase based on index.
 */

import type { BlockCompiler } from '../../../types';

interface WaveConfig {
  amplitudeY: number;
  amplitudeScale: number;
  amplitudeRotation: number;
  frequency: number;
  phase: number;
  decay: number;
}

type WaveField = (seed: number, n: number) => readonly WaveConfig[];

export const WaveParamsBlock: BlockCompiler = {
  type: 'WaveParams',
  inputs: [],
  outputs: [{ name: 'wave', type: { kind: 'Field:Wave' } }],

  compile({ params }) {
    const amplitudeY = Number(params.amplitudeY ?? 35);
    const amplitudeScale = Number(params.amplitudeScale ?? 0.25);
    const amplitudeRotation = Number(params.amplitudeRotation ?? 15);
    const frequencyMultiplier = Number(params.frequencyMultiplier ?? 4);
    const waveCycles = Number(params.waveCycles ?? 3);
    const decayRate = Number(params.decayRate ?? 1);

    const wave: WaveField = (_seed, n) => {
      const out = new Array<WaveConfig>(n);

      for (let i = 0; i < n; i++) {
        // Phase based on index - creates wave propagation across elements
        const indexPhase = (i / Math.max(1, n - 1)) * Math.PI * 2 * waveCycles;

        out[i] = {
          amplitudeY,
          amplitudeScale,
          amplitudeRotation,
          frequency: frequencyMultiplier,
          phase: indexPhase,
          decay: decayRate,
        };
      }

      return out;
    };

    return { wave: { kind: 'Field:Wave' as const, value: wave } };
  },
};
