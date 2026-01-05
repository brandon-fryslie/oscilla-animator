/**
 * DomainN Block IR Lowering Tests
 *
 * Tests that DomainN block emits correct IR nodes for domain creation.
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';

// Import to trigger block registration
import '../DomainN';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(): LowerCtx {
  const b = new IRBuilderImpl();
  const scalarType = { world: 'scalar' as const, domain: 'int' as const, category: 'core' as const, busEligible: true };
  const domainType = { world: "special" as const, domain: "domain" as const, category: 'core' as const, busEligible: false };

  return {
    blockIdx: 0 as BlockIndex,
    blockType: 'DomainN',
    instanceId: 'test-domain-n',
    label: 'Test DomainN',
    inTypes: [scalarType, scalarType],
    outTypes: [domainType],
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// DomainN IR Tests
// =============================================================================

describe('DomainN IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('DomainN');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('DomainN');
    expect(blockType?.capability).toBe('identity');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit domain output', () => {
    const blockType = getBlockType('DomainN');
    if (!blockType) throw new Error('DomainN not registered');

    const ctx = createMockLowerCtx();
    const nConstId = ctx.b.allocConstId(100);
    const seedConstId = ctx.b.allocConstId(42);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst', constId: nConstId },
        { k: 'scalarConst', constId: seedConstId },
      ],
    });

    expect(result.outputs).toHaveLength(1);

    const [domain] = result.outputs;

    expect(domain.k).toBe('special');
    if (domain.k === 'special') {
      expect(domain.tag).toBe('domain');
      expect(domain.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('should declare domain output', () => {
    const blockType = getBlockType('DomainN');
    if (!blockType) throw new Error('DomainN not registered');

    const ctx = createMockLowerCtx();
    const nConstId = ctx.b.allocConstId(50);
    const seedConstId = ctx.b.allocConstId(123);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst', constId: nConstId },
        { k: 'scalarConst', constId: seedConstId },
      ],
    });

    expect(result.declares).toBeDefined();
    expect(result.declares?.domainOut).toEqual({
      outPortIndex: 0,
      domainKind: 'domain',
    });
  });

  it('should create domain with correct element count', () => {
    const blockType = getBlockType('DomainN');
    if (!blockType) throw new Error('DomainN not registered');

    const ctx = createMockLowerCtx();
    const nConstId = ctx.b.allocConstId(75);
    const seedConstId = ctx.b.allocConstId(999);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst', constId: nConstId },
        { k: 'scalarConst', constId: seedConstId },
      ],
    });

    const program = ctx.b.build();
    const domains = program.domains;

    expect(domains.length).toBeGreaterThan(0);
    expect(domains[0].count).toBe(75);
  });

  it('should create stable element IDs', () => {
    const blockType = getBlockType('DomainN');
    if (!blockType) throw new Error('DomainN not registered');

    const ctx = createMockLowerCtx();
    const nConstId = ctx.b.allocConstId(10);
    const seedConstId = ctx.b.allocConstId(42);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst', constId: nConstId },
        { k: 'scalarConst', constId: seedConstId },
      ],
    });

    const program = ctx.b.build();
    const domains = program.domains;

    expect(domains.length).toBeGreaterThan(0);
    expect(domains[0].elementIds).toBeDefined();
    expect(domains[0].elementIds?.length).toBe(10);

    // Element IDs should be stable (8-character strings)
    domains[0].elementIds?.forEach((id) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBe(8);
    });
  });

  it('should use different element IDs for different seeds', () => {
    const blockType = getBlockType('DomainN');
    if (!blockType) throw new Error('DomainN not registered');

    // First domain with seed 1
    const ctx1 = createMockLowerCtx();
    const nConstId1 = ctx1.b.allocConstId(5);
    const seedConstId1 = ctx1.b.allocConstId(1);

    blockType.lower({
      ctx: ctx1,
      inputs: [
        { k: 'scalarConst', constId: nConstId1 },
        { k: 'scalarConst', constId: seedConstId1 },
      ],
    });

    const program1 = ctx1.b.build();
    const ids1 = program1.domains[0].elementIds;

    // Second domain with seed 2
    const ctx2 = createMockLowerCtx();
    const nConstId2 = ctx2.b.allocConstId(5);
    const seedConstId2 = ctx2.b.allocConstId(2);

    blockType.lower({
      ctx: ctx2,
      inputs: [
        { k: 'scalarConst', constId: nConstId2 },
        { k: 'scalarConst', constId: seedConstId2 },
      ],
    });

    const program2 = ctx2.b.build();
    const ids2 = program2.domains[0].elementIds;

    // Element IDs should differ due to different seeds
    expect(ids1).not.toEqual(ids2);
  });

  it('should clamp n to minimum of 1', () => {
    const blockType = getBlockType('DomainN');
    if (!blockType) throw new Error('DomainN not registered');

    const ctx = createMockLowerCtx();
    const nConstId = ctx.b.allocConstId(0); // Invalid: 0 elements
    const seedConstId = ctx.b.allocConstId(42);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst', constId: nConstId },
        { k: 'scalarConst', constId: seedConstId },
      ],
    });

    const program = ctx.b.build();
    const domains = program.domains;

    expect(domains.length).toBeGreaterThan(0);
    expect(domains[0].count).toBe(1); // Clamped to minimum
  });
});
