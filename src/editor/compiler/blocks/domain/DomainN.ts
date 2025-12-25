/**
 * DomainN Block Compiler
 *
 * Creates a domain with N elements, each with a stable ID.
 * This is the fundamental primitive that creates the iteration space for Fields.
 *
 * Element IDs are stable across frames and recompiles for the same (n, seed) pair.
 */

import type { BlockCompiler } from '../../types';
import { createSimpleDomain } from '../../unified/Domain';

export const DomainNBlock: BlockCompiler = {
  type: 'DomainN',

  inputs: [
    { name: 'n', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
  ],

  compile({ id, params, inputs }) {
    // Get n from input port or params
    const nFromInput = inputs.n?.kind === 'Scalar:number' ? inputs.n.value : undefined;
    const n = nFromInput ?? Number(params.n);
    const seed = Number(params.seed);

    // Create a stable domain ID based on block id, n, and seed
    const domainId = `domain-${id}-${n}-${seed}`;

    // Create the domain with simple sequential element IDs
    const domain = createSimpleDomain(domainId, Math.max(1, Math.floor(n)));

    return {
      domain: { kind: 'Domain', value: domain },
    };
  },
};
