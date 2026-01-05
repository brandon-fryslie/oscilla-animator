/**
 * GridDomain Block IR Lowering Tests
 *
 * Tests that GridDomain block emits correct IR nodes for domain creation.
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';

// Import to trigger block registration
import '../GridDomain';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(): LowerCtx {
  const b = new IRBuilderImpl();
  const domainType = { world: "special" as const, domain: "domain" as const, category: 'core' as const, busEligible: false };
  const fieldType = { world: 'field' as const, domain: 'vec2' as const, category: 'core' as const, busEligible: true };

  return {
    blockIdx: 0 as BlockIndex,
    blockType: 'GridDomain',
    instanceId: 'test-grid',
    label: 'Test Grid',
    inTypes: [],
    outTypes: [domainType, fieldType],
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// GridDomain IR Tests
// =============================================================================

describe('GridDomain IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('GridDomain');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('GridDomain');
    expect(blockType?.capability).toBe('identity');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit domain and position field outputs', () => {
    const blockType = getBlockType('GridDomain');
    if (!blockType) throw new Error('GridDomain not registered');

    const ctx = createMockLowerCtx();
    const result = blockType.lower({
      ctx,
      inputs: [],
      config: { rows: 5, cols: 5, spacing: 10, originX: 0, originY: 0 },
    });

    expect(result.outputs).toHaveLength(2);

    const [domain, posField] = result.outputs;

    // First output is domain (special type)
    expect(domain.k).toBe('special');
    if (domain.k === 'special') {
      expect(domain.tag).toBe('domain');
      expect(domain.id).toBeGreaterThanOrEqual(0);
    }

    // Second output is position field
    expect(posField.k).toBe('field');
    if (posField.k === 'field') {
      expect(posField.id).toBeGreaterThanOrEqual(0);
      expect(posField.slot).toBeGreaterThanOrEqual(0);
    }
  });

  it('should declare domain output', () => {
    const blockType = getBlockType('GridDomain');
    if (!blockType) throw new Error('GridDomain not registered');

    const ctx = createMockLowerCtx();
    const result = blockType.lower({
      ctx,
      inputs: [],
      config: { rows: 10, cols: 10, spacing: 20, originX: 0, originY: 0 },
    });

    expect(result.declares).toBeDefined();
    expect(result.declares?.domainOut).toEqual({
      outPortIndex: 0,
      domainKind: 'domain',
    });
  });

  it('should create domain with correct element count', () => {
    const blockType = getBlockType('GridDomain');
    if (!blockType) throw new Error('GridDomain not registered');

    const ctx = createMockLowerCtx();
    blockType.lower({
      ctx,
      inputs: [],
      config: { rows: 4, cols: 5, spacing: 10, originX: 0, originY: 0 },
    });

    const program = ctx.b.build();
    const domains = program.domains;

    expect(domains.length).toBeGreaterThan(0);
    expect(domains[0].count).toBe(20); // 4 rows * 5 cols = 20 elements
  });

  it('should create stable element IDs', () => {
    const blockType = getBlockType('GridDomain');
    if (!blockType) throw new Error('GridDomain not registered');

    const ctx = createMockLowerCtx();
    blockType.lower({
      ctx,
      inputs: [],
      config: { rows: 3, cols: 3, spacing: 10, originX: 0, originY: 0 },
    });

    const program = ctx.b.build();
    const domains = program.domains;

    expect(domains.length).toBeGreaterThan(0);
    expect(domains[0].elementIds).toBeDefined();
    expect(domains[0].elementIds?.length).toBe(9); // 3x3 grid

    // Element IDs should be stable (8-character strings)
    domains[0].elementIds?.forEach((id) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBe(8);
    });
  });

  it('should create position field matching grid layout', () => {
    const blockType = getBlockType('GridDomain');
    if (!blockType) throw new Error('GridDomain not registered');

    const ctx = createMockLowerCtx();
    blockType.lower({
      ctx,
      inputs: [],
      config: { rows: 2, cols: 2, spacing: 100, originX: -50, originY: -50 },
    });

    const program = ctx.b.build();
    const fieldExprs = program.fieldIR.nodes;

    // Should have at least one const field for positions
    const hasConstField = fieldExprs.some((field) => field.kind === 'const');
    expect(hasConstField).toBe(true);
  });

  it('should handle default parameters', () => {
    const blockType = getBlockType('GridDomain');
    if (!blockType) throw new Error('GridDomain not registered');

    const ctx = createMockLowerCtx();
    const result = blockType.lower({
      ctx,
      inputs: [],
      config: {},
    });

    expect(result.outputs).toHaveLength(2);

    // Should create domain even with default/missing params
    const program = ctx.b.build();
    const domains = program.domains;
    expect(domains.length).toBeGreaterThan(0);
  });
});
