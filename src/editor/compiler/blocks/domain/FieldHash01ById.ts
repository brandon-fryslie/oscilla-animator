/**
 * FieldHash01ById Block Compiler
 *
 * Creates a deterministic random Field based on element ID.
 * Returns values in [0, 1) that are stable per element across frames.
 *
 * Uses a simple hash function based on element ID and seed.
 */

import type { BlockCompiler, Field, Artifact } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

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

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerFieldHash01ById: BlockLowerFn = ({ ctx, inputs, config }) => {
  const [domain] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('FieldHash01ById requires domain input');
  }

  // Extract seed from config (params are now passed as config)
  const configObj = config as { seed?: unknown } | undefined;
  const blockSeed = Number(configObj?.seed ?? 0);

  // For now, we emit a kernel-based field map node
  // The kernel 'hash01ById' will be implemented in the runtime
  const outType = { world: "field" as const, domain: "float" as const, category: "core" as const, busEligible: true };

  // Use Hash01ById opcode if available, otherwise use a kernel reference
  const fieldId = ctx.b.fieldMap(
    // Start with a placeholder constant field that will be overridden by the kernel
    ctx.b.fieldConst(0, outType),
    { kind: 'opcode', opcode: OpCode.Hash01ById },
    outType,
    { seed: blockSeed }
  );

  const slot = ctx.b.allocValueSlot();
  return { outputs: [{ k: 'field', id: fieldId, slot }] };
};

// Register block type for IR lowering
registerBlockType({
  type: 'FieldHash01ById',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'u', label: 'U', dir: 'out', type: { world: "field", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFieldHash01ById,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldHash01ByIdBlock: BlockCompiler = {
  type: 'FieldHash01ById',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'seed', type: { kind: 'Scalar:float' }, required: false },
  ],

  outputs: [
    { name: 'u', type: { kind: 'Field:float' } },
  ],

  compile({ inputs, params }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        u: {
          kind: 'Error',
          message: 'FieldHash01ById requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Extract seed with params fallback (for tests using old params system)
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:float' || artifact.kind === 'Signal:float') {
        return Number(artifact.value);
      }
      if ('value' in artifact && artifact.value !== undefined) {
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: object) => number)(0, {}))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    const paramsObj = params as { seed?: number } | undefined;
    const blockSeed = extractNumber(inputs.seed, paramsObj?.seed ?? 0);

    // Create field that produces deterministic random per element
    const field: Field<float> = (seed, n) => {
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
      u: { kind: 'Field:float', value: field },
    };
  },
};
