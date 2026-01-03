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
function stableHash(str: string): float {
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
    salt?: int;
    domainSize?: int;
    elementIds?: string[]; // Temporary: pass element IDs via config
  } | undefined;

  const salt: int = Number(configData?.salt ?? 0);
  const domainSize: int = configData?.domainSize ?? 100;
  const elementIds = configData?.elementIds ?? Array.from({ length: domainSize }, (_, i) => String(i));

  // Compute hash values at compile time
  const hashValues: float[] = [];
  for (let i = 0; i < elementIds.length; i++) {
    const elementId = elementIds[i];
    const hashInput = `${elementId}-${salt}`;
    hashValues.push(stableHash(hashInput));
  }

  // Create field as const
  const hashField = ctx.b.fieldConst(hashValues, { world: "field", domain: "float", category: "core", busEligible: true });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'StableIdHash_out');
  return {
    outputs: [{ k: 'field', id: hashField, slot }],
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'StableIdHash',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'u01', label: 'U01', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
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
    { name: 'salt', type: { kind: 'Scalar:int' }, required: false },
  ],

  outputs: [
    { name: 'u01', type: { kind: 'Field:float' } },
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
      if (artifact.kind === 'Scalar:int' || artifact.kind === 'Scalar:float') {
        return Number(artifact.value);
      }
      // Generic fallback for other artifact types
      return typeof artifact.value === 'function' ? Number((artifact.value as (t: number, ctx: unknown) => unknown)(0, {})) : Number(artifact.value);
    };

    // Support both new (inputs) and old (params) parameter systems
    const salt: int = extractNumber(inputs.salt, (params as Record<string, unknown> | undefined)?.salt as number | undefined ?? 0);

    // Create field that produces stable hash per element
    const field: Field<float> = (_seed, n) => {
      const count: int = Math.min(n, domain.elements.length);
      const out = new Array<float>(count);

      for (let i = 0; i < count; i++) {
        const elementId = domain.elements[i];
        // Combine element ID with salt for hashing
        const hashInput = `${elementId}-${salt}`;
        out[i] = stableHash(hashInput);
      }

      return out;
    };

    return {
      u01: { kind: 'Field:float', value: field },
    };
  },
};
