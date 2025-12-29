/**
 * DomainN Block Compiler
 *
 * Creates a domain with N elements, each with a stable ID.
 * This is the fundamental primitive that creates the iteration space for Fields.
 *
 * Element IDs are stable across frames and recompiles for the same (n, seed) pair.
 */

import type { BlockCompiler, Artifact } from '../../types';
import { createSimpleDomain } from '../../unified/Domain';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

interface DomainNParams {
  n?: number;
  seed?: number;
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerDomainN: BlockLowerFn = ({ ctx, inputs }) => {
  // Get n from input port (if connected) or default to 1
  let n = 1;

  if (inputs[0] !== undefined) {
    if (inputs[0].k === 'scalarConst') {
      // Read value from const pool using the existing constId
      const constPool = ctx.b.getConstPool();
      const constValue = constPool[inputs[0].constId];
      n = Number(constValue);
    } else if (inputs[0].k === 'sig') {
      // Signal input - for now, cannot evaluate at compile time
      // This would need runtime domain creation support
      throw new Error('DomainN: Signal inputs not yet supported in IR lowering');
    }
  }

  // Create domain value slot
  const domainSlot = ctx.b.domainFromN(Math.max(1, Math.floor(n)));

  return {
    outputs: [{ k: 'special', tag: 'domain', id: domainSlot }],
    declares: {
      domainOut: { outPortIndex: 0, domainKind: 'domain' },
    },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'DomainN',
  capability: 'identity',
  inputs: [
    {
      portId: 'n',
      label: 'N',
      dir: 'in',
      type: { world: 'scalar', domain: 'number' },
      defaultSource: { value: 100 },
    },
    {
      portId: 'seed',
      label: 'Seed',
      dir: 'in',
      type: { world: 'scalar', domain: 'number' },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    { portId: 'domain', label: 'Domain', dir: 'out', type: { world: 'special', domain: 'domain' } },
  ],
  lower: lowerDomainN,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const DomainNBlock: BlockCompiler = {
  type: 'DomainN',

  inputs: [
    { name: 'n', type: { kind: 'Scalar:number' }, required: false },
    { name: 'seed', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
  ],

  compile({ id, inputs, params }) {
    // Helper to extract numeric value from artifact with default fallback
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:number') return Number(artifact.value);
      // Generic fallback for other artifact types
      if ('value' in artifact && artifact.value !== undefined) {
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: object) => number)(0, {}))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    // Support both new (inputs) and old (params) parameter systems
    const paramsObj = params as DomainNParams | undefined;
    const n = extractNumber(inputs.n, paramsObj?.n ?? 100);
    const seed = extractNumber(inputs.seed, paramsObj?.seed ?? 0);

    // Create a stable domain ID based on block id, n, and seed
    const domainId = `domain-${id}-${n}-${seed}`;

    // Create the domain with simple sequential element IDs
    const domain = createSimpleDomain(domainId, Math.max(1, Math.floor(n)));

    return {
      domain: { kind: 'Domain', value: domain },
    };
  },
};
