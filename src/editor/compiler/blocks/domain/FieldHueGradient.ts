/**
 * FieldHueGradient Block Compiler
 *
 * Generates per-element colors by spreading hue across domain elements.
 * Creates rainbow/gradient effects that can be animated via phase input.
 */

import type { BlockCompiler, Field, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

/**
 * Convert HSL to hex color string.
 * H is in degrees (0-360), S and L are percentages (0-100).
 */
function hslToHex(h: number, s: number, l: number): string {
  // Normalize inputs
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lit = Math.max(0, Math.min(100, l)) / 100;

  // HSL to RGB conversion
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lit - c / 2;

  let r = 0, g = 0, b = 0;

  if (hue < 60) {
    r = c; g = x; b = 0;
  } else if (hue < 120) {
    r = x; g = c; b = 0;
  } else if (hue < 180) {
    r = 0; g = c; b = x;
  } else if (hue < 240) {
    r = 0; g = x; b = c;
  } else if (hue < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  // Convert to 0-255 range and then to hex
  const rr = Math.round((r + m) * 255);
  const gg = Math.round((g + m) * 255);
  const bb = Math.round((b + m) * 255);

  return `#${((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1)}`;
}

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
    'Block remains in closure mode until indexed field operations and color conversion are implemented in IR.'
  );
};

registerBlockType({
  type: 'FieldHueGradient',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' }, defaultSource: { value: 100 } },
    { portId: 'hueOffset', label: 'Hue Offset', dir: 'in', type: { world: 'signal', domain: 'number' }, optional: true, defaultSource: { value: 0 } },
    { portId: 'hueSpread', label: 'Hue Spread', dir: 'in', type: { world: 'signal', domain: 'number' }, optional: true, defaultSource: { value: 1 } },
    { portId: 'saturation', label: 'Saturation', dir: 'in', type: { world: 'signal', domain: 'number' }, optional: true, defaultSource: { value: 80 } },
    { portId: 'lightness', label: 'Lightness', dir: 'in', type: { world: 'signal', domain: 'number' }, optional: true, defaultSource: { value: 60 } },
    { portId: 'phase', label: 'Phase', dir: 'in', type: { world: 'signal', domain: 'phase01' }, optional: true, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'colors', label: 'Colors', dir: 'out', type: { world: 'field', domain: 'color' } },
  ],
  lower: lowerFieldHueGradient,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldHueGradientBlock: BlockCompiler = {
  type: 'FieldHueGradient',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'hueOffset', type: { kind: 'Signal:number' }, required: false },
    { name: 'hueSpread', type: { kind: 'Signal:number' }, required: false },
    { name: 'saturation', type: { kind: 'Signal:number' }, required: false },
    { name: 'lightness', type: { kind: 'Signal:number' }, required: false },
    { name: 'phase', type: { kind: 'Signal:phase' }, required: false },
  ],

  outputs: [
    { name: 'colors', type: { kind: 'Field:color' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        colors: {
          kind: 'Error',
          message: 'FieldHueGradient requires a Domain input',
        },
      };
    }

    // Get signal inputs
    const hueOffsetArtifact = inputs.hueOffset;
    const hueSpreadArtifact = inputs.hueSpread;
    const saturationArtifact = inputs.saturation;
    const lightnessArtifact = inputs.lightness;
    const phaseArtifact = inputs.phase;

    // Default values from inputs - values come from defaultSource or explicit connections
    const defaultHueOffset = Number((inputs.hueOffset as any)?.value);
    const defaultHueSpread = Number((inputs.hueSpread as any)?.value);
    const defaultSaturation = Number((inputs.saturation as any)?.value);
    const defaultLightness = Number((inputs.lightness as any)?.value);

    // Create the field function that evaluates signals at render time
    const field: Field<string> = (_seed, n, ctx) => {
      // Get runtime context for signal evaluation
      const t = (ctx.env as { t?: number }).t || 0;
      const runtimeCtx: RuntimeCtx = { viewport: { w: 0, h: 0, dpr: 1 } };

      // Evaluate signal inputs or use defaults
      const hueOffset = isDefined(hueOffsetArtifact) && hueOffsetArtifact.kind === 'Signal:number'
        ? hueOffsetArtifact.value(t, runtimeCtx)
        : defaultHueOffset;

      const hueSpread = isDefined(hueSpreadArtifact) && hueSpreadArtifact.kind === 'Signal:number'
        ? hueSpreadArtifact.value(t, runtimeCtx)
        : defaultHueSpread;

      const saturation = isDefined(saturationArtifact) && saturationArtifact.kind === 'Signal:number'
        ? saturationArtifact.value(t, runtimeCtx)
        : defaultSaturation;

      const lightness = isDefined(lightnessArtifact) && lightnessArtifact.kind === 'Signal:number'
        ? lightnessArtifact.value(t, runtimeCtx)
        : defaultLightness;

      const phase = isDefined(phaseArtifact) && (phaseArtifact.kind === 'Signal:phase' || phaseArtifact.kind === 'Signal:number')
        ? phaseArtifact.value(t, runtimeCtx)
        : 0;

      // Generate colors for each element
      const colors: string[] = new Array(n);
      for (let i = 0; i < n; i++) {
        // Calculate hue for this element
        // Spread the hue across elements and add phase for animation
        const elementFraction = n > 1 ? i / (n - 1) : 0;
        const hue = hueOffset + (elementFraction * hueSpread * 360) + (phase * 360);
        colors[i] = hslToHex(hue, saturation, lightness);
      }

      return colors;
    };

    return {
      colors: { kind: 'Field:color', value: field },
    };
  },
};
