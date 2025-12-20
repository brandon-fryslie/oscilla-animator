/**
 * ColorField Block Compiler
 *
 * Generates per-element colors for varied/procedural animations.
 * Supports solid color, gradient interpolation, and random hue variations.
 *
 * Outputs: Field<string> of CSS color strings.
 */

import type { BlockCompiler } from '../../../types';

type ColorMode = 'solid' | 'gradient' | 'randomHue' | 'rainbow';

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 255, g: 255, b: 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function hslToRgb(h: number, s: number, l: number): RGB {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// Field type for colors
type ColorField = (seed: number, n: number) => readonly string[];

export const ColorFieldBlock: BlockCompiler = {
  type: 'ColorField',
  inputs: [],
  outputs: [{ name: 'colors', type: { kind: 'Field:string' } }],

  compile({ params }) {
    const mode = (params.mode as ColorMode) ?? 'solid';
    const baseColor = (params.baseColor as string) ?? '#ffffff';
    const endColor = (params.endColor as string) ?? '#ff0000';
    const hueRange = Number(params.hueRange ?? 30);
    const saturation = Number(params.saturation ?? 0.8);
    const lightness = Number(params.lightness ?? 0.6);

    const colors: ColorField = (seed, n) => {
      const out = new Array<string>(n);

      switch (mode) {
        case 'solid':
          // All elements same color
          for (let i = 0; i < n; i++) {
            out[i] = baseColor;
          }
          break;

        case 'gradient': {
          // Interpolate from baseColor to endColor
          const startRgb = hexToRgb(baseColor);
          const endRgb = hexToRgb(endColor);

          for (let i = 0; i < n; i++) {
            const u = n > 1 ? i / (n - 1) : 0;
            const r = startRgb.r + (endRgb.r - startRgb.r) * u;
            const g = startRgb.g + (endRgb.g - startRgb.g) * u;
            const b = startRgb.b + (endRgb.b - startRgb.b) * u;
            out[i] = rgbToHex(r, g, b);
          }
          break;
        }

        case 'randomHue': {
          // Random hue variations around base hue
          // Extract base hue from baseColor (simplified - just use seed)
          const baseHue = (seed % 360) / 360;

          for (let i = 0; i < n; i++) {
            const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
            const rand = t - Math.floor(t);
            const hueOffset = (rand - 0.5) * 2 * (hueRange / 360);
            const hue = (baseHue + hueOffset + 1) % 1;
            const rgb = hslToRgb(hue, saturation, lightness);
            out[i] = rgbToHex(rgb.r, rgb.g, rgb.b);
          }
          break;
        }

        case 'rainbow': {
          // Full rainbow across elements
          for (let i = 0; i < n; i++) {
            const hue = n > 1 ? i / (n - 1) : 0;
            const rgb = hslToRgb(hue, saturation, lightness);
            out[i] = rgbToHex(rgb.r, rgb.g, rgb.b);
          }
          break;
        }

        default:
          for (let i = 0; i < n; i++) {
            out[i] = baseColor;
          }
      }

      return out;
    };

    // Note: Field:string is not in the type system yet, casting for now
    return { colors: { kind: 'Field:string' as const, value: colors } };
  },
};
