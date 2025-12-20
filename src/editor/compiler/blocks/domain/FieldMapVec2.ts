/**
 * FieldMapVec2 Block Compiler
 *
 * Takes a Field<vec2> and applies a transformation to each element.
 * Supports: rotate, scale, translate, reflect operations.
 */

import type { BlockCompiler, Vec2 } from '../../types';

type Vec2Field = (seed: number, n: number) => readonly Vec2[];

export const FieldMapVec2Block: BlockCompiler = {
  type: 'FieldMapVec2',

  inputs: [
    { name: 'vec', type: { kind: 'Field:vec2' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:vec2' } },
  ],

  compile({ params, inputs }) {
    const vecArtifact = inputs.vec;
    if (!vecArtifact || vecArtifact.kind !== 'Field:vec2') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldMapVec2 requires a Field<vec2> input',
        },
      };
    }

    const vecField = vecArtifact.value as Vec2Field;
    const fn = String(params.fn ?? 'rotate');
    const angle = Number(params.angle ?? 0);
    const scaleX = Number(params.scaleX ?? 1);
    const scaleY = Number(params.scaleY ?? 1);
    const offsetX = Number(params.offsetX ?? 0);
    const offsetY = Number(params.offsetY ?? 0);
    const centerX = Number(params.centerX ?? 400);
    const centerY = Number(params.centerY ?? 300);

    // Convert angle from degrees to radians
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Create the output field
    const outputField: Vec2Field = (seed, n) => {
      const inputVecs = vecField(seed, n);
      const out = new Array<Vec2>(n);

      for (let i = 0; i < n; i++) {
        const v = inputVecs[i]!;
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
