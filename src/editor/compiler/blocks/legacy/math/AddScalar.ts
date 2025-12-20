/**
 * AddScalar Block Compiler
 *
 * Adds two scalar numbers.
 */

import type { BlockCompiler } from '../../../types';
import { scalarNum } from '../../helpers';

export const MathAddScalarBlock: BlockCompiler = {
  type: 'math.addScalar',
  inputs: [
    { name: 'a', type: { kind: 'Scalar:number' }, required: true },
    { name: 'b', type: { kind: 'Scalar:number' }, required: true },
  ],
  outputs: [{ name: 'out', type: { kind: 'Scalar:number' } }],

  compile({ inputs }) {
    const a = scalarNum(inputs.a, 'AddScalar.a');
    const b = scalarNum(inputs.b, 'AddScalar.b');
    return { out: { kind: 'Scalar:number', value: a + b } };
  },
};
