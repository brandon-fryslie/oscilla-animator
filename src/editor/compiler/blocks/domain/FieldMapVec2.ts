/**
 * FieldMapVec2 Block Compiler
 *
 * Takes a Field<vec2> and applies a transformation to each element.
 * Supports: rotate, scale, translate, reflect operations.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

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
    'This block is not yet supported in IR until field vec2 operations are implemented.'
  );
};

registerBlockType({
  type: 'FieldMapVec2',
  capability: 'pure',
  inputs: [
    { portId: 'vec', label: 'Vec2', dir: 'in', type: { world: "field", domain: "vec2", category: "core", busEligible: true }, defaultSource: { value: [0, 0] } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerFieldMapVec2,
});
