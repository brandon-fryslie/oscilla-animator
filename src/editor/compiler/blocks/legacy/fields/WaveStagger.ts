/**
 * WaveStagger Block Compiler
 *
 * Generates delays using a wave-based pattern.
 * Creates smooth, organic staggering effects for "varied" and "procedural" styles.
 *
 * Outputs: Field<number> of delays in seconds.
 */

import type { BlockCompiler, Field } from '../../../types';

export const WaveStaggerBlock: BlockCompiler = {
  type: 'WaveStagger',
  inputs: [],
  outputs: [{ name: 'delays', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const frequency = Number(params.frequency ?? 1.0);
    const amplitude = Number(params.amplitude ?? 0.3);
    const baseDelay = Number(params.baseDelay ?? 0.5);
    const phase = Number(params.phase ?? 0);
    const jitter = Number(params.jitter ?? 0.1);

    const delays: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        // Normalized position [0, 1]
        const u = n > 1 ? i / (n - 1) : 0;

        // Wave component: sin wave creates smooth organic staggering
        const wave = Math.sin(u * Math.PI * 2 * frequency + phase) * amplitude;

        // Add seeded random jitter
        let jitterValue = 0;
        if (jitter > 0) {
          const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
          const rand = t - Math.floor(t);
          jitterValue = (rand - 0.5) * 2 * jitter;
        }

        out[i] = Math.max(0, baseDelay + wave + jitterValue);
      }

      return out;
    };

    return { delays: { kind: 'Field:number', value: delays } };
  },
};
