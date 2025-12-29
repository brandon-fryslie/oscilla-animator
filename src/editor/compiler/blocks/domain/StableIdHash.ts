/**
 * StableIdHash Block Compiler
 *
 * Hashes stable element IDs to [0,1) using a salt parameter.
 * Returns deterministic per-element random values based on element ID.
 *
 * Uses a simple but effective hash function to convert element.id + salt
 * into a uniformly distributed number in [0, 1).
 */

import type { BlockCompiler, Field, Artifact } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

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

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerStableIdHash: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (domainInput === undefined || domainInput.k !== 'special' || domainInput.tag !== 'domain') {
    throw new Error('StableIdHash requires Domain input');
  }

  const configData = config as {
    salt?: number;
    domainSize?: number;
    elementIds?: string[]; // Temporary: pass element IDs via config
  } | undefined;

  const salt = Number(configData?.salt ?? 0);
  const domainSize = configData?.domainSize ?? 100;
  const elementIds = configData?.elementIds ?? Array.from({ length: domainSize }, (_, i) => String(i));

  // Compute hash values at compile time
  const hashValues: number[] = [];
  for (let i = 0; i < elementIds.length; i++) {
    const elementId = elementIds[i];
    const hashInput = `${elementId}-${salt}`;
    hashValues.push(stableHash(hashInput));
  }

  // Create field as const
  const hashField = ctx.b.fieldConst(hashValues, { world: 'field', domain: 'number' });

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [{ k: 'field', id: hashField, slot }],
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'StableIdHash',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'u01', label: 'U01', dir: 'out', type: { world: 'field', domain: 'number' } },
  ],
  lower: lowerStableIdHash,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const StableIdHashBlock: BlockCompiler = {
  type: 'StableIdHash',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'salt', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [
    { name: 'u01', type: { kind: 'Field:number' } },
  ],

  compile({ inputs, params }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        u01: {
          kind: 'Error',
          message: 'StableIdHash requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Helper to extract numeric value from artifact with default fallback
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:number') return Number(artifact.value);
      // Generic fallback for other artifact types
      return typeof artifact.value === 'function' ? Number((artifact.value as (t: number, ctx: unknown) => unknown)(0, {})) : Number(artifact.value);
    };

    // Support both new (inputs) and old (params) parameter systems
    const salt = extractNumber(inputs.salt, (params as Record<string, unknown> | undefined)?.salt as number | undefined ?? 0);

    // Create field that produces stable hash per element
    const field: Field<number> = (_seed, n) => {
      const count = Math.min(n, domain.elements.length);
      const out = new Array<number>(count);

      for (let i = 0; i < count; i++) {
        const elementId = domain.elements[i];
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
