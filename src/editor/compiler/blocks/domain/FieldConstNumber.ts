/**
 * FieldConstNumber Block Compiler
 *
 * Creates a constant numeric Field - same value for all elements.
 * Takes a Domain and produces Field<float>.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldConstNumber: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [domain] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldConstNumber requires domain input');
  }

  // Extract value from config (params are now passed as config)
  const configObj = config as { value?: unknown } | undefined;
  const value = Number(configObj?.value ?? 0);

  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.fieldConst(value, outType);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldConstNumber_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldConstNumber',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
    {
      portId: 'value',
      label: 'Value',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldConstNumber,
});
