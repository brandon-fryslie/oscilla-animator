/**
 * FieldFromSignalBroadcast Block Compiler
 *
 * Broadcasts a Signal<float> value to all elements in a domain,
 * creating a Field<float> where all elements have the same value.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldFromSignalBroadcast: BlockLowerFn = ({ ctx, inputs }) => {
  const [domain, signal] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldFromSignalBroadcast requires domain input');
  }

  if (signal.k !== 'sig') {
    throw new Error('FieldFromSignalBroadcast requires signal input');
  }

  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.broadcastSigToField(signal.id, domain.id, outType);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldFromSignalBroadcast_out');
  return {
    outputs: [],
    outputsById: { field: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldFromSignalBroadcast',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'field', label: 'Field', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldFromSignalBroadcast,
});
