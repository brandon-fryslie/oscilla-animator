/**
 * FieldConstColor Block Compiler
 *
 * Creates a constant color Field - same color for all elements.
 * Takes a Domain and produces Field<color>.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldConstColor: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [domain] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldConstColor requires domain input');
  }

  // Extract color from config (params are now passed as config)
  const configObj = config as { color?: unknown } | undefined;
  const colorValue = configObj?.color;
  const color = typeof colorValue === 'string' ? colorValue : '#000000';

  const outType = { world: "field" as const, domain: "color" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.fieldConst(color, outType);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldConstColor_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldConstColor',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "color", category: "core", busEligible: true } },
  ],
  lower: lowerFieldConstColor,
});
