/**
 * FieldMapNumber Block Compiler
 *
 * Applies a unary function to each element of a numeric Field.
 * Supports various math functions and transformations.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';

/**
 * Smoothstep interpolation
 */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Get the unary function by name
 */
function getMapFunction(
  fn: string,
  k: number,
  a: number,
  b: number
): (x: number) => number {
  switch (fn) {
    case 'neg':
      return (x) => -x;
    case 'abs':
      return (x) => Math.abs(x);
    case 'sin':
      return (x) => Math.sin(x * k);
    case 'cos':
      return (x) => Math.cos(x * k);
    case 'tanh':
      return (x) => Math.tanh(x * k);
    case 'smoothstep':
      return (x) => smoothstep((x - a) / (b - a));
    case 'scale':
      return (x) => x * k;
    case 'offset':
      return (x) => x + k;
    case 'clamp':
      return (x) => Math.max(a, Math.min(b, x));
    default:
      return (x) => x; // identity
  }
}

export const FieldMapNumberBlock: BlockCompiler = {
  type: 'FieldMapNumber',

  inputs: [
    { name: 'x', type: { kind: 'Field:number' }, required: true },
  ],

  outputs: [
    { name: 'y', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const inputField = inputs.x;
    if (!isDefined(inputField) || inputField.kind !== 'Field:number') {
      return {
        y: {
          kind: 'Error',
          message: 'FieldMapNumber requires a Field<number> input',
        },
      };
    }

    const fn = typeof params.fn === 'string' ? params.fn : 'sin';
    const k = Number(params.k ?? 1);
    const a = Number(params.a ?? 0);
    const b = Number(params.b ?? 1);

    const inputFieldFn = inputField.value;
    const mapFn = getMapFunction(fn, k, a, b);

    // Create mapped field
    const field: Field<number> = (seed, n, ctx) => {
      const inputValues = inputFieldFn(seed, n, ctx);
      return inputValues.map(mapFn);
    };

    return {
      y: { kind: 'Field:number', value: field },
    };
  },
};
