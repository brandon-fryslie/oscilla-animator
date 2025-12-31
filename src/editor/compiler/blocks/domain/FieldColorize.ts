/**
 * FieldColorize Block Compiler
 *
 * Maps a numeric Field to colors using a gradient.
 * Takes Field<float> (typically in [0,1]) and produces Field<color>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

/**
 * Parse hex color to RGB
 */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Convert RGB to hex
 */
function toHex(r: number, g: number, b: number): string {
  const rr = Math.round(Math.max(0, Math.min(255, r)));
  const gg = Math.round(Math.max(0, Math.min(255, g)));
  const bb = Math.round(Math.max(0, Math.min(255, b)));
  return `#${((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1)}`;
}

/**
 * Linear interpolation between two colors
 */
function lerpColor(colorA: string, colorB: string, t: number): string {
  const a = parseHex(colorA);
  const b = parseHex(colorB);
  const u = Math.max(0, Math.min(1, t));

  return toHex(
    a.r + (b.r - a.r) * u,
    a.g + (b.g - a.g) * u,
    a.b + (b.b - a.b) * u
  );
}

/**
 * Hue rotation between two colors
 */
function hueRotateColor(colorA: string, colorB: string, t: number): string {
  // For simplicity, we'll just lerp for now
  // A full implementation would convert to HSL and rotate hue
  return lerpColor(colorA, colorB, t);
}

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldColorize: BlockLowerFn = ({ inputs, config }) => {
  const values = inputs[0];

  if (values.k !== 'field') {
    throw new Error('FieldColorize requires field input');
  }

  // This block requires field-level color interpolation operations.
  // Options:
  // 1. Use OpCode.ColorLerp with fieldMap to interpolate between two color constants
  // 2. Implement custom color gradient kernel
  //
  // The current IR doesn't support:
  // - Field-level color operations (ColorLerp is signal-level)
  // - Color constants in the const pool
  // - Hex color string handling
  //
  // We'd need:
  // - fieldMap with ColorLerp opcode
  // - Color constant support
  // - Color string encoding/decoding

  const mode = (config != null && typeof config === 'object' && 'mode' in config)
    ? String(config.mode)
    : 'lerp';

  throw new Error(
    `FieldColorize IR lowering requires field-level color operations (mode: ${mode}). ` +
    'This needs: (1) fieldMap with ColorLerp opcode support, ' +
    '(2) color constant pool support, and ' +
    '(3) color string encoding in IR. ' +
    'Block remains in closure mode until field color operations are implemented in IR.'
  );
};

registerBlockType({
  type: 'FieldColorize',
  capability: 'pure',
  inputs: [
    { portId: 'values', label: 'Values', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'colors', label: 'Colors', dir: 'out', type: { world: "field", domain: "color", category: "core", busEligible: true } },
  ],
  lower: lowerFieldColorize,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldColorizeBlock: BlockCompiler = {
  type: 'FieldColorize',

  inputs: [
    { name: 'values', type: { kind: 'Field:float' }, required: true },
  ],

  outputs: [
    { name: 'colors', type: { kind: 'Field:color' } },
  ],

  compile({ params, inputs }) {
    const valuesArtifact = inputs.values;
    if (!isDefined(valuesArtifact) || valuesArtifact.kind !== 'Field:float') {
      return {
        colors: {
          kind: 'Error',
          message: 'FieldColorize requires a Field<float> input',
        },
      };
    }

    const valuesFn = valuesArtifact.value;
    const colorA = String(params.colorA);
    const colorB = String(params.colorB);
    const mode = String(params.mode );

    const mapFn = mode === 'hue' ? hueRotateColor : lerpColor;

    // Create color field
    const field: Field<unknown> = (seed, n, ctx) => {
      const values = valuesFn(seed, n, ctx);
      return values.map((v) => mapFn(colorA, colorB, v));
    };

    return {
      colors: { kind: 'Field:color', value: field },
    };
  },
};
