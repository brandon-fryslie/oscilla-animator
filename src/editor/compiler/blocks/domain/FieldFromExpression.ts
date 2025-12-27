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

import type { BlockCompiler, Field, CompileCtx, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

interface FieldEvalCtx extends CompileCtx {
  t: number;
}

// Helper functions available in expressions
const hsl = (h: number, s: number, l: number): string =>
  `hsl(${((h % 360) + 360) % 360}, ${Math.max(0, Math.min(100, s))}%, ${Math.max(0, Math.min(100, l))}%)`;

const rgb = (r: number, g: number, b: number): string =>
  `rgb(${Math.max(0, Math.min(255, Math.round(r)))}, ${Math.max(0, Math.min(255, Math.round(g)))}, ${Math.max(0, Math.min(255, Math.round(b)))})`;

/**
 * Create a function from an expression string.
 * Returns string (coerced if expression returns number).
 */
function createExpressionEvaluator(
  expression: string
): (i: number, n: number, signal: number) => string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(
      'i',
      'n',
      'signal',
      'Math',
      'hsl',
      'rgb',
      `"use strict"; return (${expression});`
    );
    return (i: number, n: number, signal: number) => {
      try {
        const result = fn(i, n, signal, Math, hsl, rgb);
        return String(result);
      } catch {
        return '#000000';
      }
    };
  } catch {
    return () => '#000000';
  }
}

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
  // This block MUST remain in closure mode permanently.
  // For IR, users should use primitive blocks composed together instead of expressions.

  const expression = (config as any)?.expression ?? 'hsl(i / n * 360 + signal * 360, 80, 60)';

  throw new Error(
    `FieldFromExpression cannot be lowered to IR (expression: "${expression}"). ` +
    'This block uses dynamic JavaScript evaluation which is fundamentally incompatible with static IR. ' +
    'It must remain in closure mode permanently. ' +
    'For IR-compatible patches, compose primitive blocks instead of using custom expressions.'
  );
};

registerBlockType({
  type: 'FieldFromExpression',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: 'signal', domain: 'phase01' }, optional: true },
  ],
  outputs: [
    { portId: 'field', label: 'Field', dir: 'out', type: { world: 'field', domain: 'string' } },
  ],
  lower: lowerFieldFromExpression,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldFromExpressionBlock: BlockCompiler = {
  type: 'FieldFromExpression',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    // Accept Signal:phase (from phaseA bus) or Signal:number
    { name: 'signal', type: { kind: 'Signal:phase' }, required: false },
    { name: 'expression', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'field', type: { kind: 'Field:string' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    const signalArtifact = inputs.signal;

    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        field: {
          kind: 'Error',
          message: 'FieldFromExpression requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    // Read from inputs - values come from defaultSource or explicit connections
    const expression = String((inputs.expression as any)?.value);
    const evaluator = createExpressionEvaluator(expression);

    // Accept Signal:phase or Signal:number (both are numeric)
    const signalFn = isDefined(signalArtifact) &&
      (signalArtifact.kind === 'Signal:phase' || signalArtifact.kind === 'Signal:number')
      ? signalArtifact.value
      : () => 0;

    const field: Field<string> = (_seed, n, ctx) => {
      const count = Math.min(n, domain.elements.length);
      const runtimeCtx = ctx as FieldEvalCtx;
      const signalValue = signalFn(runtimeCtx.t, runtimeCtx as unknown as RuntimeCtx);

      const result: string[] = new Array(count);
      for (let i = 0; i < count; i++) {
        result[i] = evaluator(i, count, signalValue);
      }

      return result;
    };

    return {
      field: { kind: 'Field:string', value: field },
    };
  },
};
