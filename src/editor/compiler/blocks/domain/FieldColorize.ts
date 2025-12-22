/**
 * FieldColorize Block Compiler
 *
 * Maps a numeric Field to colors using a gradient.
 * Takes Field<number> (typically in [0,1]) and produces Field<color>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';

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

export const FieldColorizeBlock: BlockCompiler = {
  type: 'FieldColorize',

  inputs: [
    { name: 'values', type: { kind: 'Field:number' }, required: true },
  ],

  outputs: [
    { name: 'colors', type: { kind: 'Field:color' } },
  ],

  compile({ params, inputs }) {
    const valuesArtifact = inputs.values;
    if (!isDefined(valuesArtifact) || valuesArtifact.kind !== 'Field:number') {
      return {
        colors: {
          kind: 'Error',
          message: 'FieldColorize requires a Field<number> input',
        },
      };
    }

    const valuesFn = valuesArtifact.value;
    const colorA = typeof params.colorA === 'string' ? params.colorA : '#3B82F6';
    const colorB = typeof params.colorB === 'string' ? params.colorB : '#EF4444';
    const mode = typeof params.mode === 'string' ? params.mode : 'lerp';

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
