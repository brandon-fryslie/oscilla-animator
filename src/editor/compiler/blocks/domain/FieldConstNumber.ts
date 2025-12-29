/**
 * FieldConstNumber Block Compiler
 *
 * Creates a constant numeric Field - same value for all elements.
 * Takes a Domain and produces Field<number>.
 */

import type { BlockCompiler, Field, Artifact } from '../../types';
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

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldConstNumber',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' }, defaultSource: { value: 100 } },
    {
      portId: 'value',
      label: 'Value',
      dir: 'in',
      type: { world: 'signal', domain: 'number' },
      defaultSource: { value: 0 },
    },
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
    { name: 'value', type: { kind: 'Signal:number' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Field:number' } },
  ],

  compile({ inputs, params }) {
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

    // Helper to extract numeric value from artifact with default fallback
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:number' || artifact.kind === 'Signal:number') {
        return Number(artifact.value);
      }
      if ('value' in artifact && artifact.value !== undefined) {
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: object) => number)(0, {}))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    // Support both new (inputs) and old (params) parameter systems
    const paramsObj = params as { value?: number } | undefined;
    const value = extractNumber(inputs.value, paramsObj?.value ?? 0);

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
