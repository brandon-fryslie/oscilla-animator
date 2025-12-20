/**
 * MakePointField Block Compiler
 *
 * Combines two Field<number> (x and y) into a Field<Point>.
 */

import type { BlockCompiler, Field } from '../../../types';

export const MakePointFieldBlock: BlockCompiler = {
  type: 'makePointField',
  inputs: [
    { name: 'x', type: { kind: 'Field:number' }, required: true },
    { name: 'y', type: { kind: 'Field:number' }, required: true },
  ],
  outputs: [{ name: 'out', type: { kind: 'Field<Point>' } }],

  compile({ inputs }) {
    if (inputs.x?.kind !== 'Field:number' || inputs.y?.kind !== 'Field:number') {
      return { out: { kind: 'Error', message: 'makePointField: inputs must be Field<number>' } };
    }

    const fx = inputs.x.value;
    const fy = inputs.y.value;

    const out: Field<{ x: number; y: number }> = (seed, n, ctx) => {
      const X = fx(seed, n, ctx);
      const Y = fy(seed, n, ctx);
      const pts = new Array<{ x: number; y: number }>(n);
      for (let i = 0; i < n; i++) pts[i] = { x: X[i] ?? 0, y: Y[i] ?? 0 };
      return pts;
    };

    return { out: { kind: 'Field<Point>', value: out } };
  },
};
