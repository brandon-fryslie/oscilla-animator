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

export const FieldFromExpressionBlock: BlockCompiler = {
  type: 'FieldFromExpression',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    // Accept Signal:phase (from phaseA bus) or Signal:number
    { name: 'signal', type: { kind: 'Signal:phase' }, required: false },
  ],

  outputs: [
    { name: 'field', type: { kind: 'Field:string' } },
  ],

  compile({ params, inputs }) {
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
    const expression = String(params.expression ?? 'hsl(i / n * 360 + signal * 360, 80, 60)');
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
