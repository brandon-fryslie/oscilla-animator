/**
 * FieldHueGradient Block Compiler
 *
 * Generates per-element colors by spreading hue across domain elements.
 * Creates rainbow/gradient effects that can be animated via phase input.
 */

import type { BlockCompiler, Field, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';

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

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        colors: {
          kind: 'Error',
          message: 'FieldHueGradient requires a Domain input',
        },
      };
    }

    // Get signal inputs or use defaults from params
    const hueOffsetArtifact = inputs.hueOffset;
    const hueSpreadArtifact = inputs.hueSpread;
    const saturationArtifact = inputs.saturation;
    const lightnessArtifact = inputs.lightness;
    const phaseArtifact = inputs.phase;

    // Default values from params
    const defaultHueOffset = Number(params.hueOffset ?? 0);
    const defaultHueSpread = Number(params.hueSpread ?? 1);
    const defaultSaturation = Number(params.saturation ?? 80);
    const defaultLightness = Number(params.lightness ?? 60);

    // Create the field function that evaluates signals at render time
    const field: Field<string> = (_seed, n, ctx) => {
      // Get runtime context for signal evaluation
      const t = (ctx.env as { t?: number }).t ?? 0;
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
