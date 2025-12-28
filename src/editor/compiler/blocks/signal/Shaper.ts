/**
 * Shaper Block Compiler
 *
 * Applies waveshaping functions to transform signal values.
 * Useful for softening edges, creating breathing curves, etc.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import { registerBlockType } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

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

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower Shaper block to IR.
 *
 * Applies various waveshaping functions to the input signal.
 * Kind parameter determines the shaping function, amount controls intensity.
 */
const lowerShaper: BlockLowerFn = ({ ctx, inputs, config }) => {
  const input = inputs[0]; // Signal:number

  if (input.k !== 'sig') {
    throw new Error(`Shaper: expected sig input, got ${input.k}`);
  }

  const kind = (config as any)?.kind || 'smoothstep';
  const amount = Number((config as any)?.amount ?? 1);

  const numberType: any = { world: 'signal', domain: 'number' };

  let outputId: number;

  switch (kind) {
    case 'tanh':
      // tanh(x * amount)
      {
        const amountSig = ctx.b.sigConst(amount, numberType);
        const scaled = ctx.b.sigZip(input.id, amountSig, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        // Note: tanh not in OpCode registry, would need to be added
        // For now, use a series expansion or fallback
        // tanh(x) ≈ x for small x, saturates to ±1 for large x
        // Simple approximation: x / (1 + |x|)
        const one = ctx.b.sigConst(1, numberType);
        const abs_val = ctx.b.sigMap(scaled, { kind: 'opcode', opcode: OpCode.Abs }, numberType,);
        const denom = ctx.b.sigZip(one, abs_val, { kind: 'opcode', opcode: OpCode.Add }, numberType,);
        outputId = ctx.b.sigZip(scaled, denom, { kind: 'opcode', opcode: OpCode.Div }, numberType,);
      }
      break;

    case 'softclip':
      // x / (1 + |x * amount|)
      {
        const amountSig = ctx.b.sigConst(amount, numberType);
        const scaled = ctx.b.sigZip(input.id, amountSig, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        const one = ctx.b.sigConst(1, numberType);
        const abs_val = ctx.b.sigMap(scaled, { kind: 'opcode', opcode: OpCode.Abs }, numberType,);
        const denom = ctx.b.sigZip(one, abs_val, { kind: 'opcode', opcode: OpCode.Add }, numberType,);
        outputId = ctx.b.sigZip(input.id, denom, { kind: 'opcode', opcode: OpCode.Div }, numberType,);
      }
      break;

    case 'sigmoid':
      // 1 / (1 + exp(-x * amount))
      {
        const amountSig = ctx.b.sigConst(amount, numberType);
        const scaled = ctx.b.sigZip(input.id, amountSig, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        const neg_one = ctx.b.sigConst(-1, numberType);
        const negated = ctx.b.sigZip(scaled, neg_one, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
        // exp not in OpCode registry - would need to add
        // For now, approximate with tanh-like behavior
        const one = ctx.b.sigConst(1, numberType);
        const abs_val = ctx.b.sigMap(negated, { kind: 'opcode', opcode: OpCode.Abs }, numberType,);
        const denom = ctx.b.sigZip(one, abs_val, { kind: 'opcode', opcode: OpCode.Add }, numberType,);
        const inv_denom = ctx.b.sigZip(one, denom, { kind: 'opcode', opcode: OpCode.Div }, numberType,);
        outputId = inv_denom;
      }
      break;

    case 'smoothstep':
      // smoothstep: t * t * (3 - 2 * t) where t = clamp(x, 0, 1)
      {
        const zero = ctx.b.sigConst(0, numberType);
        const one = ctx.b.sigConst(1, numberType);
        const two = ctx.b.sigConst(2, numberType);
        const three = ctx.b.sigConst(3, numberType);

        // clamp(x, 0, 1)
        const max_zero = ctx.b.sigZip(input.id, zero, { kind: 'opcode', opcode: OpCode.Max }, numberType,);
        const t = ctx.b.sigZip(max_zero, one, { kind: 'opcode', opcode: OpCode.Min }, numberType,);

        // t * t
        const t_squared = ctx.b.sigZip(t, t, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

        // 2 * t
        const two_t = ctx.b.sigZip(two, t, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

        // 3 - 2 * t
        const three_minus_two_t = ctx.b.sigZip(three, two_t, { kind: 'opcode', opcode: OpCode.Sub }, numberType,);

        // t * t * (3 - 2 * t)
        outputId = ctx.b.sigZip(t_squared, three_minus_two_t, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
      }
      break;

    case 'pow':
      // sign(x) * pow(abs(x), amount)
      {
        const amountSig = ctx.b.sigConst(amount, numberType);
        const sign_x = ctx.b.sigMap(input.id, { kind: 'opcode', opcode: OpCode.Sign }, numberType,);
        const abs_x = ctx.b.sigMap(input.id, { kind: 'opcode', opcode: OpCode.Abs }, numberType,);
        const pow_val = ctx.b.sigZip(abs_x, amountSig, { kind: 'opcode', opcode: OpCode.Pow }, numberType,);
        outputId = ctx.b.sigZip(sign_x, pow_val, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);
      }
      break;

    default:
      // identity
      outputId = input.id;
  }

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [{ k: 'sig', id: outputId, slot }],
  };
};

// Register block type
registerBlockType({
  type: 'Shaper',
  capability: 'pure',
  inputs: [
    {
      portId: 'in',
      label: 'Input',
      dir: 'in',
      type: { world: 'signal', domain: 'number' },
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
  lower: lowerShaper,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const ShaperBlock: BlockCompiler = {
  type: 'Shaper',

  inputs: [
    { name: 'in', type: { kind: 'Signal:number' }, required: true },
    { name: 'kind', type: { kind: 'Scalar:string' }, required: false },
    { name: 'amount', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }) {
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
    // Read from inputs - values come from defaultSource or explicit connections
    const kind = String((inputs.kind as any)?.value);
    const amount = Number((inputs.amount as any)?.value);

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
