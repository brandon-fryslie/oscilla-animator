/**
 * CenterPoint Block Compiler
 *
 * Outputs a constant center point for all elements.
 * Used as a convergence target or reference point.
 *
 * Outputs: Field<Point> where all elements have the same position.
 */

import type { BlockCompiler } from '../../../types';

type Point = { x: number; y: number };
type PointField = (seed: number, n: number) => readonly Point[];

export const CenterPointBlock: BlockCompiler = {
  type: 'CenterPoint',
  inputs: [],
  outputs: [{ name: 'position', type: { kind: 'Field:Point' } }],

  compile({ params }) {
    const x = Number(params.x ?? 400);
    const y = Number(params.y ?? 300);

    const position: PointField = (_seed, n) => {
      const out = new Array<Point>(n);
      const center = { x, y };

      for (let i = 0; i < n; i++) {
        out[i] = center;
      }

      return out;
    };

    return { position: { kind: 'Field:Point', value: position } };
  },
};
