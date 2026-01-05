/**
 * ClampSignal Block Compiler
 *
 * Clamps signal values to a specified range.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';


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

  const outType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };

  // Create min constant, then max(value, minConst), then min(result, maxConst)
  const minConstId = ctx.b.sigConst(minValue, outType);
  const maxConstId = ctx.b.sigConst(maxValue, outType);

  // clamp(v, min, max) = min(max(v, min), max)
  const maxed = ctx.b.sigZip(value.id, minConstId, { kind: 'opcode', opcode: OpCode.Max }, outType,);

  const clamped = ctx.b.sigZip(maxed, maxConstId, { kind: 'opcode', opcode: OpCode.Min }, outType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'ClampSignal_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: clamped, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'ClampSignal',
  capability: 'pure',
  inputs: [
    { portId: 'in', label: 'In', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerClampSignal,
});
