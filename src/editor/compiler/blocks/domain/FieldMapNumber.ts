/**
 * FieldMapNumber Block Compiler
 *
 * Applies a unary function to each element of a numeric Field.
 * Supports various math functions and transformations.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Smoothstep interpolation
 */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Get the unary function by name
 */
function getMapFunction(
  fn: string,
  k: number,
  a: number,
  b: number
): (x: number) => number {
  switch (fn) {
    case 'neg':
      return (x) => -x;
    case 'abs':
      return (x) => Math.abs(x);
    case 'sin':
      return (x) => Math.sin(x * k);
    case 'cos':
      return (x) => Math.cos(x * k);
    case 'tanh':
      return (x) => Math.tanh(x * k);
    case 'smoothstep':
      return (x) => smoothstep((x - a) / (b - a));
    case 'scale':
      return (x) => x * k;
    case 'offset':
      return (x) => x + k;
    case 'clamp':
      return (x) => Math.max(a, Math.min(b, x));
    default:
      return (x) => x; // identity
  }
}

/**
 * Map function name to OpCode (for simple cases)
 */
function getOpCode(fn: string): OpCode | undefined {
  switch (fn) {
    case 'neg':
      return undefined; // Use kernel
    case 'abs':
      return OpCode.Abs;
    case 'sin':
      return OpCode.Sin;
    case 'cos':
      return OpCode.Cos;
    default:
      return undefined; // Use kernel for complex operations
  }
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldMapNumber: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [x] = inputs;

  if (x.k !== 'field') {
    throw new Error('FieldMapNumber requires field input');
  }

  // Extract params from config
  const configObj = config as { fn?: string; k?: unknown; a?: unknown; b?: unknown } | undefined;
  const fn = configObj?.fn ?? 'sin';
  const k = Number(configObj?.k ?? 1);
  const a = Number(configObj?.a ?? 0);
  const b = Number(configObj?.b ?? 1);

  const outType = { world: 'field' as const, domain: 'number' as const };
  const opcode = getOpCode(fn);

  // Build the function reference
  const fnRef = opcode
    ? {
        fnId: fn,
        opcode,
        outputType: outType,
        params: { k, a, b },
      }
    : {
        fnId: `map_${fn}`,
        outputType: outType,
        params: { k, a, b },
      };

  const fieldId = ctx.b.fieldMap(x.id, fnRef);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldMapNumber',
  capability: 'pure',
  inputs: [
    { portId: 'x', label: 'X', dir: 'in', type: { world: 'field', domain: 'number' } },
  ],
  outputs: [
    { portId: 'y', label: 'Y', dir: 'out', type: { world: 'field', domain: 'number' } },
  ],
  lower: lowerFieldMapNumber,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldMapNumberBlock: BlockCompiler = {
  type: 'FieldMapNumber',

  inputs: [
    { name: 'x', type: { kind: 'Field:number' }, required: true },
    { name: 'fn', type: { kind: 'Scalar:string' }, required: false },
    { name: 'k', type: { kind: 'Scalar:number' }, required: false },
    { name: 'a', type: { kind: 'Scalar:number' }, required: false },
    { name: 'b', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [
    { name: 'y', type: { kind: 'Field:number' } },
  ],

  compile({ inputs, params }) {
    const inputField = inputs.x;
    if (!isDefined(inputField) || inputField.kind !== 'Field:number') {
      return {
        y: {
          kind: 'Error',
          message: 'FieldMapNumber requires a Field<number> input',
        },
      };
    }

    // Extract parameters with params fallback (for tests using old params system)
    const extractNumber = (artifact: any, defaultValue: number): number => {
      if (!artifact) return defaultValue;
      if (artifact.kind === 'Scalar:number' || artifact.kind === 'Signal:number')
        return Number(artifact.value);
      return typeof artifact.value === 'function'
        ? Number(artifact.value(0, {}))
        : Number(artifact.value);
    };

    const extractString = (artifact: any, defaultValue: string): string => {
      if (!artifact) return defaultValue;
      if (artifact.kind === 'Scalar:string' || artifact.kind === 'Signal:string')
        return String(artifact.value);
      return typeof artifact.value === 'function'
        ? String(artifact.value(0, {}))
        : String(artifact.value);
    };

    const fn = extractString(inputs.fn, (params as any)?.fn ?? 'sin');
    const k = extractNumber(inputs.k, (params as any)?.k ?? 1);
    const a = extractNumber(inputs.a, (params as any)?.a ?? 0);
    const b = extractNumber(inputs.b, (params as any)?.b ?? 1);

    const inputFieldFn = inputField.value;
    const mapFn = getMapFunction(fn, k, a, b);

    // Create mapped field
    const field: Field<number> = (seed, n, ctx) => {
      const inputValues = inputFieldFn(seed, n, ctx);
      return inputValues.map(mapFn);
    };

    return {
      y: { kind: 'Field:number', value: field },
    };
  },
};
