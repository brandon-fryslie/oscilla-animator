/**
 * FieldConstColor Block Compiler
 *
 * Creates a constant color Field - same color for all elements.
 * Takes a Domain and produces Field<color>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';

export const FieldConstColorBlock: BlockCompiler = {
  type: 'FieldConstColor',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:color' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        out: {
          kind: 'Error',
          message: 'FieldConstColor requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    const color = typeof params.color === 'string' ? params.color : '#3B82F6';

    // Create constant field that returns the same color for all elements
    const field: Field<unknown> = (_seed, n) => {
      const count = Math.min(n, domain.elements.length);
      return new Array(count).fill(color);
    };

    return {
      out: { kind: 'Field:color', value: field },
    };
  },
};
