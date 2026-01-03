/**
 * FieldZipSignal Block Compiler
 *
 * Combines a Field<float> with a Signal<float> using a binary operation.
 * The signal is evaluated once per frame and combined with each field element.
 */

import type { BlockCompiler, Field, CompileCtx, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

/**
 * Extended context interface for field evaluation at runtime.
 */
interface FieldEvalCtx extends CompileCtx {
  /** Current time in milliseconds (available at runtime) */
  t: number;
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Get OpCode for a given operation name.
 */
function getOpCode(fn: string): OpCode {
  switch (fn) {
    case 'add': return OpCode.Add;
    case 'sub': return OpCode.Sub;
    case 'mul': return OpCode.Mul;
    case 'div': return OpCode.Div;
    case 'min': return OpCode.Min;
    case 'max': return OpCode.Max;
    default: return OpCode.Add; // Default to add
  }
}

/**
 * Get operation function for a given operation name (legacy closure compiler).
 */
function getZipOperation(fn: string): (a: number, b: number) => number {
  switch (fn) {
    case 'add': return (a, b) => a + b;
    case 'sub': return (a, b) => a - b;
    case 'mul': return (a, b) => a * b;
    case 'div': return (a, b) => (b !== 0 ? a / b : 0);
    case 'min': return (a, b) => Math.min(a, b);
    case 'max': return (a, b) => Math.max(a, b);
    default: return (a, b) => a + b; // Default to add
  }
}

const lowerFieldZipSignal: BlockLowerFn = ({ ctx, config, inputs }) => {
  const [field, signal] = inputs;

  if (field.k !== 'field') {
    throw new Error('FieldZipSignal requires field input');
  }

  if (signal.k !== 'sig') {
    throw new Error('FieldZipSignal requires signal input');
  }

  // Read operation from config (defaults to 'add')
  const configObj = (config != null && typeof config === 'object') ? config as Record<string, unknown> : {};
  const fn = typeof configObj.fn === 'string' ? configObj.fn : 'add';
  const opcode = getOpCode(fn);

  // Strategy: broadcast signal to field, then zip the two fields
  // This matches the semantic of "apply signal value to each field element"
  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };

  // Note: We need domain slot from the field input
  // For now, we'll create a placeholder - this will need proper domain tracking
  const domainType = { world: "config" as const, domain: "int" as const, category: "internal" as const, busEligible: false };
  const domainSlot = ctx.b.allocValueSlot(domainType, 'FieldZipSignal_domain');
  const broadcastField = ctx.b.broadcastSigToField(signal.id, domainSlot, outType);

  const fnRef = { kind: 'opcode' as const, opcode };
  const fieldId = ctx.b.fieldZip(field.id, broadcastField, fnRef, outType);

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'FieldZipSignal_out');
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldZipSignal',
  capability: 'pure',
  inputs: [
    { portId: 'field', label: 'Field', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldZipSignal,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldZipSignalBlock: BlockCompiler = {
  type: 'FieldZipSignal',

  inputs: [
    { name: 'field', type: { kind: 'Field:float' }, required: true },
    { name: 'signal', type: { kind: 'Signal:float' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:float' } },
  ],

  compile({ params, inputs }) {
    const fieldArtifact = inputs.field;
    const signalArtifact = inputs.signal;

    if (!isDefined(fieldArtifact) || fieldArtifact.kind !== 'Field:float') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipSignal requires a Field<float> for field input',
        },
      };
    }

    if (!isDefined(signalArtifact) || signalArtifact.kind !== 'Signal:float') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldZipSignal requires a Signal<float> for signal input',
        },
      };
    }

    const fieldFn = fieldArtifact.value;
    const signalFn = signalArtifact.value;
    const fn = typeof params.fn === 'string' ? params.fn : 'add';
    const zipOp = getZipOperation(fn);

    // Create combined field
    // Note: ctx is typed as CompileCtx but at runtime contains time information
    const combinedField: Field<float> = (seed, n, ctx) => {
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
      out: { kind: 'Field:float', value: combinedField },
    };
  },
};
