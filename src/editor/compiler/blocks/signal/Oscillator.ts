/**
 * Oscillator Block Compiler
 *
 * Generates waveforms from phase input.
 * Supports sine, cosine, triangle, and sawtooth shapes.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';
import { OSCILLATOR_IR_INPUTS, OSCILLATOR_IR_OUTPUTS } from '../../../blocks/oscillatorSpec';
import { OpCode } from '../../ir/opcodes';

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
  const amplitude = inputsById?.amplitude ?? inputs[2]; // Signal:float
  const bias = inputsById?.bias ?? inputs[3]; // Signal:float

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
  const shape = typeof shapeValue === 'string' ? shapeValue : 'sine';

  // Map phase to waveform using appropriate opcode
  let waveformId: number;
  const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };

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

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'Oscillator_out');
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
