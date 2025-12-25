/**
 * MinSignal Block Compiler
 *
 * Component-wise minimum of two signals.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

export const MinSignalBlock: BlockCompiler = {
  type: 'MinSignal',

  inputs: [
    { name: 'a', type: { kind: 'Signal:number' }, required: true },
    { name: 'b', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }) {
    const aArtifact = inputs.a;
    const bArtifact = inputs.b;

    if (aArtifact === undefined || aArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'MinSignal requires Signal<number> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'MinSignal requires Signal<number> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<number>;
    const bSignal = bArtifact.value as Signal<number>;

    // Create min signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      return Math.min(aSignal(t, ctx), bSignal(t, ctx));
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
