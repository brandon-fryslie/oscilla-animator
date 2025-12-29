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

const lowerAddSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('AddSignal requires signal inputs');
  }

  const outType = { world: 'signal' as const, domain: 'float' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, {
    kind: 'opcode',
    opcode: OpCode.Add,
  }, outType);

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [], // Legacy - empty for fully migrated blocks
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'AddSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'float' } },
  ],
  lower: lowerAddSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const AddSignalBlock: BlockCompiler = {
  type: 'AddSignal',

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
          message: 'AddSignal requires Signal<float> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'AddSignal requires Signal<float> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<float>;
    const bSignal = bArtifact.value as Signal<float>;

    // Create summed signal
    const signal: Signal<float> = (t: number, ctx: RuntimeCtx): number => {
      return aSignal(t, ctx) + bSignal(t, ctx);
    };

    return {
      out: { kind: 'Signal:float', value: signal },
    };
  },
};
