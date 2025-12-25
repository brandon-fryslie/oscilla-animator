/**
 * ClampSignal Block Compiler
 *
 * Clamps signal values to a specified range.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

export const ClampSignalBlock: BlockCompiler = {
  type: 'ClampSignal',

  inputs: [
    { name: 'in', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ params, inputs }) {
    const inputArtifact = inputs.in;
    if (inputArtifact === undefined || inputArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'ClampSignal requires a Signal<number> input',
        },
      };
    }

    const inputSignal = inputArtifact.value as Signal<number>;
    const min = Number(params.min ?? 0);
    const max = Number(params.max ?? 1);

    // Create clamped signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const value = inputSignal(t, ctx);
      return Math.max(min, Math.min(max, value));
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
