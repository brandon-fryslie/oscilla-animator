/**
 * FieldZipSignal Block Compiler
 *
 * Combines a Field<number> with a Signal<number> using a binary operation.
 * The signal is evaluated once per frame and the operation is applied to each element.
 */

import type { BlockCompiler, Field, CompileCtx, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Extended context interface for field evaluation at runtime.
 * The compile-time context is extended with time information during rendering.
 */
interface FieldEvalCtx extends CompileCtx {
  /** Current time in milliseconds (available at runtime) */
  t: number;
}

/**
 * Get the binary operation by name
 */
function getZipOperation(fn: string): (a: number, b: number) => number {
  switch (fn) {
    case 'add':
      return (a, b) => a + b;
    case 'sub':
      return (a, b) => a - b;
    case 'mul':
      return (a, b) => a * b;
    case 'min':
      return (a, b) => Math.min(a, b);
    case 'max':
      return (a, b) => Math.max(a, b);
    default:
      return (a, _b) => a; // default to first (field value)
  }
}

/**
 * Map operation name to OpCode
 */
function getOpCode(fn: string): OpCode {
  switch (fn) {
    case 'add':
      return OpCode.Add;
    case 'sub':
      return OpCode.Sub;
    case 'mul':
      return OpCode.Mul;
    case 'min':
      return OpCode.Min;
    case 'max':
      return OpCode.Max;
    default:
      return OpCode.Add;
  }
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldZipSignal: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [field, signal] = inputs;

  if (field.k !== 'field') {
    throw new Error('FieldZipSignal requires field input');
  }

  if (signal.k !== 'sig') {
    throw new Error('FieldZipSignal requires signal input');
  }

  // Extract operation from config
  const configObj = config as { fn?: string } | undefined;
  const fn = configObj?.fn ?? 'add';
  const opcode = getOpCode(fn);

  // Strategy: broadcast signal to field, then zip the two fields
  // This matches the semantic of "apply signal value to each field element"
  const outType = { world: 'field' as const, domain: 'number' as const };

  // Note: We need domain slot from the field input
  // For now, we'll create a placeholder - this will need proper domain tracking
  const domainSlot = ctx.b.allocValueSlot();
  const broadcastField = ctx.b.broadcastSigToField(signal.id, domainSlot, outType);

  const fnRef = { kind: 'opcode' as const, opcode };
  const fieldId = ctx.b.fieldZip(field.id, broadcastField, fnRef, outType);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldZipSignal',
  capability: 'pure',
  inputs: [
    { portId: 'field', label: 'Field', dir: 'in', type: { world: 'field', domain: 'number' } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: 'signal', domain: 'number' } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'field', domain: 'number' } },
  ],
  lower: lowerFieldZipSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldZipSignalBlock: BlockCompiler = {
  type: 'FieldZipSignal',

  inputs: [
    { name: 'field', type: { kind: 'Field:number' }, required: true },
    { name: 'signal', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const fieldArtifact = inputs.field;
    const signalArtifact = inputs.signal;

    if (!isDefined(fieldArtifact) || fieldArtifact.kind !== 'Field:number') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipSignal requires a Field<number> for field input',
        },
      };
    }

    if (!isDefined(signalArtifact) || signalArtifact.kind !== 'Signal:number') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipSignal requires a Signal<number> for signal input',
        },
      };
    }

    const fieldFn = fieldArtifact.value;
    const signalFn = signalArtifact.value;
    const fn = typeof params.fn === 'string' ? params.fn : 'add';
    const zipOp = getZipOperation(fn);

    // Create combined field
    // Note: ctx is typed as CompileCtx but at runtime contains time information
    const combinedField: Field<number> = (seed, n, ctx) => {
      // Evaluate field to get per-element values
      const fieldValues = fieldFn(seed, n, ctx);

      // Evaluate signal once for this frame (ctx is extended with .t at runtime)
      const runtimeCtx = ctx as FieldEvalCtx;
      const signalValue = signalFn(runtimeCtx.t, runtimeCtx as unknown as RuntimeCtx);

      // Apply operation to each element
      const out = new Array<number>(fieldValues.length);
      for (let i = 0; i < fieldValues.length; i++) {
        out[i] = zipOp(fieldValues[i], signalValue);
      }

      return out;
    };

    return {
      out: { kind: 'Field:number', value: combinedField },
    };
  },
};
