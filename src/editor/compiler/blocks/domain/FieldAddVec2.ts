/**
 * FieldAddVec2 Block Compiler
 *
 * Adds two vec2 Fields element-wise.
 * Useful for composing base positions with offsets/drift.
 */

import type { BlockCompiler, Vec2, Field } from '../../types';
import { isDefined } from '../../../types/helpers';

export const FieldAddVec2Block: BlockCompiler = {
  type: 'FieldAddVec2',

  inputs: [
    { name: 'a', type: { kind: 'Field:vec2' }, required: true },
    { name: 'b', type: { kind: 'Field:vec2' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:vec2' } },
  ],

  compile({ inputs }) {
    const fieldA = inputs.a;
    const fieldB = inputs.b;

    if (!isDefined(fieldA) || fieldA.kind !== 'Field:vec2') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldAddVec2 requires a Field<vec2> for input A',
        },
      };
    }

    if (!isDefined(fieldB) || fieldB.kind !== 'Field:vec2') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldAddVec2 requires a Field<vec2> for input B',
        },
      };
    }

    const fieldAFn = fieldA.value;
    const fieldBFn = fieldB.value;

    // Create summed field
    const field: Field<Vec2> = (seed, n, ctx) => {
      const valuesA = fieldAFn(seed, n, ctx);
      const valuesB = fieldBFn(seed, n, ctx);
      const count = Math.min(valuesA.length, valuesB.length);

      const out = new Array<Vec2>(count);
      for (let i = 0; i < count; i++) {
        const a = valuesA[i];
        const b = valuesB[i];
        out[i] = { x: a.x + b.x, y: a.y + b.y };
      }

      return out;
    };

    return {
      out: { kind: 'Field:vec2', value: field },
    };
  },
};
