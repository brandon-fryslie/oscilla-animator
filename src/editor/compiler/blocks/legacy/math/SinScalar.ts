/**
 * SinScalar Block Compiler
 *
 * Computes sine of a scalar number.
 */

import type { BlockCompiler } from '../../../types';
import { scalarNum } from '../../helpers';

export const MathSinScalarBlock: BlockCompiler = {
  type: 'math.sinScalar',
  inputs: [{ name: 'x', type: { kind: 'Scalar:number' }, required: true }],
  outputs: [{ name: 'out', type: { kind: 'Scalar:number' } }],

  compile({ inputs }) {
    const x = scalarNum(inputs.x, 'SinScalar.x');
    return { out: { kind: 'Scalar:number', value: Math.sin(x) } };
  },
};
