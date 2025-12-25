/**
 * Shaper Block Compiler
 *
 * Applies waveshaping functions to transform signal values.
 * Useful for softening edges, creating breathing curves, etc.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

/**
 * Waveshaping functions
 */
function getShaper(kind: string, amount: number): (x: number) => number {
  switch (kind) {
    case 'tanh':
      return (x: number): number => Math.tanh(x * amount);

    case 'softclip':
      return (x: number): number => x / (1 + Math.abs(x * amount));

    case 'sigmoid':
      return (x: number): number => 1 / (1 + Math.exp(-x * amount));

    case 'smoothstep': {
      // Smoothstep expects input in [0,1], so normalize first
      return (x: number): number => {
        const t = Math.max(0, Math.min(1, x));
        return t * t * (3 - 2 * t);
      };
    }

    case 'pow':
      return (x: number): number => Math.sign(x) * Math.pow(Math.abs(x), amount);

    default:
      return (x: number): number => x; // identity
  }
}

export const ShaperBlock: BlockCompiler = {
  type: 'Shaper',

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
          message: 'Shaper requires a Signal<number> input',
        },
      };
    }

    const inputSignal = inputArtifact.value as Signal<number>;
    const kind = typeof params.kind === 'string' ? params.kind : 'smoothstep';
    const amount = Number(params.amount ?? 1);

    const shapeFn = getShaper(kind, amount);

    // Create shaped signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const value = inputSignal(t, ctx);
      return shapeFn(value);
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
