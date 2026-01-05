/**
 * FieldFromExpression Block Compiler
 *
 * Generates a Field<string> by evaluating a custom JavaScript expression
 * for each element. The expression can reference:
 * - i: element index (0 to n-1)
 * - n: total number of elements
 * - signal: the current signal value
 * - Math functions (sin, cos, abs, floor, etc.)
 * - hsl(h, s, l): helper to generate HSL color strings
 * - rgb(r, g, b): helper to generate RGB color strings
 *
 * Chain with FieldStringToColor to convert output to Field<color>.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldFromExpression: BlockLowerFn = ({ inputs, config }) => {
  const domain = inputs[0];

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldFromExpression requires domain input');
  }

  // This block evaluates arbitrary JavaScript expressions at runtime.
  // This is fundamentally incompatible with static IR because:
  // 1. The expression is user-provided code (security boundary)
  // 2. It uses JavaScript's eval/Function constructor (dynamic code generation)
  // 3. It references per-element indices (i, n) which require indexed iteration
  // 4. It evaluates signals at field materialization time
  // 5. It can use arbitrary Math functions and custom helpers (hsl, rgb)
  //
  // IR cannot support this because:
  // - IR is a static graph, not a runtime evaluator
  // - Dynamic code generation is the opposite of IR's purpose
  // - Rust/WASM compilation requires static, analyzable code
  // - Security: user expressions cannot be trusted in compiled code
  //
  // This block is not supported in IR. Use primitive blocks composed together instead.

  const expression = (config != null && typeof config === 'object' && 'expression' in config)
    ? String(config.expression)
    : 'hsl(i / n * 360 + signal * 360, 80, 60)';

  throw new Error(
    `FieldFromExpression cannot be lowered to IR (expression: "${expression}"). ` +
    'This block uses dynamic JavaScript evaluation which is fundamentally incompatible with static IR. ' +
    'For IR-compatible patches, compose primitive blocks instead of using custom expressions.'
  );
};

registerBlockType({
  type: 'FieldFromExpression',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "special", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, optional: true, defaultSource: { value: 0 } },
    {
      portId: 'expression',
      label: 'Expression',
      dir: 'in',
      type: { world: "scalar", domain: "string", category: "internal", busEligible: false },
      defaultSource: { value: 'hsl(i / n * 360 + signal * 360, 80, 60)' },
    },
  ],
  outputs: [
    { portId: 'field', label: 'Field', dir: 'out', type: { world: "field", domain: "string", category: "internal", busEligible: false } },
  ],
  lower: lowerFieldFromExpression,
});
