/**
 * SizeVariation Block Compiler
 *
 * Generates per-element size multipliers for varied/procedural animations.
 * Supports uniform, random, and distance-based size distributions.
 *
 * Outputs: Field<number> of size multipliers (1.0 = base size).
 */

import type { BlockCompiler, Field } from '../../../types';

type SizeMode = 'uniform' | 'random' | 'distanceFade' | 'pulse';

export const SizeVariationBlock: BlockCompiler = {
  type: 'SizeVariation',
  inputs: [],
  outputs: [{ name: 'sizes', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const mode = (params.mode as SizeMode) ?? 'random';
    const baseSize = Number(params.baseSize ?? 1.0);
    const variation = Number(params.variation ?? 0.5);
    const minSize = Number(params.minSize ?? 0.3);
    const maxSize = Number(params.maxSize ?? 2.0);

    const sizes: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        let size: number;

        switch (mode) {
          case 'uniform':
            // All elements same size
            size = baseSize;
            break;

          case 'random': {
            // Random sizes within variation range
            const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
            const rand = t - Math.floor(t);
            size = baseSize + (rand - 0.5) * 2 * variation;
            break;
          }

          case 'distanceFade': {
            // Size decreases with element index (distant = smaller)
            const u = n > 1 ? i / (n - 1) : 0;
            size = baseSize * (1 - u * variation);
            break;
          }

          case 'pulse': {
            // Size varies in wave pattern across elements
            const u = n > 1 ? i / (n - 1) : 0;
            const wave = Math.sin(u * Math.PI * 2) * variation;
            size = baseSize + wave;
            break;
          }

          default:
            size = baseSize;
        }

        // Clamp to valid range
        out[i] = Math.max(minSize, Math.min(maxSize, size));
      }

      return out;
    };

    return { sizes: { kind: 'Field:number', value: sizes } };
  },
};
