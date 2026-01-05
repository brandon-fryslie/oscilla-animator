/**
 * FieldReduce Block Compiler
 *
 * Reduces a Field<float> to a Signal<float> using an aggregation operation.
 * This is the inverse of FieldFromSignalBroadcast - it converts per-element
 * data back into a single time-varying value.
 *
 * Essential for publishing field-derived values to buses (which expect Signals).
 */

import type { BlockCompiler, CompileCtx, RuntimeCtx, GeometryCache } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import type { ReduceFn } from '../../ir/builderTypes';

type ReduceOp = 'avg' | 'max' | 'min' | 'sum' | 'first';

function reduceArray(values: readonly float[], op: ReduceOp): float {
  if (values.length === 0) return 0;

  switch (op) {
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'first':
      return values[0];
    default:
      return values[0];
  }
}

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldReduce: BlockLowerFn = ({ ctx, inputs, config }) => {
  const field = inputs[0];

  if (field.k !== 'field') {
    throw new Error('FieldReduce requires field input');
  }

  const cfg = config as { op?: string } | undefined;
  const op = (cfg?.op ?? 'avg') as ReduceOp;

  // Map reduce operations to ReduceFn interface
  const reduceFn: ReduceFn = {
    reducerId: op,
    outputType: { world: "signal", domain: "float", category: "core", busEligible: true },
  };

  // Use IRBuilder's reduceFieldToSig method
  const sigId = ctx.b.reduceFieldToSig(field.id, reduceFn);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldReduce_out');
  return {
    outputs: [],
    outputsById: { signal: { k: 'sig', id: sigId, slot } },
  };
};

registerBlockType({
  type: 'FieldReduce',
  capability: 'pure',
  inputs: [
    { portId: 'field', label: 'Field', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'signal', label: 'Signal', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldReduce,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldReduceBlock: BlockCompiler = {
  type: 'FieldReduce',

  inputs: [
    { name: 'field', type: { kind: 'Field:float' }, required: true },
  ],

  outputs: [
    { name: 'signal', type: { kind: 'Signal:float' } },
  ],

  compile({ inputs, params }) {
    const fieldArtifact = inputs.field;
    const op = (typeof params.op === 'string' ? params.op : 'avg') as ReduceOp;

    if (!isDefined(fieldArtifact) || fieldArtifact.kind !== 'Field:float') {
      return {
        signal: {
          kind: 'Error',
          message: 'FieldReduce requires a Field<float> input',
        },
      };
    }

    const fieldFn = fieldArtifact.value;

    // We need a domain to evaluate the field. The field function captures its domain
    // from the upstream block that created it. We'll evaluate with a reasonable count.
    // The field function signature is: (seed, n, ctx) => readonly T[]

    // Create a signal that evaluates the field and reduces it
    // Note: At runtime, ctx contains time information
    const signalFn = (_t: number, _ctx: RuntimeCtx): number => {
      // Evaluate the field - use a default seed and get all elements
      // The field has captured its domain, so n here is max elements to retrieve
      // Create a minimal CompileCtx for field evaluation
      const geom: GeometryCache = {
        get<K extends object, V>(_key: K, compute: () => V): V {
          return compute();
        },
        invalidate() {},
      };
      const compileCtx: CompileCtx = { env: {}, geom };
      const values = fieldFn(0, 1000, compileCtx);
      return reduceArray(values, op);
    };

    return {
      signal: { kind: 'Signal:float', value: signalFn },
    };
  },
};
