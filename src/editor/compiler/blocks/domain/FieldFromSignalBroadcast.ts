/**
 * FieldFromSignalBroadcast Block Compiler
 *
 * Broadcasts a Signal<number> value to all elements in a domain,
 * creating a Field<number> where all elements have the same value.
 */

import type { BlockCompiler, Domain, Field } from '../../types';

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

    if (!domainArtifact || domainArtifact.kind !== 'Domain') {
      return {
        field: {
          kind: 'Error',
          message: 'FieldFromSignalBroadcast requires a Domain input',
        },
      };
    }

    if (!signalArtifact || signalArtifact.kind !== 'Signal:number') {
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
      const val = signalFn((ctx as any).t, ctx as any);

      // Broadcast to all elements
      return Array(count).fill(val);
    };

    return {
      field: { kind: 'Field:number', value: field },
    };
  },
};
