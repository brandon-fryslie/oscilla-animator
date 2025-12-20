/**
 * TopDropOrigin Block Compiler
 *
 * Generates start positions above the scene for drop/fall effects.
 * Used for liquid animations where elements fall from above.
 *
 * Outputs: Field<Point> of 2D positions.
 */

import type { BlockCompiler } from '../../../types';

type Point = { x: number; y: number };
type PointField = (seed: number, n: number) => readonly Point[];

export const TopDropOriginBlock: BlockCompiler = {
  type: 'TopDropOrigin',
  inputs: [],
  outputs: [{ name: 'positions', type: { kind: 'Field:Point' } }],

  compile({ params }) {
    const sceneWidth = Number(params.sceneWidth ?? 800);
    const dropHeight = Number(params.dropHeight ?? -100);
    const xSpread = Number(params.xSpread ?? 1.0); // 1.0 = full width
    const xOffset = Number(params.xOffset ?? 0);
    const heightVariation = Number(params.heightVariation ?? 50);

    const positions: PointField = (seed, n) => {
      const out = new Array<Point>(n);
      const effectiveWidth = sceneWidth * xSpread;
      const startX = (sceneWidth - effectiveWidth) / 2 + xOffset;

      for (let i = 0; i < n; i++) {
        // Seeded random X within spread
        const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand1 = t1 - Math.floor(t1);
        const x = startX + rand1 * effectiveWidth;

        // Seeded random Y variation above scene
        const t2 = (seed * 43.758 + i * 12.989) * 78.233;
        const rand2 = t2 - Math.floor(t2);
        const y = dropHeight - rand2 * heightVariation;

        out[i] = { x, y };
      }

      return out;
    };

    return { positions: { kind: 'Field:Point', value: positions } };
  },
};
