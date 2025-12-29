/**
 * FieldMapVec2 Block Compiler
 *
 * Takes a Field<vec2> and applies a transformation to each element.
 * Supports: rotate, scale, translate, reflect operations.
 */

import type { BlockCompiler, Vec2 } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type Vec2Field = (seed: number, n: number) => readonly Vec2[];

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldMapVec2: BlockLowerFn = ({ inputs, config }) => {
  const vec = inputs[0];

  if (vec.k !== 'field') {
    throw new Error('FieldMapVec2 requires field input');
  }

  // This block requires parameterized field transformations (rotate, scale, translate, reflect)
  // with runtime-computed transformation matrices based on config params (angle, scaleX, scaleY, etc.)
  //
  // IR options:
  // 1. Implement as fieldMap with custom transformation kernel
  // 2. Decompose into primitive vec2 operations (Vec2Rotate, Vec2Scale, etc.) applied per element
  // 3. Build transformation matrix and apply via fieldMap
  //
  // All approaches require field-level vec2 operations that aren't yet implemented.
  // The current IRBuilder only has signal-level vec2 ops (Vec2Rotate, etc.)

  const fn = (config != null && typeof config === 'object' && 'fn' in config && typeof config.fn === 'string')
    ? config.fn
    : 'rotate';

  throw new Error(
    `FieldMapVec2 IR lowering requires field-level vec2 transformations (function: ${fn}). ` +
    'This needs either: (1) fieldMap with custom vec2 transformation kernels, or ' +
    '(2) field-level Vec2Rotate/Vec2Scale/Vec2Translate opcodes. ' +
    'Block remains in closure mode until field vec2 operations are implemented in IR.'
  );
};

registerBlockType({
  type: 'FieldMapVec2',
  capability: 'pure',
  inputs: [
    { portId: 'vec', label: 'Vec2', dir: 'in', type: { world: 'field', domain: 'vec2' }, defaultSource: { value: [0, 0] } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerFieldMapVec2,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldMapVec2Block: BlockCompiler = {
  type: 'FieldMapVec2',

  inputs: [
    { name: 'vec', type: { kind: 'Field:vec2' }, required: true },
    { name: 'fn', type: { kind: 'Scalar:string' }, required: false },
    { name: 'angle', type: { kind: 'Signal:number' }, required: false },
    { name: 'scaleX', type: { kind: 'Signal:number' }, required: false },
    { name: 'scaleY', type: { kind: 'Signal:number' }, required: false },
    { name: 'offsetX', type: { kind: 'Signal:number' }, required: false },
    { name: 'offsetY', type: { kind: 'Signal:number' }, required: false },
    { name: 'centerX', type: { kind: 'Signal:number' }, required: false },
    { name: 'centerY', type: { kind: 'Signal:number' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:vec2' } },
  ],

  compile({ inputs }) {
    const vecArtifact = inputs.vec;
    if (!isDefined(vecArtifact) || vecArtifact.kind !== 'Field:vec2') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldMapVec2 requires a Field<vec2> input',
        },
      };
    }

    const vecField = vecArtifact.value as Vec2Field;
    // Read from inputs - values come from defaultSource or explicit connections
    const fnArtifact = inputs.fn;
    const fn = fnArtifact !== undefined && 'value' in fnArtifact && typeof fnArtifact.value === 'string'
      ? fnArtifact.value
      : 'rotate';
    const angleArtifact = inputs.angle;
    const angle = angleArtifact !== undefined && 'value' in angleArtifact ? Number(angleArtifact.value) : 0;
    const scaleXArtifact = inputs.scaleX;
    const scaleX = scaleXArtifact !== undefined && 'value' in scaleXArtifact ? Number(scaleXArtifact.value) : 1;
    const scaleYArtifact = inputs.scaleY;
    const scaleY = scaleYArtifact !== undefined && 'value' in scaleYArtifact ? Number(scaleYArtifact.value) : 1;
    const offsetXArtifact = inputs.offsetX;
    const offsetX = offsetXArtifact !== undefined && 'value' in offsetXArtifact ? Number(offsetXArtifact.value) : 0;
    const offsetYArtifact = inputs.offsetY;
    const offsetY = offsetYArtifact !== undefined && 'value' in offsetYArtifact ? Number(offsetYArtifact.value) : 0;
    const centerXArtifact = inputs.centerX;
    const centerX = centerXArtifact !== undefined && 'value' in centerXArtifact ? Number(centerXArtifact.value) : 0;
    const centerYArtifact = inputs.centerY;
    const centerY = centerYArtifact !== undefined && 'value' in centerYArtifact ? Number(centerYArtifact.value) : 0;

    // Convert angle from degrees to radians
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Create the output field
    const outputField: Vec2Field = (seed, n) => {
      const inputVecs = vecField(seed, n);
      const out = new Array<Vec2>(n);

      for (let i = 0; i < n; i++) {
        const v = inputVecs[i];
        let x = v.x;
        let y = v.y;

        switch (fn) {
          case 'rotate': {
            // Rotate around center point
            const dx = x - centerX;
            const dy = y - centerY;
            x = centerX + dx * cos - dy * sin;
            y = centerY + dx * sin + dy * cos;
            break;
          }
          case 'scale': {
            // Scale around center point
            const dx = x - centerX;
            const dy = y - centerY;
            x = centerX + dx * scaleX;
            y = centerY + dy * scaleY;
            break;
          }
          case 'translate': {
            // Simple translation
            x = x + offsetX;
            y = y + offsetY;
            break;
          }
          case 'reflect': {
            // Reflect around center point
            const dx = x - centerX;
            const dy = y - centerY;
            x = centerX - dx;
            y = centerY - dy;
            break;
          }
          default:
            // Unknown function, return unchanged
            break;
        }

        out[i] = { x, y };
      }

      return out;
    };

    return {
      out: { kind: 'Field:vec2', value: outputField },
    };
  },
};
