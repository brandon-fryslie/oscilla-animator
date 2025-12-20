/**
 * FieldToSignal Block Compiler
 *
 * Converts Field<A> to Signal<A> by freezing at compile time.
 * Note: This is a simplified adapter; full signal support needs more infrastructure.
 */

import type { BlockCompiler, Field, RuntimeCtx } from '../../../types';

export const FieldToSignalBlock: BlockCompiler = {
  type: 'FieldToSignal',
  inputs: [{ name: 'field', type: { kind: 'Field:number' }, required: true }],
  outputs: [{ name: 'signal', type: { kind: 'Signal:number' } }],

  compile({ inputs, ctx }) {
    if (inputs.field?.kind !== 'Field:number') {
      return {
        signal: { kind: 'Error', message: 'FieldToSignal: input must be Field:number' },
      };
    }

    const field = inputs.field.value as Field<number>;

    // Evaluate the field at compile time for a single element.
    // This "freezes" the field value as a constant signal.
    const values = field(42, 1, ctx);
    const value = values[0] ?? 0;

    const signal = (_tMs: number, _ctx: RuntimeCtx): number => value;

    return { signal: { kind: 'Signal:number', value: signal } };
  },
};
