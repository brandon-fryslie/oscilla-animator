/**
 * FieldMapNumber Block Compiler
 *
 * Applies a unary function to each element of a numeric Field.
 * Supports various math functions and transformations.
 */

import type { BlockCompiler, Field, Artifact } from '../../types';
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
  const kRaw = Number(configObj?.k);
  const k = !isNaN(kRaw) && kRaw !== 0 ? kRaw : 1;
  const aRaw = Number(configObj?.a);
  const a = !isNaN(aRaw) ? aRaw : 0;
  const bRaw = Number(configObj?.b);
  const b = !isNaN(bRaw) ? bRaw : 1;

  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const opcode = getOpCode(fn);

  // Build the function reference using PureFnRef union types
  const fnRef = opcode !== undefined
    ? { kind: 'opcode' as const, opcode }
    : { kind: 'kernel' as const, kernelId: `map_${fn}` };

  const fieldId = ctx.b.fieldMap(x.id, fnRef, outType, { k, a, b });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldMapNumber_out');
  return {
    outputs: [],
    outputsById: { y: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldMapNumber',
  capability: 'pure',
  inputs: [
    { portId: 'x', label: 'X', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'y', label: 'Y', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldMapNumber,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldMapNumberBlock: BlockCompiler = {
  type: 'FieldMapNumber',

  inputs: [
    { name: 'x', type: { kind: 'Field:float' }, required: true },
    { name: 'fn', type: { kind: 'Scalar:string' }, required: false },
    { name: 'k', type: { kind: 'Scalar:float' }, required: false },
    { name: 'a', type: { kind: 'Scalar:float' }, required: false },
    { name: 'b', type: { kind: 'Scalar:float' }, required: false },
  ],

  outputs: [
    { name: 'y', type: { kind: 'Field:float' } },
  ],

  compile({ inputs, params }) {
    const inputField = inputs.x;
    if (!isDefined(inputField) || inputField.kind !== 'Field:float') {
      return {
        y: {
          kind: 'Error',
          message: 'FieldMapNumber requires a Field<float> input',
        },
      };
    }

    // Extract parameters with params fallback (for tests using old params system)
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:float' || artifact.kind === 'Signal:float') {
        return Number(artifact.value);
      }
      if ('value' in artifact && artifact.value !== undefined) {
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: object) => number)(0, {}))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    const extractString = (artifact: Artifact | undefined, defaultValue: string): string => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:string') {
        return String(artifact.value);
      }
      if ('value' in artifact && artifact.value !== undefined) {
        const val = artifact.value;
        if (typeof val === 'string') {
          return val;
        }
        if (typeof val === 'function') {
          return String((val as (t: number, ctx: object) => string)(0, {}));
        }
        // For non-string primitives (number, boolean), convert to string
        if (typeof val === 'number' || typeof val === 'boolean') {
          return String(val);
        }
      }
      return defaultValue;
    };

    const paramsObj = params as { fn?: string; k?: number; a?: number; b?: number } | undefined;
    const fn = extractString(inputs.fn, paramsObj?.fn ?? 'sin');
    const k = extractNumber(inputs.k, paramsObj?.k ?? 1);
    const a = extractNumber(inputs.a, paramsObj?.a ?? 0);
    const b = extractNumber(inputs.b, paramsObj?.b ?? 1);

    const inputFieldFn = inputField.value;
    const mapFn = getMapFunction(fn, k, a, b);

    // Create mapped field
    const field: Field<float> = (seed, n, ctx) => {
      const inputValues = inputFieldFn(seed, n, ctx);
      return inputValues.map(mapFn);
    };

    return {
      y: { kind: 'Field:float', value: field },
    };
  },
};
