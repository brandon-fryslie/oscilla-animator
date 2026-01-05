/**
 * FieldAddVec2 Block Compiler
 *
 * Adds two vec2 Fields element-wise.
 * Useful for composing base positions with offsets/drift.
 */

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

  const outType = { world: "field" as const, domain: "vec2" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.fieldZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Vec2Add }, outType,);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldAddVec2_out');
  return {
    outputs: [],
    outputsById: { out: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldAddVec2',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: "field", domain: "vec2", category: "core", busEligible: true }, defaultSource: { value: [0, 0] } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: "field", domain: "vec2", category: "core", busEligible: true }, defaultSource: { value: [0, 0] } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerFieldAddVec2,
});
