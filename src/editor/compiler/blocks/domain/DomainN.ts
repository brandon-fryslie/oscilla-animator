/**
 * DomainN Block Compiler
 *
 * Creates a domain with N elements, each with a stable ID.
 * This is the fundamental primitive that creates the iteration space for Fields.
 *
 * Element IDs are stable across frames and recompiles for the same (n, seed) pair.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Generate a short random ID from a seed.
 * Uses a simple hash to produce deterministic 8-character alphanumeric IDs.
 */
function seededId(seed: number): string {
  // Simple mulberry32 PRNG
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const hash = ((t ^ (t >>> 14)) >>> 0);

  // Convert to base36 and take 8 chars
  return hash.toString(36).padStart(8, '0').slice(-8);
}

const lowerDomainN: BlockLowerFn = ({ ctx, inputs }) => {
  // Get n from input port (if connected) or default to 1
  let n: int = 1;
  let seed: int = 0;

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

  if (inputs[1] !== undefined) {
    if (inputs[1].k === 'scalarConst') {
      const constPool = ctx.b.getConstPool();
      const constValue = constPool[inputs[1].constId];
      seed = Number(constValue);
    }
  }

  const safeN = Math.max(1, Math.floor(n));

  // Create stable element IDs using seeded random strings
  // Seed combines user seed and index for stability per (n, seed) pair
  const baseSeed = seed * 100000 + safeN;
  const elementIds: string[] = [];
  for (let i = 0; i < safeN; i++) {
    elementIds.push(seededId(baseSeed + i));
  }

  // Create domain value slot with stable element IDs
  const domainSlot = ctx.b.domainFromN(safeN, elementIds);

  return {
    outputs: [],
    outputsById: { domain: { k: 'special', tag: 'domain', id: domainSlot } },
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
      type: { world: "scalar", domain: "int", category: "core", busEligible: true },
      defaultSource: { value: 100 },
    },
    {
      portId: 'seed',
      label: 'Seed',
      dir: 'in',
      type: { world: "scalar", domain: "int", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    { portId: 'domain', label: 'Domain', dir: 'out', type: { world: "config", domain: "domain", category: "internal", busEligible: false } },
  ],
  lower: lowerDomainN,
});
