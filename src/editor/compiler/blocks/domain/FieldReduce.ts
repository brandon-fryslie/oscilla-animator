/**
 * FieldReduce Block Compiler
 *
 * Reduces a Field<float> to a Signal<float> using an aggregation operation.
 * This is the inverse of FieldFromSignalBroadcast - it converts per-element
 * data back into a single time-varying value.
 *
 * Essential for publishing field-derived values to buses (which expect Signals).
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import type { ReduceFn } from '../../ir/builderTypes';

type ReduceOp = 'avg' | 'max' | 'min' | 'sum' | 'first';

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
