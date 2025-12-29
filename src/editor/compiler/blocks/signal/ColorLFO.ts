/**
 * ColorLFO Block Compiler
 *
 * Generates animated color from phase input via hue rotation.
 * Takes phase [0,1] and produces Signal<color> as hex strings.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

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

  const toHex = (n: number): string =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower ColorLFO block to IR.
 *
 * Performs HSL color cycling based on phase input.
 * For Sprint 2, uses OpCode.ColorShiftHue (2-input opcode) which shifts the hue
 * of a base color by a calculated amount.
 *
 * Note: sat and light parameters from config are baked into the base color.
 * Future enhancement: use OpCode.ColorHSLToRGB with a 3-input zip when available.
 */
const lowerColorLFO: BlockLowerFn = ({ ctx, inputs, config }) => {
  const phase = inputs[0]; // Signal:phase

  if (phase.k !== 'sig') {
    throw new Error(`ColorLFO: expected sig input for phase, got ${phase.k}`);
  }

  const base = (config as any)?.base || '#3B82F6';
  const hueSpan = Number((config as any)?.hueSpan ?? 180);
  // Note: sat and light are baked into the base color for Sprint 2
  // They would be used if we had a 3-input ColorHSLToRGB opcode

  const numberType: TypeDesc = { world: 'signal', domain: 'number' };
  const colorType: TypeDesc = { world: 'signal', domain: 'color' };

  // Calculate hue shift: phase * hueSpan
  const hueSpanSig = ctx.b.sigConst(hueSpan, numberType);
  const hueShiftSig = ctx.b.sigZip(phase.id, hueSpanSig, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

  // Use ColorShiftHue to shift base color's hue by (phase * hueSpan)
  const baseColorSig = ctx.b.sigConst(base, colorType);
  const colorSig = ctx.b.sigZip(baseColorSig, hueShiftSig, { kind: 'opcode', opcode: OpCode.ColorShiftHue }, colorType,);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'sig', id: colorSig, slot }] };
};

// Register block type
registerBlockType({
  type: 'ColorLFO',
  capability: 'pure',
  inputs: [
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: 'signal', domain: 'phase01' },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'color',
      label: 'Color',
      dir: 'out',
      type: { world: 'signal', domain: 'color' },
    },
  ],
  lower: lowerColorLFO,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const ColorLFOBlock: BlockCompiler = {
  type: 'ColorLFO',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
    { name: 'base', type: { kind: 'Scalar:color' }, required: false },
    { name: 'hueSpan', type: { kind: 'Scalar:number' }, required: false },
    { name: 'sat', type: { kind: 'Scalar:number' }, required: false },
    { name: 'light', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [{ name: 'color', type: { kind: 'Signal:color' } }],

  compile({ inputs }) {
    const phaseArtifact = inputs.phase;
    if (phaseArtifact === undefined || phaseArtifact.kind !== 'Signal:phase') {
      return {
        color: {
          kind: 'Error',
          message: 'ColorLFO requires a Signal<phase> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as Signal<number>;
    // Read from inputs - values come from defaultSource or explicit connections
    const base = String((inputs.base as any)?.value);
    const hueSpan = Number((inputs.hueSpan as any)?.value);
    const sat = Number((inputs.sat as any)?.value);
    const light = Number((inputs.light as any)?.value);

    // Extract base hue from base color
    const baseHSL = hexToHSL(base);
    const baseHue = baseHSL.h;

    // Create color signal
    const signal: Signal<string> = (t: number, ctx: RuntimeCtx): string => {
      const phase = phaseSignal(t, ctx);
      const hue = baseHue + phase * hueSpan;
      return hslToHex(hue, sat, light);
    };

    return {
      color: { kind: 'Signal:color', value: signal },
    };
  },
};
