/**
 * MaxSignal Block Compiler
 *
 * Component-wise maximum of two signals.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

export const MaxSignalBlock: BlockCompiler = {
  type: 'MaxSignal',

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

    if (!aArtifact || aArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'MaxSignal requires Signal<number> for input A',
        },
      };
    }

    if (!bArtifact || bArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'MaxSignal requires Signal<number> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<number>;
    const bSignal = bArtifact.value as Signal<number>;

    // Create max signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx) => {
      return Math.max(aSignal(t, ctx), bSignal(t, ctx));
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
