/**
 * RotationField Block Compiler
 *
 * Generates per-element rotation angles in degrees.
 * Used for kinetic animations, 3D transforms, wave ripple.
 *
 * Outputs: Field<number> of rotation angles in degrees.
 */

import type { BlockCompiler, Field } from '../../../types';

type RotationMode = 'constant' | 'random' | 'sequential' | 'radial';

export const RotationFieldBlock: BlockCompiler = {
  type: 'RotationField',
  inputs: [],
  outputs: [{ name: 'rotations', type: { kind: 'Field:number' } }],

  compile({ params }) {
    const mode = (params.mode as RotationMode) ?? 'random';
    const baseRotation = Number(params.baseRotation ?? 0);
    const range = Number(params.range ?? 360);
    const direction = Number(params.direction ?? 1); // 1 = clockwise, -1 = counter

    const rotations: Field<number> = (seed, n) => {
      const out = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        let rotation: number;

        switch (mode) {
          case 'constant':
            rotation = baseRotation;
            break;

          case 'random': {
            const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
            const rand = t - Math.floor(t);
            rotation = baseRotation + (rand - 0.5) * 2 * range * direction;
            break;
          }

          case 'sequential': {
            // Each element rotates incrementally
            const step = range / Math.max(1, n - 1);
            rotation = baseRotation + i * step * direction;
            break;
          }

          case 'radial': {
            // Rotation based on position around circle
            rotation = baseRotation + (i / n) * 360 * direction;
            break;
          }

          default:
            rotation = baseRotation;
        }

        out[i] = rotation;
      }

      return out;
    };

    return { rotations: { kind: 'Field:number', value: rotations } };
  },
};
