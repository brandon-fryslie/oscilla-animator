/**
 * FieldOpacity Block Compiler
 *
 * Converts a numeric Field to opacity values with range mapping and curve application.
 * Takes Field<number> and produces Field<number> clamped to [min, max] with optional curve.
 */

import type { BlockCompiler, Field } from '../../types';

/**
 * Apply curve transformation to value in [0,1]
 */
function applyCurve(t: number, curve: string): number {
  const u = Math.max(0, Math.min(1, t));

  switch (curve) {
    case 'smoothstep':
      return u * u * (3 - 2 * u);
    case 'square':
      return u * u;
    case 'sqrt':
      return Math.sqrt(u);
    case 'linear':
    default:
      return u;
  }
}

export const FieldOpacityBlock: BlockCompiler = {
  type: 'FieldOpacity',

  inputs: [
    { name: 'values', type: { kind: 'Field:number' }, required: true },
  ],

  outputs: [
    { name: 'opacity', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const valuesArtifact = inputs.values;
    if (!valuesArtifact || valuesArtifact.kind !== 'Field:number') {
      return {
        opacity: {
          kind: 'Error',
          message: 'FieldOpacity requires a Field<number> input',
        },
      };
    }

    const valuesFn = valuesArtifact.value as Field<number>;
    const min = Number(params.min ?? 0);
    const max = Number(params.max ?? 1);
    const curve = String(params.curve ?? 'linear');

    // Create opacity field
    const field: Field<number> = (seed, n, ctx) => {
      const values = valuesFn(seed, n, ctx);
      return values.map((v) => {
        const normalized = Math.max(0, Math.min(1, v));
        const curved = applyCurve(normalized, curve);
        return min + (max - min) * curved;
      });
    };

    return {
      opacity: { kind: 'Field:number', value: field },
    };
  },
};
