/**
 * StableIdHash Block Compiler
 *
 * Hashes stable element IDs to [0,1) using a salt parameter.
 * Returns deterministic per-element random values based on element ID.
 *
 * Uses a simple but effective hash function to convert element.id + salt
 * into a uniformly distributed number in [0, 1).
 */

import type { BlockCompiler, Domain, Field } from '../../types';

/**
 * Simple hash function that produces a number in [0, 1)
 * Based on standard string hashing with good distribution.
 */
function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  // Normalize to [0, 1) using unsigned right shift to ensure positive
  return (hash >>> 0) / 0xFFFFFFFF;
}

export const StableIdHashBlock: BlockCompiler = {
  type: 'StableIdHash',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'u01', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!domainArtifact || domainArtifact.kind !== 'Domain') {
      return {
        u01: {
          kind: 'Error',
          message: 'StableIdHash requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value as Domain;
    const salt = Number(params.salt ?? 0);

    // Create field that produces stable hash per element
    const field: Field<number> = (_seed, n) => {
      const count = Math.min(n, domain.elements.length);
      const out = new Array<number>(count);

      for (let i = 0; i < count; i++) {
        const elementId = domain.elements[i]!;
        // Combine element ID with salt for hashing
        const hashInput = `${elementId}-${salt}`;
        out[i] = stableHash(hashInput);
      }

      return out;
    };

    return {
      u01: { kind: 'Field:number', value: field },
    };
  },
};
