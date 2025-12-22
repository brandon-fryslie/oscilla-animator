/**
 * FieldHash01ById Block Compiler
 *
 * Creates a deterministic random Field based on element ID.
 * Returns values in [0, 1) that are stable per element across frames.
 *
 * Uses a simple hash function based on element ID and seed.
 */

import type { BlockCompiler, Domain, Field } from '../../types';

/**
 * Simple hash function that produces a number in [0, 1)
 */
function hash01(elementId: string, seed: number): number {
  // Simple hash combining element ID char codes with seed
  let h = seed;
  for (let i = 0; i < elementId.length; i++) {
    h = ((h << 5) - h + elementId.charCodeAt(i)) | 0;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }

  // Normalize to [0, 1)
  const t = (h * 12.9898 + 78.233) * 43758.5453;
  return t - Math.floor(t);
}

export const FieldHash01ByIdBlock: BlockCompiler = {
  type: 'FieldHash01ById',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'u', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!domainArtifact || domainArtifact.kind !== 'Domain') {
      return {
        u: {
          kind: 'Error',
          message: 'FieldHash01ById requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    const blockSeed = Number(params.seed ?? 0);

    // Create field that produces deterministic random per element
    const field: Field<number> = (seed, n) => {
      const count = Math.min(n, domain.elements.length);
      const out = new Array<number>(count);
      const combinedSeed = seed + blockSeed;

      for (let i = 0; i < count; i++) {
        const elementId = domain.elements[i];
        out[i] = hash01(elementId, combinedSeed);
      }

      return out;
    };

    return {
      u: { kind: 'Field:number', value: field },
    };
  },
};
