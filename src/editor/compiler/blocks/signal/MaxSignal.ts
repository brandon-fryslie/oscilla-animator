/**
 * MaxSignal Block Compiler
 *
 * Component-wise maximum of two signals.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerMaxSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('MaxSignal requires signal inputs');
  }

  const outType = { world: 'signal' as const, domain: 'number' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, {
    fnId: 'max',
    opcode: OpCode.Max,
    outputType: outType,
  });

  return { outputs: [{ k: 'sig', id: sigId }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'MaxSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'number' } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'number' } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerMaxSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const MaxSignalBlock: BlockCompiler = {
  type: 'MaxSignal',

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
          message: 'MaxSignal requires Signal<number> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'MaxSignal requires Signal<number> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<number>;
    const bSignal = bArtifact.value as Signal<number>;

    // Create max signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      return Math.max(aSignal(t, ctx), bSignal(t, ctx));
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
