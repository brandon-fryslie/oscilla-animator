/**
 * FieldConstNumber Block Compiler
 *
 * Creates a constant numeric Field - same value for all elements.
 * Takes a Domain and produces Field<number>.
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldConstNumber: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [domain] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldConstNumber requires domain input');
  }

  // Extract value from config (params are now passed as config)
  const configObj = config as { value?: unknown } | undefined;
  const value = Number(configObj?.value ?? 0);

  const outType = { world: 'field' as const, domain: 'number' as const };
  const fieldId = ctx.b.fieldConst(value, outType);

  return { outputs: [{ k: 'field', id: fieldId }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldConstNumber',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'field', domain: 'number' } },
  ],
  lower: lowerFieldConstNumber,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

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
    const value = Number(params.value);

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
