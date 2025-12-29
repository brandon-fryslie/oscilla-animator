/**
 * SubSignal Block Compiler
 *
 * Subtracts two signals element-wise (a - b).
 * Useful for offset modulation, differential signals, etc.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerSubSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('SubSignal requires signal inputs');
  }

  const outType = { world: 'signal' as const, domain: 'number' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Sub }, outType,);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'sig', id: sigId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'SubSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'number' }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'number' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerSubSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const SubSignalBlock: BlockCompiler = {
  type: 'SubSignal',

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
          message: 'SubSignal requires Signal<number> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'SubSignal requires Signal<number> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<number>;
    const bSignal = bArtifact.value as Signal<number>;

    // Create subtracted signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      return aSignal(t, ctx) - bSignal(t, ctx);
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
