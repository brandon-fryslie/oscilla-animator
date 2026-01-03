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

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

/**
 * Create a function from an expression string.
 * Returns number (coerced if expression returns other type).
 */
function createExpressionEvaluator(
  expression: string
): (value: number, t: number) => number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(
      'value',
      't',
      'Math',
      `"use strict"; return (${expression});`
    );
    return (value: number, t: number) => {
      try {
        const result = fn(value, t, Math);
        return Number(result);
      } catch {
        return 0;
      }
    };
  } catch {
    return () => 0;
  }
}

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
  // This block MUST remain in closure mode permanently.
  // For IR, users should use primitive blocks composed together instead of expressions.

  const expression = (config as any)?.expression ?? 'value';

  throw new Error(
    `SignalExpression cannot be lowered to IR (expression: "${expression}"). ` +
    'This block uses dynamic JavaScript evaluation which is fundamentally incompatible with static IR. ' +
    'It must remain in closure mode permanently. ' +
    'For IR-compatible patches, compose primitive blocks instead of using custom expressions.'
  );
};

registerBlockType({
  type: 'SignalExpression',
  capability: 'pure',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: 'signal', domain: 'number' } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerSignalExpression,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const SignalExpressionBlock: BlockCompiler = {
  type: 'SignalExpression',

  inputs: [
    { name: 'value', type: { kind: 'Signal:number' }, required: false },
    { name: 'expression', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }) {
    // Get input signal - fall back to constant 0 if not connected
    const valueArtifact = inputs.value;
    let inputSignal: Signal<number>;

    if (valueArtifact === undefined) {
      // No input connected - use constant 0
      inputSignal = () => 0;
    } else if (valueArtifact.kind === 'Signal:number') {
      inputSignal = valueArtifact.value as Signal<number>;
    } else if (valueArtifact.kind === 'Signal:phase') {
      // Also accept phase signals (they're just numbers 0-1)
      inputSignal = valueArtifact.value as Signal<number>;
    } else if (valueArtifact.kind === 'Scalar:number') {
      // Lift scalar to constant signal
      const constVal = valueArtifact.value as number;
      inputSignal = () => constVal;
    } else {
      return {
        out: {
          kind: 'Error',
          message: `SignalExpression: expected Signal<number> input, got ${valueArtifact.kind}`,
        },
      };
    }

    // Get expression from config input
    const expressionArtifact = inputs.expression;
    const expression = expressionArtifact !== undefined
      ? String((expressionArtifact as any).value ?? 'value')
      : 'value';

    const evaluator = createExpressionEvaluator(expression);

    // Create output signal that evaluates the expression
    const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const value = inputSignal(t, ctx);
      return evaluator(value, t);
    };

    return {
      out: { kind: 'Signal:number', value: signal },
    };
  },
};
