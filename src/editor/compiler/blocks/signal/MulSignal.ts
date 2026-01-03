/**
 * MulSignal Block Compiler
 *
 * Multiplies two signals element-wise.
 * Useful for amplitude modulation, gating, etc.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerMulSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('MulSignal requires signal inputs');
  }

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Mul }, outType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'MulSignal_out');
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'MulSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 1 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 1 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerMulSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const MulSignalBlock: BlockCompiler = {
  type: 'MulSignal',

  inputs: [
    { name: 'a', type: { kind: 'Signal:float' }, required: true },
    { name: 'b', type: { kind: 'Signal:float' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:float' } },
  ],

  compile({ inputs }) {
    const aArtifact = inputs.a;
    const bArtifact = inputs.b;

    if (aArtifact === undefined || aArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'MulSignal requires Signal<float> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'MulSignal requires Signal<float> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<float>;
    const bSignal = bArtifact.value as Signal<float>;

    // Create multiplied signal
    const signal: Signal<float> = (t: number, ctx: RuntimeCtx): number => {
      return aSignal(t, ctx) * bSignal(t, ctx);
    };

    return {
      out: { kind: 'Signal:float', value: signal },
    };
  },
};
