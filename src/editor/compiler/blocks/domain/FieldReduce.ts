/**
 * FieldReduce Block Compiler
 *
 * Reduces a Field<number> to a Signal<number> using an aggregation operation.
 * This is the inverse of FieldFromSignalBroadcast - it converts per-element
 * data back into a single time-varying value.
 *
 * Essential for publishing field-derived values to buses (which expect Signals).
 */

import type { BlockCompiler, Field } from '../../types';

type ReduceOp = 'avg' | 'max' | 'min' | 'sum' | 'first';

function reduceArray(values: readonly number[], op: ReduceOp): number {
  if (values.length === 0) return 0;

  switch (op) {
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'first':
      return values[0];
    default:
      return values[0];
  }
}

export const FieldReduceBlock: BlockCompiler = {
  type: 'FieldReduce',

  inputs: [
    { name: 'field', type: { kind: 'Field:number' }, required: true },
  ],

  outputs: [
    { name: 'signal', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs, params }) {
    const fieldArtifact = inputs.field;
    const op = (params.op as ReduceOp) || 'avg';

    if (!fieldArtifact || fieldArtifact.kind !== 'Field:number') {
      return {
        signal: {
          kind: 'Error',
          message: 'FieldReduce requires a Field<number> input',
        },
      };
    }

    const fieldFn = fieldArtifact.value;

    // We need a domain to evaluate the field. The field function captures its domain
    // from the upstream block that created it. We'll evaluate with a reasonable count.
    // The field function signature is: (seed, n, ctx) => readonly T[]

    // Create a signal that evaluates the field and reduces it
    // Note: At runtime, ctx contains time information
    const signalFn = (_t: number, ctx: any) => {
      // Evaluate the field - use a default seed and get all elements
      // The field has captured its domain, so n here is max elements to retrieve
      const values = fieldFn(0, 1000, ctx);
      return reduceArray(values, op);
    };

    return {
      signal: { kind: 'Signal:number', value: signalFn },
    };
  },
};
