/**
 * Shaper Block Compiler
 *
 * Applies waveshaping functions to transform signal values.
 * Useful for softening edges, creating breathing curves, etc.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import { registerBlockType } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';
import type { TypeDesc } from '../../ir/types';

interface ShaperConfig {
  kind?: string;
  amount?: number;
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
  const input = inputs[0]; // Signal:float

  if (input.k !== 'sig') {
    throw new Error(`Shaper: expected sig input, got ${input.k}`);
  }

  const cfg = config as ShaperConfig | undefined;
  const kind = (cfg?.kind !== undefined && cfg.kind !== null) ? String(cfg.kind) : 'smoothstep';
  const amount = Number(cfg?.amount ?? 1);

  const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };

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

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'Shaper_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: outputId, slot } },
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
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'out',
      label: 'Output',
      dir: 'out',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
    },
  ],
  lower: lowerShaper,
});
