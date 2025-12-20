/**
 * ScaleField Block Compiler
 *
 * Generates per-element scale values.
 * Used for kinetic entrance/exit, 3D transforms, emphasis effects.
 *
 * Outputs: Field<number> of scale multipliers.
 */

import type { BlockCompiler, Field } from '../../../types';

type ScaleMode = 'constant' | 'random' | 'progressive' | 'alternating';

export const ScaleFieldBlock: BlockCompiler = {
  type: 'ScaleField',
  inputs: [],
  outputs: [{ name: 'scales', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const mode = (params.mode as ScaleMode) ?? 'constant';
    const baseScale = Number(params.baseScale ?? 1.0);
    const variation = Number(params.variation ?? 0.3);
    const minScale = Number(params.minScale ?? 0.1);
    const maxScale = Number(params.maxScale ?? 2.0);

    const scales: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        let scale: number;

        switch (mode) {
          case 'constant':
            scale = baseScale;
            break;

          case 'random': {
            const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
            const rand = t - Math.floor(t);
            scale = baseScale + (rand - 0.5) * 2 * variation;
            break;
          }

          case 'progressive': {
            // Scale increases with index
            const u = n > 1 ? i / (n - 1) : 0;
            scale = minScale + u * (maxScale - minScale);
            break;
          }

          case 'alternating': {
            // Alternate between two scales
            scale = i % 2 === 0 ? baseScale : baseScale * (1 - variation);
            break;
          }

          default:
            scale = baseScale;
        }

        // Clamp to valid range
        out[i] = Math.max(minScale, Math.min(maxScale, scale));
      }

      return out;
    };

    return { scales: { kind: 'Field:number', value: scales } };
  },
};
