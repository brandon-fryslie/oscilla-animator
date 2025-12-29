/**
 * FieldFromSignalBroadcast Block Compiler
 *
 * Broadcasts a Signal<number> value to all elements in a domain,
 * creating a Field<number> where all elements have the same value.
 */

import type { BlockCompiler, Field, CompileCtx, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

/**
 * Extended context interface for field evaluation at runtime.
 * The compile-time context is extended with time information during rendering.
 */
interface FieldEvalCtx extends CompileCtx {
  /** Current time in milliseconds (available at runtime) */
  t: number;
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldFromSignalBroadcast: BlockLowerFn = ({ ctx, inputs }) => {
  const [domain, signal] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldFromSignalBroadcast requires domain input');
  }

  if (signal.k !== 'sig') {
    throw new Error('FieldFromSignalBroadcast requires signal input');
  }

  const outType = { world: 'field' as const, domain: 'number' as const };
  const fieldId = ctx.b.broadcastSigToField(signal.id, domain.id, outType);

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldFromSignalBroadcast',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' }, defaultSource: { value: 100 } },
    { portId: 'signal', label: 'Signal', dir: 'in', type: { world: 'signal', domain: 'number' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'field', label: 'Field', dir: 'out', type: { world: 'field', domain: 'number' } },
  ],
  lower: lowerFieldFromSignalBroadcast,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldFromSignalBroadcastBlock: BlockCompiler = {
  type: 'FieldFromSignalBroadcast',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'signal', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'field', type: { kind: 'Field:number' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    const signalArtifact = inputs.signal;

    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        field: {
          kind: 'Error',
          message: 'FieldFromSignalBroadcast requires a Domain input',
        },
      };
    }

    if (!isDefined(signalArtifact) || signalArtifact.kind !== 'Signal:number') {
      return {
        field: {
          kind: 'Error',
          message: 'FieldFromSignalBroadcast requires a Signal<number> input',
        },
      };
    }

    const domain = domainArtifact.value;
    const signalFn = signalArtifact.value;

    // Create field that broadcasts signal value to all elements
    // Note: ctx is typed as CompileCtx but at runtime contains time information
    const field: Field<number> = (_seed, n, ctx) => {
      const count = Math.min(n, domain.elements.length);

      // Evaluate signal once per frame (ctx is extended with .t at runtime)
      const runtimeCtx = ctx as FieldEvalCtx;
      const val = signalFn(runtimeCtx.t, runtimeCtx as unknown as RuntimeCtx);

      // Broadcast to all elements
      return Array<number>(count).fill(val);
    };

    return {
      field: { kind: 'Field:number', value: field },
    };
  },
};
