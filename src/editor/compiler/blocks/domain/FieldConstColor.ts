/**
 * FieldConstColor Block Compiler
 *
 * Creates a constant color Field - same color for all elements.
 * Takes a Domain and produces Field<color>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
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

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldConstColorBlock: BlockCompiler = {
  type: 'FieldConstColor',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'color', type: { kind: 'Signal:color' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:color' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldConstColor requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Read from inputs - values come from defaultSource or explicit connections
    const colorArtifact = inputs.color;
    const colorValue = colorArtifact !== undefined && 'value' in colorArtifact ? colorArtifact.value : '#000000';
    const color = typeof colorValue === 'string' ? colorValue : String(colorValue);

    // Create constant field that returns the same color for all elements
    const field: Field<unknown> = (_seed, n) => {
      const count = Math.min(n, domain.elements.length);
      return new Array(count).fill(color);
    };

    return {
      out: { kind: 'Field:color', value: field },
    };
  },
};
