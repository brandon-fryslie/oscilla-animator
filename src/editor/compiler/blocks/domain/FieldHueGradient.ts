/**
 * FieldHueGradient Block Compiler
 *
 * Generates per-element colors by spreading hue across domain elements.
 * Creates rainbow/gradient effects that can be animated via phase input.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldHueGradient: BlockLowerFn = ({ inputs }) => {
  const domain = inputs[0];

  // Validate inputs
  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldHueGradient requires domain input');
  }

  // This block requires complex per-element color generation:
  // 1. Per-element index (i) and count (n) to compute element fraction
  // 2. Signal evaluation (hueOffset, hueSpread, saturation, lightness, phase)
  // 3. HSL to RGB color conversion
  // 4. Color string encoding
  //
  // Challenges:
  // - Per-element index requires special field operation (not just fieldMap)
  // - HSL->RGB conversion requires complex piecewise function (like ColorLFO)
  // - Combining signals with per-element computation requires runtime evaluation
  // - Color string encoding not supported in IR
  //
  // This is fundamentally similar to FieldFromExpression - it needs to:
  // - Iterate over domain elements with index awareness
  // - Evaluate signals at runtime
  // - Perform complex color math per element
  //
  // IR would need:
  // - fieldMapIndexed (provides i and n to the kernel)
  // - ColorHSLToRGB opcode
  // - Signal evaluation in field context
  // - Color string encoding

  throw new Error(
    'FieldHueGradient IR lowering requires per-element indexed operations with signal evaluation and HSL->RGB conversion. ' +
    'This needs: (1) fieldMapIndexed to access element index/count, ' +
    '(2) signal evaluation in field context, ' +
    '(3) ColorHSLToRGB opcode, and ' +
    '(4) color string encoding in IR. ' +
    'This block is not yet supported in IR until indexed field operations and color conversion are implemented.'
  );
};

registerBlockType({
  type: 'FieldHueGradient',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
    { portId: 'hueOffset', label: 'Hue Offset', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, optional: true, defaultSource: { value: 0 } },
    { portId: 'hueSpread', label: 'Hue Spread', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, optional: true, defaultSource: { value: 1 } },
    { portId: 'saturation', label: 'Saturation', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, optional: true, defaultSource: { value: 80 } },
    { portId: 'lightness', label: 'Lightness', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, optional: true, defaultSource: { value: 60 } },
    { portId: 'phase', label: 'Phase', dir: 'in', type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true }, optional: true, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'colors', label: 'Colors', dir: 'out', type: { world: "field", domain: "color", category: "core", busEligible: true } },
  ],
  lower: lowerFieldHueGradient,
});
