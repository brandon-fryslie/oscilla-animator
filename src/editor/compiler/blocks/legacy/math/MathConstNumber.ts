/**
 * MathConstNumber Block Compiler
 *
 * Simple constant scalar number output.
 */

import type { BlockCompiler } from '../../../types';

export const MathConstNumberBlock: BlockCompiler = {
  type: 'math.constNumber',
  inputs: [],
  outputs: [{ name: 'out', type: { kind: 'Scalar:number' } }],

  compile({ params }) {
    const v = Number(params.value ?? 0);
    return { out: { kind: 'Scalar:number', value: v } };
  },
};
