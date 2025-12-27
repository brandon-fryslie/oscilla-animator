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

  const outType = { world: 'signal' as const, domain: 'number' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, {
    fnId: 'div',
    opcode: OpCode.Div,
    outputType: outType,
  });

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'sig', id: sigId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DivSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'number' } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'number' } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerDivSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const DivSignalBlock: BlockCompiler = {
  type: 'DivSignal',

  inputs: [
    { name: 'a', type: { kind: 'Signal:number' }, required: true },
    { name: 'b', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }) {
    const aArtifact = inputs.a;
    const bArtifact = inputs.b;

    if (aArtifact === undefined || aArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'DivSignal requires Signal<number> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'DivSignal requires Signal<number> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<number>;
    const bSignal = bArtifact.value as Signal<number>;

    // Create divided signal (safe division by zero)
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const b = bSignal(t, ctx);
      return b !== 0 ? aSignal(t, ctx) / b : 0;
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
