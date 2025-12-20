/**
 * OpacityField Block Compiler
 *
 * Generates per-element opacity values.
 * Used for fade effects, depth cues, and variation.
 *
 * Outputs: Field<number> of opacity values (0-1).
 */

import type { BlockCompiler, Field } from '../../../types';

type OpacityMode = 'constant' | 'random' | 'fadeByIndex' | 'pulse';

export const OpacityFieldBlock: BlockCompiler = {
  type: 'OpacityField',
  inputs: [],
  outputs: [{ name: 'opacities', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const mode = (params.mode as OpacityMode) ?? 'constant';
    const baseOpacity = Number(params.baseOpacity ?? 1.0);
    const variation = Number(params.variation ?? 0.3);
    const minOpacity = Number(params.minOpacity ?? 0.1);

    const opacities: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        let opacity: number;

        switch (mode) {
          case 'constant':
            opacity = baseOpacity;
            break;

          case 'random': {
            const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
            const rand = t - Math.floor(t);
            opacity = baseOpacity - rand * variation;
            break;
          }

          case 'fadeByIndex': {
            // Opacity decreases with index (later elements more transparent)
            const u = n > 1 ? i / (n - 1) : 0;
            opacity = baseOpacity - u * variation;
            break;
          }

          case 'pulse': {
            // Sinusoidal variation
            const u = n > 1 ? i / (n - 1) : 0;
            const wave = Math.sin(u * Math.PI * 2) * variation * 0.5;
            opacity = baseOpacity + wave;
            break;
          }

          default:
            opacity = baseOpacity;
        }

        // Clamp to valid range
        out[i] = Math.max(minOpacity, Math.min(1.0, opacity));
      }

      return out;
    };

    return { opacities: { kind: 'Field:number', value: opacities } };
  },
};
