/**
 * LiftScalarToField Block Compiler
 *
 * Lifts a Scalar:number to Field:number (broadcasts to all elements).
 */

import type { BlockCompiler, Field } from '../../../types';
import { scalarNum } from '../../helpers';

export const LiftScalarToFieldNumberBlock: BlockCompiler = {
  type: 'lift.scalarToFieldNumber',
  inputs: [{ name: 'x', type: { kind: 'Scalar:number' }, required: false }],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ inputs, params }) {
    let x: number;
    if (inputs.x && inputs.x.kind === 'Scalar:number') {
      x = scalarNum(inputs.x, 'LiftScalarToFieldNumber.x');
    } else {
      x = Number(params?.value ?? 0);
    }

    const field: Field<number> = (_seed, n) => {
      const out = new Array<number>(n);
      for (let i = 0; i < n; i++) out[i] = x;
      return out;
    };

    return { out: { kind: 'Field:number', value: field } };
  },
};
