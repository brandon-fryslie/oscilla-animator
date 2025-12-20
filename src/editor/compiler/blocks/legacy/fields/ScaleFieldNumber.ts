/**
 * ScaleFieldNumber Block Compiler
 *
 * Multiplies a Field<number> by a scalar value.
 */

import type { BlockCompiler, Field } from '../../../types';

export const ScaleFieldNumberBlock: BlockCompiler = {
  type: 'scaleFieldNumber',
  inputs: [
    { name: 'field', type: { kind: 'Field:number' }, required: true },
    { name: 'scale', type: { kind: 'Scalar:number' }, required: false },
  ],
  outputs: [{ name: 'out', type: { kind: 'Field:number' } }],

  compile({ params, inputs }) {
    const field = inputs.field;

    if (field.kind !== 'Field:number') {
      return {
        out: { kind: 'Error', message: 'scaleFieldNumber: field must be Field:number' },
      };
    }

    // Scale from input or params
    const scale =
      inputs.scale?.kind === 'Scalar:number'
        ? inputs.scale.value
        : Number(params.scale ?? 1);

    const out: Field<number> = (seed, n, ctx) => {
      const F = field.value(seed, n, ctx);
      const Y = new Array<number>(n);
      for (let i = 0; i < n; i++) Y[i] = (F[i] ?? 0) * scale;
      return Y;
    };

    return { out: { kind: 'Field:number', value: out } };
  },
};
