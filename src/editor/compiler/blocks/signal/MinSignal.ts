/**
 * MinSignal Block Compiler
 *
 * Component-wise minimum of two signals.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerMinSignal: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('MinSignal requires signal inputs');
  }

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Min }, outType,);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'sig', id: sigId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'MinSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: Infinity } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: Infinity } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerMinSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const MinSignalBlock: BlockCompiler = {
  type: 'MinSignal',

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
          message: 'MinSignal requires Signal<float> for input A',
        },
      };
    }

    if (bArtifact === undefined || bArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'MinSignal requires Signal<float> for input B',
        },
      };
    }

    const aSignal = aArtifact.value as Signal<float>;
    const bSignal = bArtifact.value as Signal<float>;

    // Create min signal
    const signal: Signal<float> = (t: number, ctx: RuntimeCtx): number => {
      return Math.min(aSignal(t, ctx), bSignal(t, ctx));
    };

    return {
      out: { kind: 'Signal:float', value: signal },
    };
  },
};
