/**
 * FieldAddVec2 Block Compiler
 *
 * Adds two vec2 Fields element-wise.
 * Useful for composing base positions with offsets/drift.
 */

import type { BlockCompiler, Vec2, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldAddVec2: BlockLowerFn = ({ ctx, inputs }) => {
  const [a, b] = inputs;

  if (a.k !== 'field' || b.k !== 'field') {
    throw new Error('FieldAddVec2 requires field inputs');
  }

  const outType = { world: 'field' as const, domain: 'vec2' as const };
  const fieldId = ctx.b.fieldZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Vec2Add }, outType,);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldAddVec2',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'field', domain: 'vec2' }, defaultSource: { value: [0, 0] } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'field', domain: 'vec2' }, defaultSource: { value: [0, 0] } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerFieldAddVec2,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

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
