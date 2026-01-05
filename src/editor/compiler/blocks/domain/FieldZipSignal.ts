/**
 * FieldZipSignal Block Compiler
 *
 * Combines a Field<float> with a Signal<float> using a binary operation.
 * The signal is evaluated once per frame and combined with each field element.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Get OpCode for a given operation name.
 */
function getOpCode(fn: string): OpCode {
  switch (fn) {
    case 'add': return OpCode.Add;
    case 'sub': return OpCode.Sub;
    case 'mul': return OpCode.Mul;
    case 'div': return OpCode.Div;
    case 'min': return OpCode.Min;
    case 'max': return OpCode.Max;
    default: return OpCode.Add; // Default to add
  }
}


const lowerFieldZipSignal: BlockLowerFn = ({ ctx, config, inputs }) => {
  const [field, signal] = inputs;

  if (field.k !== 'field') {
    throw new Error('FieldZipSignal requires field input');
  }

  if (signal.k !== 'sig') {
    throw new Error('FieldZipSignal requires signal input');
  }

  // Read operation from config (defaults to 'add')
  const configObj = (config != null && typeof config === 'object') ? config as Record<string, unknown> : {};
  const fn = typeof configObj.fn === 'string' ? configObj.fn : 'add';
  const opcode = getOpCode(fn);

  // Strategy: broadcast signal to field, then zip the two fields
  // This matches the semantic of "apply signal value to each field element"
  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };

  // Note: We need domain slot from the field input
  // For now, we'll create a placeholder - this will need proper domain tracking
  const domainType = { world: "config" as const, domain: "int" as const, category: "internal" as const, busEligible: false };
  const domainSlot = ctx.b.allocValueSlot(domainType, 'FieldZipSignal_domain');
  const broadcastField = ctx.b.broadcastSigToField(signal.id, domainSlot, outType);

  const fnRef = { kind: 'opcode' as const, opcode };
  const fieldId = ctx.b.fieldZip(field.id, broadcastField, fnRef, outType);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldZipSignal_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldZipSignal',
  capability: 'pure',
  inputs: [
    { portId: 'field', label: 'Field', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldZipSignal,
});
