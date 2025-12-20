/**
 * RadialOrigin Block Compiler
 *
 * Generates start positions in a radial pattern around a center point.
 * Outputs: Field<Vec2> of positions.
 */

import type { BlockCompiler, Field, Vec2 } from '../../../types';

export const RadialOriginBlock: BlockCompiler = {
  type: 'RadialOrigin',
  inputs: [],
  outputs: [{ name: 'positions', type: { kind: 'Field:vec2' } }],

  compile({ params }) {
    const centerX = Number(params.centerX ?? 300);
    const centerY = Number(params.centerY ?? 100);
    const minRadius = Number(params.minRadius ?? 200);
    const maxRadius = Number(params.maxRadius ?? 400);
    const spread = Number(params.spread ?? 1.0);

    const positions: Field<Vec2> = (seed, n) => {
      const out = new Array<Vec2>(n);

      for (let i = 0; i < n; i++) {
        // Seeded pseudo-random for reproducibility
        const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand1 = t1 - Math.floor(t1);
        const t2 = (seed * 93.9898 + i * 47.123) * 43758.5453;
        const rand2 = t2 - Math.floor(t2);

        const angle = rand1 * Math.PI * 2 * spread;
        const radius = minRadius + rand2 * (maxRadius - minRadius);

        out[i] = {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      }

      return out;
    };

    return { positions: { kind: 'Field:vec2', value: positions } };
  },
};
