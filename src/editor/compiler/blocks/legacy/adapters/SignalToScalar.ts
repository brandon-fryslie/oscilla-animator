/**
 * SignalToScalar Block Compiler
 *
 * Converts a Signal:number into a Scalar:number by sampling at t=0.
 * Useful for bridging world differences when a block expects a scalar.
 */

import type { BlockCompiler, RuntimeCtx } from '../../../types';

export const SignalToScalarNumberBlock: BlockCompiler = {
  type: 'signalToScalarNumber',
  inputs: [{ name: 'signal', type: { kind: 'Signal:number' }, required: true }],
  outputs: [{ name: 'scalar', type: { kind: 'Scalar:number' } }],

  compile({ inputs }) {
    if (inputs.signal?.kind !== 'Signal:number') {
      return {
        scalar: { kind: 'Error', message: 'SignalToScalar: input must be Signal:number' },
      };
    }

    const sig = inputs.signal.value as (t: number, ctx: RuntimeCtx) => number;
    const value = sig(0, { viewport: { w: 0, h: 0, dpr: 1 } });

    return { scalar: { kind: 'Scalar:number', value } };
  },
};
