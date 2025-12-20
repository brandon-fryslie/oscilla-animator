/**
 * RegionField Block Compiler
 *
 * Creates a Field<vec2> of random points within a rectangular region.
 * Uses seeded randomness for deterministic results.
 */

import type { BlockCompiler, Field, Vec2 } from '../../../types';
import { createPRNG } from '../../../../../core/rand';

export const RegionFieldBlock: BlockCompiler = {
  type: 'regionField',
  inputs: [],
  outputs: [{ name: 'positions', type: { kind: 'Field:vec2' } }],

  compile({ params }) {
    // Support both 'x'/'y' (UI) and 'centerX'/'centerY' (legacy) param names
    const centerX = Number(params.x ?? params.centerX ?? 400);
    const centerY = Number(params.y ?? params.centerY ?? 300);
    const width = Number(params.width ?? 200);
    const height = Number(params.height ?? 200);

    const halfW = width / 2;
    const halfH = height / 2;

    const positions: Field<Vec2> = (seed, n, _ctx) => {
      const points: Vec2[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const rng = createPRNG(seed + i * 10007);
        points[i] = {
          x: centerX + (rng.next() * 2 - 1) * halfW,
          y: centerY + (rng.next() * 2 - 1) * halfH,
        };
      }
      return points;
    };

    return { positions: { kind: 'Field:vec2', value: positions } };
  },
};
