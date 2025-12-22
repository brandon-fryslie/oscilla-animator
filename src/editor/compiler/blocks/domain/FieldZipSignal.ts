/**
 * FieldZipSignal Block Compiler
 *
 * Combines a Field<number> with a Signal<number> using a binary operation.
 * The signal is evaluated once per frame and the operation is applied to each element.
 */

import type { BlockCompiler, Field } from '../../types';

/**
 * Get the binary operation by name
 */
function getZipOperation(fn: string): (a: number, b: number) => number {
  switch (fn) {
    case 'add':
      return (a, b) => a + b;
    case 'sub':
      return (a, b) => a - b;
    case 'mul':
      return (a, b) => a * b;
    case 'min':
      return (a, b) => Math.min(a, b);
    case 'max':
      return (a, b) => Math.max(a, b);
    default:
      return (a, _b) => a; // default to first (field value)
  }
}

export const FieldZipSignalBlock: BlockCompiler = {
  type: 'FieldZipSignal',

  inputs: [
    { name: 'field', type: { kind: 'Field:number' }, required: true },
    { name: 'signal', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const fieldArtifact = inputs.field;
    const signalArtifact = inputs.signal;

    if (!fieldArtifact || fieldArtifact.kind !== 'Field:number') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipSignal requires a Field<number> for field input',
        },
      };
    }

    if (!signalArtifact || signalArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipSignal requires a Signal<number> for signal input',
        },
      };
    }

    const fieldFn = fieldArtifact.value;
    const signalFn = signalArtifact.value;
    const fn = String(params.fn ?? 'add');
    const zipOp = getZipOperation(fn);

    // Create combined field
    // Note: ctx is typed as CompileCtx but at runtime contains time information
    const combinedField: Field<number> = (seed, n, ctx) => {
      // Evaluate field to get per-element values
      const fieldValues = fieldFn(seed, n, ctx);

      // Evaluate signal once for this frame (ctx is extended with .t at runtime)
      const signalValue = signalFn((ctx as any).t, ctx as any);

      // Apply operation to each element
      const out = new Array<number>(fieldValues.length);
      for (let i = 0; i < fieldValues.length; i++) {
        out[i] = zipOp(fieldValues[i], signalValue);
      }

      return out;
    };

    return {
      out: { kind: 'Field:number', value: combinedField },
    };
  },
};
