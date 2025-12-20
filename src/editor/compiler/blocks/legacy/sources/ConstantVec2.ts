/**
 * ConstantVec2 Block Compiler
 *
 * Outputs a constant Vec2 and its lifted Field form.
 */

import type { BlockCompiler, Field, Vec2 } from '../../../types';

export const ConstantVec2Block: BlockCompiler = {
  type: 'constVec2',
  inputs: [],
  outputs: [
    { name: 'scalar', type: { kind: 'Scalar:vec2' } },
    { name: 'field', type: { kind: 'Field:vec2' } },
  ],

  compile({ params }) {
    const x = Number(params.x ?? 0);
    const y = Number(params.y ?? 0);
    const v: Vec2 = { x, y };
    const f: Field<Vec2> = (_seed, n) => {
      const out = new Array<Vec2>(n);
      for (let i = 0; i < n; i++) out[i] = v;
      return out;
    };
    return {
      scalar: { kind: 'Scalar:vec2', value: v },
      field: { kind: 'Field:vec2', value: f },
    };
  },
};
