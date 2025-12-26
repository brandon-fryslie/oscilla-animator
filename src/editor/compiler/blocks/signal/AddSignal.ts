/**
 * AddSignal Block Compiler
 *
 * Adds two signals element-wise.
 * Useful for combining energy sources, modulation, etc.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerAddSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('AddSignal requires signal inputs');
  }

  const outType = { world: 'signal' as const, domain: 'number' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, {
    fnId: 'add',
    opcode: OpCode.Add,
    outputType: outType,
  });

  return { outputs: [{ k: 'sig', id: sigId }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'AddSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'number' } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'number' } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerAddSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const AddSignalBlock: BlockCompiler = {
  type: 'AddSignal',

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
          message: 'AddSignal requires Signal<number> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'AddSignal requires Signal<number> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<number>;
    const bSignal = bArtifact.value as Signal<number>;

    // Create summed signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      return aSignal(t, ctx) + bSignal(t, ctx);
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
