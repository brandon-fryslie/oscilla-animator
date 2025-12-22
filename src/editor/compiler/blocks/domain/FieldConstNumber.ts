/**
 * FieldConstNumber Block Compiler
 *
 * Creates a constant numeric Field - same value for all elements.
 * Takes a Domain and produces Field<number>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';

export const FieldConstNumberBlock: BlockCompiler = {
  type: 'FieldConstNumber',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:number' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldConstNumber requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    const value = Number(params.value ?? 1);

    // Create constant field that returns the same value for all elements
    const field: Field<number> = (_seed, n) => {
      const count = Math.min(n, domain.elements.length);
      return Array<number>(count).fill(value);
    };

    return {
      out: { kind: 'Field:number', value: field },
    };
  },
};
