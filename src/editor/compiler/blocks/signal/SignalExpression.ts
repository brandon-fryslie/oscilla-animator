/**
 * SignalExpression Block Compiler
 *
 * Transforms a signal value using a custom JavaScript expression.
 * The expression can reference:
 * - value: the current input signal value
 * - t: the current time
 * - Math: all Math functions (sin, cos, abs, floor, etc.)
 *
 * Examples:
 * - "value * 2" - double the input
 * - "Math.sin(value * Math.PI * 2)" - sine wave from [0,1] input
 * - "value > 0.5 ? 1 : 0" - threshold to binary
 * - "Math.pow(value, 2)" - square the input
 * - "(value + t) % 1" - phase offset by time
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerSignalExpression: BlockLowerFn = ({ config }) => {
  // This block evaluates arbitrary JavaScript expressions at runtime.
  // This is fundamentally incompatible with static IR because:
  // 1. The expression is user-provided code (security boundary)
  // 2. It uses JavaScript's eval/Function constructor (dynamic code generation)
  // 3. Rust/WASM compilation requires static, analyzable code
  // 4. Security: user expressions cannot be trusted in compiled code
  //
  // This block is not supported in IR. Use primitive blocks composed together instead.

  const expression = (config as any)?.expression ?? 'value';

  throw new Error(
    `SignalExpression cannot be lowered to IR (expression: "${expression}"). ` +
    'This block uses dynamic JavaScript evaluation which is fundamentally incompatible with static IR. ' +
    'For IR-compatible patches, compose primitive blocks instead of using custom expressions.'
  );
};

registerBlockType({
  type: 'SignalExpression',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, lanes: [1] } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, lanes: [1] } },
  ],
  lower: lowerSignalExpression,
});
