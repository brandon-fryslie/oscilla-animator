/**
 * GridPositions Block Compiler
 *
 * Generates positions arranged in a grid pattern.
 * Useful for structured layouts or as targets for animations.
 *
 * Outputs: Field<Point> of 2D positions.
 */

import type { BlockCompiler } from '../../../types';

type Point = { x: number; y: number };
type PointField = (seed: number, n: number) => readonly Point[];

export const GridPositionsBlock: BlockCompiler = {
  type: 'GridPositions',
  inputs: [],
  outputs: [{ name: 'positions', type: { kind: 'Field:Point' } }],

  compile({ params }) {
    const startX = Number(params.startX ?? 100);
    const startY = Number(params.startY ?? 100);
    const cellWidth = Number(params.cellWidth ?? 50);
    const cellHeight = Number(params.cellHeight ?? 50);
    const columns = Number(params.columns ?? 10);
    const jitter = Number(params.jitter ?? 0);

    const positions: PointField = (seed, n) => {
      const out = new Array<Point>(n);

      for (let i = 0; i < n; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);

        let x = startX + col * cellWidth;
        let y = startY + row * cellHeight;

        // Add jitter if specified
        if (jitter > 0) {
          const t1 = (seed * 12.9898 + i * 78.233) * 43758.5453;
          const rand1 = t1 - Math.floor(t1);
          const t2 = (seed * 43.758 + i * 12.989) * 78.233;
          const rand2 = t2 - Math.floor(t2);

          x += (rand1 - 0.5) * 2 * jitter;
          y += (rand2 - 0.5) * 2 * jitter;
        }

        out[i] = { x, y };
      }

      return out;
    };

    return { positions: { kind: 'Field:Point', value: positions } };
  },
};
