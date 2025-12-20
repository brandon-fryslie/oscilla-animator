/**
 * ColorLFO Block Compiler
 *
 * Generates animated color from phase input via hue rotation.
 * Takes phase [0,1] and produces Signal<color> as hex strings.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

/**
 * Parse hex color to HSL
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const cleaned = hex.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s, l };
}

/**
 * Convert HSL to hex string
 */
function hslToHex(h: number, s: number, l: number): string {
  h = h % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r: number, g: number, b: number;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const ColorLFOBlock: BlockCompiler = {
  type: 'ColorLFO',

  inputs: [{ name: 'phase', type: { kind: 'Signal:phase' }, required: true }],

  outputs: [{ name: 'color', type: { kind: 'Signal:color' } }],

  compile({ params, inputs }) {
    const phaseArtifact = inputs.phase;
    if (!phaseArtifact || phaseArtifact.kind !== 'Signal:phase') {
      return {
        color: {
          kind: 'Error',
          message: 'ColorLFO requires a Signal<phase> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as Signal<number>;
    const base = String(params.base ?? '#3B82F6');
    const hueSpan = Number(params.hueSpan ?? 180);
    const sat = Number(params.sat ?? 0.8);
    const light = Number(params.light ?? 0.5);

    // Extract base hue from base color
    const baseHSL = hexToHSL(base);
    const baseHue = baseHSL.h;

    // Create color signal
    const signal: Signal<string> = (t: number, ctx: RuntimeCtx) => {
      const phase = phaseSignal(t, ctx);
      const hue = baseHue + phase * hueSpan;
      return hslToHex(hue, sat, light);
    };

    return {
      color: { kind: 'Signal:color', value: signal },
    };
  },
};
