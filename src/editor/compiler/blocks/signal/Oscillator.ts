/**
 * Oscillator Block Compiler
 *
 * Generates waveforms from phase input.
 * Supports sine, cosine, triangle, and sawtooth shapes.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { OSCILLATOR_IR_INPUTS, OSCILLATOR_IR_OUTPUTS } from '../../../blocks/oscillatorSpec';
import { OpCode } from '../../ir/opcodes';

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

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower Oscillator block to IR.
 *
 * Waveform generation using sigMap with OpCode-based kernels.
 * Shape parameter is static config, amplitude and bias are inputs.
 */
const lowerOscillator: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const phase = inputsById?.phase ?? inputs[0]; // Signal:phase
  const shapeInput = inputsById?.shape ?? inputs[1]; // Scalar:waveform
  const amplitude = inputsById?.amplitude ?? inputs[2]; // Signal:number
  const bias = inputsById?.bias ?? inputs[3]; // Signal:number

  if (phase.k !== 'sig') {
    throw new Error(`Oscillator: expected sig input for phase, got ${phase.k}`);
  }
  if (shapeInput.k !== 'scalarConst') {
    throw new Error(`Oscillator: expected scalar input for shape, got ${shapeInput.k}`);
  }
  if (amplitude.k !== 'sig') {
    throw new Error(`Oscillator: expected sig input for amplitude, got ${amplitude.k}`);
  }
  if (bias.k !== 'sig') {
    throw new Error(`Oscillator: expected sig input for bias, got ${bias.k}`);
  }

  const constPool = ctx.b.getConstPool();
  const shapeValue = constPool[shapeInput.constId];
  const shape = typeof shapeValue === 'string' ? shapeValue : String(shapeValue ?? 'sine');

  // Map phase to waveform using appropriate opcode
  let waveformId: number;
  const numberType: TypeDesc = { world: 'signal', domain: 'number' };

  switch (shape) {
    case 'sine':
      // sine(phase * 2π)
      {
        const twoPI_id = ctx.b.sigConst(2 * Math.PI, numberType);
        const radians = ctx.b.sigZip(phase.id, twoPI_id, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        waveformId = ctx.b.sigMap(radians, { kind: 'opcode', opcode: OpCode.Sin }, numberType,);
      }
      break;

    case 'cosine':
      // cosine(phase * 2π)
      {
        const twoPI_id = ctx.b.sigConst(2 * Math.PI, numberType);
        const radians = ctx.b.sigZip(phase.id, twoPI_id, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        waveformId = ctx.b.sigMap(radians, { kind: 'opcode', opcode: OpCode.Cos }, numberType,);
      }
      break;

    case 'triangle':
      // triangle: 1 - 4 * abs((phase % 1) - 0.5)
      {
        const one = ctx.b.sigConst(1, numberType);
        const half = ctx.b.sigConst(0.5, numberType);
        const four = ctx.b.sigConst(4, numberType);

        // phase % 1 (fract)
        const fract_phase = ctx.b.sigMap(phase.id, { kind: 'opcode', opcode: OpCode.Fract }, numberType,);

        // (phase % 1) - 0.5
        const shifted = ctx.b.sigZip(fract_phase, half, { kind: 'opcode', opcode: OpCode.Sub }, numberType,);

        // abs((phase % 1) - 0.5)
        const abs_val = ctx.b.sigMap(shifted, { kind: 'opcode', opcode: OpCode.Abs }, numberType,);

        // 4 * abs(...)
        const scaled = ctx.b.sigZip(four, abs_val, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

        // 1 - (4 * abs(...))
        waveformId = ctx.b.sigZip(one, scaled, { kind: 'opcode', opcode: OpCode.Sub }, numberType,);
      }
      break;

    case 'saw':
      // saw: 2 * (phase % 1) - 1
      {
        const two = ctx.b.sigConst(2, numberType);
        const one = ctx.b.sigConst(1, numberType);

        // phase % 1 (fract)
        const fract_phase = ctx.b.sigMap(phase.id, { kind: 'opcode', opcode: OpCode.Fract }, numberType,);

        // 2 * (phase % 1)
        const scaled = ctx.b.sigZip(two, fract_phase, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

        // 2 * (phase % 1) - 1
        waveformId = ctx.b.sigZip(scaled, one, { kind: 'opcode', opcode: OpCode.Sub }, numberType,);
      }
      break;

    default:
      // Default to sine
      {
        const twoPI_id = ctx.b.sigConst(2 * Math.PI, numberType);
        const radians = ctx.b.sigZip(phase.id, twoPI_id, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        waveformId = ctx.b.sigMap(radians, { kind: 'opcode', opcode: OpCode.Sin }, numberType,);
      }
  }

  // Apply amplitude: waveform * amplitude
  const scaled = ctx.b.sigZip(waveformId, amplitude.id, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

  // Apply bias: (waveform * amplitude) + bias
  const output = ctx.b.sigZip(scaled, bias.id, { kind: 'opcode', opcode: OpCode.Add }, ctx.outTypes[0],);

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: output, slot } },
  };
};

// Register block type
registerBlockType({
  type: 'Oscillator',
  capability: 'pure',
  inputs: OSCILLATOR_IR_INPUTS,
  outputs: OSCILLATOR_IR_OUTPUTS,
  lower: lowerOscillator,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const OscillatorBlock: BlockCompiler = {
  type: 'Oscillator',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
    { name: 'amplitude', type: { kind: 'Signal:number' }, required: false },
    { name: 'bias', type: { kind: 'Signal:number' }, required: false },
    { name: 'shape', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }) {
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

    // Read from inputs - values come from defaultSource or explicit connections
    const shape = String((inputs.shape as any)?.value);
    const shapeFn = SHAPES[shape] || SHAPES.sine;

    const amplitudeSignal = inputs.amplitude?.kind === 'Signal:number'
      ? (inputs.amplitude.value as Signal<number>)
      : (): number => Number((inputs.amplitude as any)?.value);
    const biasSignal = inputs.bias?.kind === 'Signal:number'
      ? (inputs.bias.value as Signal<number>)
      : (): number => Number((inputs.bias as any)?.value);

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
