/**
 * DivSignal Block Compiler
 *
 * Divides two signals element-wise (a / b).
 * Division by zero returns 0 (safe default, no NaN propagation).
 * Useful for ratio calculations, reciprocals, etc.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerDivSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('DivSignal requires signal inputs');
  }

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Div }, outType,);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'sig', id: sigId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DivSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 1 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerDivSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const DivSignalBlock: BlockCompiler = {
  type: 'DivSignal',

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
          message: 'DivSignal requires Signal<float> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'DivSignal requires Signal<float> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<float>;
    const bSignal = bArtifact.value as Signal<float>;

    // Create divided signal (safe division by zero)
    const signal: Signal<float> = (t: number, ctx: RuntimeCtx): number => {
      const b = bSignal(t, ctx);
      return b !== 0 ? aSignal(t, ctx) / b : 0;
    };

    return {
      out: { kind: 'Signal:float', value: signal },
    };
  },
};
