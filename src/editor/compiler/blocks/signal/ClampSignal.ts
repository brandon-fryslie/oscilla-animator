/**
 * ClampSignal Block Compiler
 *
 * Clamps signal values to a specified range.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerClampSignal: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [value] = inputs;

  if (value.k !== 'sig') {
    throw new Error('ClampSignal requires signal input');
  }

  // Min and max can come from inputs (if wired) or config (static params)
  // For now, we'll use config to match the existing closure behavior
  const cfg = config as { min?: number; max?: number } | undefined;
  const minValue = cfg?.min ?? 0;
  const maxValue = cfg?.max ?? 1;

  const outType = { world: 'signal' as const, domain: 'number' as const };

  // Create min constant, then max(value, minConst), then min(result, maxConst)
  const minConstId = ctx.b.sigConst(minValue, outType);
  const maxConstId = ctx.b.sigConst(maxValue, outType);

  // clamp(v, min, max) = min(max(v, min), max)
  const maxed = ctx.b.sigZip(value.id, minConstId, { kind: 'opcode', opcode: OpCode.Max }, outType,);

  const clamped = ctx.b.sigZip(maxed, maxConstId, { kind: 'opcode', opcode: OpCode.Min }, outType,);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'sig', id: clamped, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'ClampSignal',
  capability: 'pure',
  inputs: [
    { portId: 'in', label: 'In', dir: 'in', type: { world: 'signal', domain: 'number' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerClampSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const ClampSignalBlock: BlockCompiler = {
  type: 'ClampSignal',

  inputs: [
    { name: 'in', type: { kind: 'Signal:number' }, required: true },
    { name: 'min', type: { kind: 'Scalar:number' }, required: false },
    { name: 'max', type: { kind: 'Scalar:number' }, required: false },
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
          message: 'ClampSignal requires a Signal<number> input',
        },
      };
    }

    const inputSignal = inputArtifact.value as Signal<number>;
    // Read from inputs - values come from defaultSource or explicit connections
    const minArtifact = inputs.min;
    const min = Number(minArtifact !== undefined && 'value' in minArtifact ? minArtifact.value : 0);
    const maxArtifact = inputs.max;
    const max = Number(maxArtifact !== undefined && 'value' in maxArtifact ? maxArtifact.value : 1);

    // Create clamped signal
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const value = inputSignal(t, ctx);
      return Math.max(min, Math.min(max, value));
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
