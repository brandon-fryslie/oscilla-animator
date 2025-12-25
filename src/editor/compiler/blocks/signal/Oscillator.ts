/**
 * Oscillator Block Compiler
 *
 * Generates waveforms from phase input.
 * Supports sine, cosine, triangle, and sawtooth shapes.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: Readonly<RuntimeCtx>) => A;

/**
 * Waveform shape functions
 * All take phase in [0,1] and return value in [-1,1] (before amplitude/bias)
 */
const SHAPES: Record<string, (p: number) => number> = {
  sine: (p: number) => Math.sin(p * 2 * Math.PI),
  cosine: (p: number) => Math.cos(p * 2 * Math.PI),
  triangle: (p: number) => 1 - 4 * Math.abs((p % 1) - 0.5),
  saw: (p: number) => 2 * (p % 1) - 1,
};

export const OscillatorBlock: BlockCompiler = {
  type: 'Oscillator',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
    { name: 'amplitude', type: { kind: 'Signal:number' }, required: false },
    { name: 'bias', type: { kind: 'Signal:number' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs, params }) {
    const phaseArtifact = inputs.phase;
    if (phaseArtifact === undefined || phaseArtifact.kind !== 'Signal:phase') {
      return {
        out: {
          kind: 'Error',
          message: 'Oscillator requires a Signal<phase> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as Signal<number>;

    // Shape is a param, not an input (like Shaper uses params.kind)
    const shape = typeof params.shape === 'string' ? params.shape : 'sine';
    const shapeFn = SHAPES[shape] ?? SHAPES.sine;

    const amplitudeSignal = inputs.amplitude?.kind === 'Signal:number'
      ? (inputs.amplitude.value as Signal<number>)
      : (): number => Number(params.amplitude ?? 1);
    const biasSignal = inputs.bias?.kind === 'Signal:number'
      ? (inputs.bias.value as Signal<number>)
      : (): number => Number(params.bias ?? 0);

    // Create output signal
    const signal: Signal<number> = (t: number, ctx: Readonly<RuntimeCtx>): number => {
      const phase = phaseSignal(t, ctx);
      return shapeFn(phase) * amplitudeSignal(t, ctx) + biasSignal(t, ctx);
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
