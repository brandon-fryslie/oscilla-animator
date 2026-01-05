/**
 * FieldOpacity Block Compiler
 *
 * Converts a numeric Field to opacity values with range mapping and curve application.
 * Takes Field<float> and produces Field<float> clamped to [min, max] with optional curve.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldOpacity: BlockLowerFn = ({ ctx, inputs, config }) => {
  const values = inputs[0];

  if (values.k !== 'field') {
    throw new Error('FieldOpacity requires field input');
  }

  const cfg = config as { min?: number; max?: number; curve?: string };
  const min = cfg.min ?? 0;
  const max = cfg.max ?? 1;
  const curve = cfg.curve ?? 'linear';

  // For linear curve with no clamping (min=0, max=1), we can pass through
  if (curve === 'linear' && min === 0 && max === 1) {
    const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldOpacity_out');
    return {
      outputs: [],
      outputsById: { opacity: { k: 'field', id: values.id, slot } },
    };
  }

  // For non-linear curves or range mapping, we need fieldMap with curve functions
  // Current supported curves: smoothstep, square, sqrt, linear
  //
  // IR Implementation approach:
  // 1. Clamp input to [0,1] using fieldMap with Clamp opcode
  // 2. Apply curve using fieldMap with appropriate opcode
  // 3. Scale to [min, max] using fieldMap with linear transform
  //
  // Challenges:
  // - Smoothstep: u * u * (3 - 2 * u) requires composition of mul/sub
  // - Square: u * u can use Mul with same input
  // - Sqrt: needs Sqrt opcode (not in current registry)
  //
  // For complex curves, we'd need to compose multiple operations or add curve opcodes

  throw new Error(
    `FieldOpacity IR lowering requires field-level curve transformations (curve: ${curve}, range: [${min}, ${max}]). ` +
    'This needs: (1) fieldMap with curve composition (smoothstep, square, sqrt), ' +
    '(2) potentially new curve opcodes, and ' +
    '(3) field-level clamp and linear transform. ' +
    'This block is not yet supported in IR until those operations are implemented.'
  );
};

registerBlockType({
  type: 'FieldOpacity',
  capability: 'pure',
  inputs: [
    { portId: 'values', label: 'Values', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'opacity', label: 'Opacity', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldOpacity,
});
