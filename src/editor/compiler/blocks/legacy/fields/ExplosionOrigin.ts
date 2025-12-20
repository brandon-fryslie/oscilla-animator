/**
 * ExplosionOrigin Block Compiler
 *
 * Generates start positions radiating outward from a center point.
 * Used for particle explosion effects where elements fly in from all directions.
 *
 * Outputs: Field<Point> of 2D positions.
 */

import type { BlockCompiler } from '../../../types';

type Point = { x: number; y: number };
type PointField = (seed: number, n: number) => readonly Point[];

export const ExplosionOriginBlock: BlockCompiler = {
  type: 'ExplosionOrigin',
  inputs: [],
  outputs: [{ name: 'positions', type: { kind: 'Field:Point' } }],

  compile({ params }) {
    const centerX = Number(params.centerX ?? 400);
    const centerY = Number(params.centerY ?? 300);
    const minDistance = Number(params.minDistance ?? 200);
    const maxDistance = Number(params.maxDistance ?? 600);
    const angleSpread = Number(params.angleSpread ?? 360); // degrees
    const startAngle = Number(params.startAngle ?? 0); // degrees

    const positions: PointField = (seed, n) => {
      const out = new Array<Point>(n);
      const spreadRad = (angleSpread * Math.PI) / 180;
      const startRad = (startAngle * Math.PI) / 180;

      for (let i = 0; i < n; i++) {
        // Seeded random angle
        const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
        const rand1 = t1 - Math.floor(t1);
        const angle = startRad + rand1 * spreadRad;

        // Seeded random distance
        const t2 = (seed * 43.758 + i * 12.989) * 78.233;
        const rand2 = t2 - Math.floor(t2);
        const distance = minDistance + rand2 * (maxDistance - minDistance);

        out[i] = {
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
        };
      }

      return out;
    };

    return { positions: { kind: 'Field:Point', value: positions } };
  },
};
