/**
 * Oscillator Block Compiler
 *
 * Generates waveforms from phase input.
 * Supports sine, cosine, triangle, and sawtooth shapes.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

/**
 * Waveform shape functions
 * All take phase in [0,1] and return value in [-1,1] (before amplitude/bias)
 */
const SHAPES = {
  sine: (p: number) => Math.sin(p * 2 * Math.PI),
  cosine: (p: number) => Math.cos(p * 2 * Math.PI),
  triangle: (p: number) => 1 - 4 * Math.abs((p % 1) - 0.5),
  saw: (p: number) => 2 * (p % 1) - 1,
};

export const OscillatorBlock: BlockCompiler = {
  type: 'Oscillator',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ params, inputs }) {
    const phaseArtifact = inputs.phase;
    if (!phaseArtifact || phaseArtifact.kind !== 'Signal:phase') {
      return {
        out: {
          kind: 'Error',
          message: 'Oscillator requires a Signal<phase> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as Signal<number>;
    const shape = String(params.shape ?? 'sine');
    const amplitude = Number(params.amplitude ?? 1);
    const bias = Number(params.bias ?? 0);

    const shapeFn = SHAPES[shape as keyof typeof SHAPES] ?? SHAPES.sine;

    // Create output signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx) => {
      const phase = phaseSignal(t, ctx);
      return shapeFn(phase) * amplitude + bias;
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
