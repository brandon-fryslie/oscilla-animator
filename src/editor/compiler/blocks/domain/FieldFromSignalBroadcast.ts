/**
 * FieldFromSignalBroadcast Block Compiler
 *
 * Broadcasts a Signal<number> value to all elements in a domain,
 * creating a Field<number> where all elements have the same value.
 */

import type { BlockCompiler, Field, CompileCtx, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';

/**
 * Extended context interface for field evaluation at runtime.
 * The compile-time context is extended with time information during rendering.
 */
interface FieldEvalCtx extends CompileCtx {
  /** Current time in milliseconds (available at runtime) */
  t: number;
}

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
