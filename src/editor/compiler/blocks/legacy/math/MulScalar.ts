/**
 * MulScalar Block Compiler
 *
 * Multiplies two scalar numbers.
 */

import type { BlockCompiler } from '../../../types';
import { scalarNum } from '../../helpers';

export const MathMulScalarBlock: BlockCompiler = {
  type: 'math.mulScalar',
  inputs: [
    { name: 'a', type: { kind: 'Scalar:number' }, required: true },
    { name: 'b', type: { kind: 'Scalar:number' }, required: true },
  ],
  outputs: [{ name: 'out', type: { kind: 'Scalar:number' } }],

  compile({ inputs }) {
    const a = scalarNum(inputs.a, 'MulScalar.a');
    const b = scalarNum(inputs.b, 'MulScalar.b');
    return { out: { kind: 'Scalar:number', value: a * b } };
  },
};
