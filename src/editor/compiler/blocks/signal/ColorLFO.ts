/**
 * ColorLFO Block Compiler
 *
 * Generates animated color from phase input via hue rotation.
 * Takes phase [0,1] and produces Signal<color> as hex strings.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Convert hex color string to packed RGBA u32 number.
 * Used for color constants in IR.
 */
function hexToPackedRGBA(hex: string): number {
  const cleaned = hex.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const a = 255; // Full alpha
  // Pack as little-endian RGBA (matches runtime unpacking)
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
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

  const base = (config != null && typeof config === 'object' && 'base' in config && typeof config.base === 'string')
    ? config.base
    : '#3B82F6';
  const hueSpanValue = (config != null && typeof config === 'object' && 'hueSpan' in config)
    ? config.hueSpan
    : 180;
  const hueSpan = Number(hueSpanValue);
  // Note: sat and light are baked into the base color for Sprint 2
  // They would be used if we had a 3-input ColorHSLToRGB opcode

  const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
  const colorType: TypeDesc = { world: "signal", domain: "color", category: "core", busEligible: true };

  // Calculate hue shift: phase * hueSpan
  const hueSpanSig = ctx.b.sigConst(hueSpan, numberType);
  const hueShiftSig = ctx.b.sigZip(phase.id, hueSpanSig, { kind: 'opcode', opcode: OpCode.Mul }, numberType,);

  // Use ColorShiftHue to shift base color's hue by (phase * hueSpan)
  const baseColorSig = ctx.b.sigConst(hexToPackedRGBA(base), colorType);
  const colorSig = ctx.b.sigZip(baseColorSig, hueShiftSig, { kind: 'opcode', opcode: OpCode.ColorShiftHue }, colorType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'ColorLFO_out');
  return {
    outputs: [],
    outputsById: { color: { k: 'sig', id: colorSig, slot } },
  };
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
      type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'color',
      label: 'Color',
      dir: 'out',
      type: { world: "signal", domain: "color", category: "core", busEligible: true },
    },
  ],
  lower: lowerColorLFO,
});
