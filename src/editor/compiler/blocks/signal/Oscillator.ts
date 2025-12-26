/**
 * Oscillator Block Compiler
 *
 * Generates waveforms from phase input.
 * Supports sine, cosine, triangle, and sawtooth shapes.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import { registerBlockType } from '../../ir/lowerTypes';
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
const lowerOscillator: BlockLowerFn = ({ ctx, inputs, config }) => {
  const phase = inputs[0]; // Signal:phase
  const amplitude = inputs[1]; // Signal:number (optional, defaultSource provides 1)
  const bias = inputs[2]; // Signal:number (optional, defaultSource provides 0)

  if (phase.k !== 'sig') {
    throw new Error(`Oscillator: expected sig input for phase, got ${phase.k}`);
  }
  if (amplitude.k !== 'sig') {
    throw new Error(`Oscillator: expected sig input for amplitude, got ${amplitude.k}`);
  }
  if (bias.k !== 'sig') {
    throw new Error(`Oscillator: expected sig input for bias, got ${bias.k}`);
  }

  const shape = (config as any)?.shape || 'sine';

  // Map phase to waveform using appropriate opcode
  let waveformId: number;
  const phaseType = ctx.inTypes[0];
  const numberType: any = { world: 'signal', domain: 'number' };

  switch (shape) {
    case 'sine':
      // sine(phase * 2π)
      {
        const twoPI = ctx.b.allocConstId(2 * Math.PI);
        const twoPI_id = ctx.b.sigConst(2 * Math.PI, numberType);
        const radians = ctx.b.sigZip(phase.id, twoPI_id, {
          fnId: 'mul',
          opcode: OpCode.Mul,
          outputType: numberType,
        });
        waveformId = ctx.b.sigMap(radians, {
          fnId: 'sin',
          opcode: OpCode.Sin,
          outputType: numberType,
        });
      }
      break;

    case 'cosine':
      // cosine(phase * 2π)
      {
        const twoPI_id = ctx.b.sigConst(2 * Math.PI, numberType);
        const radians = ctx.b.sigZip(phase.id, twoPI_id, {
          fnId: 'mul',
          opcode: OpCode.Mul,
          outputType: numberType,
        });
        waveformId = ctx.b.sigMap(radians, {
          fnId: 'cos',
          opcode: OpCode.Cos,
          outputType: numberType,
        });
      }
      break;

    case 'triangle':
      // triangle: 1 - 4 * abs((phase % 1) - 0.5)
      {
        const one = ctx.b.sigConst(1, numberType);
        const half = ctx.b.sigConst(0.5, numberType);
        const four = ctx.b.sigConst(4, numberType);

        // phase % 1 (fract)
        const fract_phase = ctx.b.sigMap(phase.id, {
          fnId: 'fract',
          opcode: OpCode.Fract,
          outputType: numberType,
        });

        // (phase % 1) - 0.5
        const shifted = ctx.b.sigZip(fract_phase, half, {
          fnId: 'sub',
          opcode: OpCode.Sub,
          outputType: numberType,
        });

        // abs((phase % 1) - 0.5)
        const abs_val = ctx.b.sigMap(shifted, {
          fnId: 'abs',
          opcode: OpCode.Abs,
          outputType: numberType,
        });

        // 4 * abs(...)
        const scaled = ctx.b.sigZip(four, abs_val, {
          fnId: 'mul',
          opcode: OpCode.Mul,
          outputType: numberType,
        });

        // 1 - (4 * abs(...))
        waveformId = ctx.b.sigZip(one, scaled, {
          fnId: 'sub',
          opcode: OpCode.Sub,
          outputType: numberType,
        });
      }
      break;

    case 'saw':
      // saw: 2 * (phase % 1) - 1
      {
        const two = ctx.b.sigConst(2, numberType);
        const one = ctx.b.sigConst(1, numberType);

        // phase % 1 (fract)
        const fract_phase = ctx.b.sigMap(phase.id, {
          fnId: 'fract',
          opcode: OpCode.Fract,
          outputType: numberType,
        });

        // 2 * (phase % 1)
        const scaled = ctx.b.sigZip(two, fract_phase, {
          fnId: 'mul',
          opcode: OpCode.Mul,
          outputType: numberType,
        });

        // 2 * (phase % 1) - 1
        waveformId = ctx.b.sigZip(scaled, one, {
          fnId: 'sub',
          opcode: OpCode.Sub,
          outputType: numberType,
        });
      }
      break;

    default:
      // Default to sine
      {
        const twoPI_id = ctx.b.sigConst(2 * Math.PI, numberType);
        const radians = ctx.b.sigZip(phase.id, twoPI_id, {
          fnId: 'mul',
          opcode: OpCode.Mul,
          outputType: numberType,
        });
        waveformId = ctx.b.sigMap(radians, {
          fnId: 'sin',
          opcode: OpCode.Sin,
          outputType: numberType,
        });
      }
  }

  // Apply amplitude: waveform * amplitude
  const scaled = ctx.b.sigZip(waveformId, amplitude.id, {
    fnId: 'mul',
    opcode: OpCode.Mul,
    outputType: numberType,
  });

  // Apply bias: (waveform * amplitude) + bias
  const output = ctx.b.sigZip(scaled, bias.id, {
    fnId: 'add',
    opcode: OpCode.Add,
    outputType: ctx.outTypes[0],
  });

  return {
    outputs: [{ k: 'sig', id: output }],
  };
};

// Register block type
registerBlockType({
  type: 'Oscillator',
  capability: 'pure',
  inputs: [
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: 'signal', domain: 'phase01' },
    },
    {
      portId: 'amplitude',
      label: 'Amplitude',
      dir: 'in',
      type: { world: 'signal', domain: 'number' },
      optional: true,
    },
    {
      portId: 'bias',
      label: 'Bias',
      dir: 'in',
      type: { world: 'signal', domain: 'number' },
      optional: true,
    },
  ],
  outputs: [
    {
      portId: 'out',
      label: 'Output',
      dir: 'out',
      type: { world: 'signal', domain: 'number' },
    },
  ],
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
