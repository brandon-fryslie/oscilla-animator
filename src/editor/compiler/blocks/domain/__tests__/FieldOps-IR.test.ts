/**
 * Field Operations Block IR Lowering Tests
 *
 * Tests for FieldConstNumber, FieldMapNumber, and FieldColorize blocks.
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';
import { OpCode } from '../../../ir/opcodes';

// Import to trigger block registration
import '../FieldConstNumber';
import '../FieldMapNumber';
import '../FieldColorize';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(blockType: string, inTypes: any[], outTypes: any[]): LowerCtx {
  const b = new IRBuilderImpl();

  return {
    blockIdx: 0 as BlockIndex,
    blockType,
    instanceId: `test-${blockType}`,
    label: `Test ${blockType}`,
    inTypes,
    outTypes,
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// FieldConstNumber IR Tests
// =============================================================================

describe('FieldConstNumber IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('FieldConstNumber');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('FieldConstNumber');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit field constant output', () => {
    const blockType = getBlockType('FieldConstNumber');
    if (!blockType) throw new Error('FieldConstNumber not registered');

    const domainType = { world: 'special' as const, domain: 'domain' as const, category: 'internal' as const, busEligible: false };
    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldConstNumber', [domainType], [fieldType]);

    // Create domain slot
    const domainSlot = ctx.b.domainFromN(10, []);

    const result = blockType.lower({
      ctx,
      inputs: [{ k: 'special', tag: 'domain', id: domainSlot }],
      config: { value: 42 },
    });

    expect(result.outputs).toHaveLength(1);

    const [field] = result.outputs;
    expect(field.k).toBe('field');

    if (field.k === 'field') {
      expect(field.id).toBeGreaterThanOrEqual(0);
      expect(field.slot).toBeGreaterThanOrEqual(0);
    }
  });

  it('should create fieldConst IR node', () => {
    const blockType = getBlockType('FieldConstNumber');
    if (!blockType) throw new Error('FieldConstNumber not registered');

    const domainType = { world: 'special' as const, domain: 'domain' as const, category: 'internal' as const, busEligible: false };
    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldConstNumber', [domainType], [fieldType]);
    const domainSlot = ctx.b.domainFromN(10, []);

    blockType.lower({
      ctx,
      inputs: [{ k: 'special', tag: 'domain', id: domainSlot }],
      config: { value: 3.14 },
    });

    const program = ctx.b.build();
    const fieldExprs = program.fieldIR.nodes;

    // Should have a const field
    const hasConstField = fieldExprs.some((field) => field.kind === 'const');
    expect(hasConstField).toBe(true);
  });

  it('should use default value when config is empty', () => {
    const blockType = getBlockType('FieldConstNumber');
    if (!blockType) throw new Error('FieldConstNumber not registered');

    const domainType = { world: 'special' as const, domain: 'domain' as const, category: 'internal' as const, busEligible: false };
    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldConstNumber', [domainType], [fieldType]);
    const domainSlot = ctx.b.domainFromN(10, []);

    const result = blockType.lower({
      ctx,
      inputs: [{ k: 'special', tag: 'domain', id: domainSlot }],
      config: {},
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].k).toBe('field');
  });
});

// =============================================================================
// FieldMapNumber IR Tests
// =============================================================================

describe('FieldMapNumber IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('FieldMapNumber');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('FieldMapNumber');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit field map output', () => {
    const blockType = getBlockType('FieldMapNumber');
    if (!blockType) throw new Error('FieldMapNumber not registered');

    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldMapNumber', [fieldType], [fieldType]);

    const fieldId = ctx.b.fieldConst(1.0, fieldType);

    const result = blockType.lower({
      ctx,
      inputs: [{ k: 'field', id: fieldId, slot: ctx.b.allocValueSlot(fieldType, 'x') }],
      config: { fn: 'abs', k: 1, a: 0, b: 1 },
    });

    expect(result.outputs).toHaveLength(1);

    const [field] = result.outputs;
    expect(field.k).toBe('field');

    if (field.k === 'field') {
      expect(field.id).toBeGreaterThanOrEqual(0);
      expect(field.slot).toBeGreaterThanOrEqual(0);
    }
  });

  it('should create fieldMap IR node with Abs opcode', () => {
    const blockType = getBlockType('FieldMapNumber');
    if (!blockType) throw new Error('FieldMapNumber not registered');

    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldMapNumber', [fieldType], [fieldType]);
    const fieldId = ctx.b.fieldConst(1.0, fieldType);

    blockType.lower({
      ctx,
      inputs: [{ k: 'field', id: fieldId, slot: ctx.b.allocValueSlot(fieldType, 'x') }],
      config: { fn: 'abs', k: 1, a: 0, b: 1 },
    });

    const program = ctx.b.build();
    const fieldExprs = program.fieldIR.nodes;

    // Should have map node with Abs opcode
    const hasAbsMap = fieldExprs.some(
      (field) => field.kind === 'map' && field.fn.kind === 'opcode' && field.fn.opcode === OpCode.Abs
    );

    expect(hasAbsMap).toBe(true);
  });

  it('should handle sin function', () => {
    const blockType = getBlockType('FieldMapNumber');
    if (!blockType) throw new Error('FieldMapNumber not registered');

    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldMapNumber', [fieldType], [fieldType]);
    const fieldId = ctx.b.fieldConst(0.0, fieldType);

    blockType.lower({
      ctx,
      inputs: [{ k: 'field', id: fieldId, slot: ctx.b.allocValueSlot(fieldType, 'x') }],
      config: { fn: 'sin', k: 1, a: 0, b: 1 },
    });

    const program = ctx.b.build();
    const fieldExprs = program.fieldIR.nodes;

    // Should have map node with Sin opcode
    const hasSinMap = fieldExprs.some(
      (field) => field.kind === 'map' && field.fn.kind === 'opcode' && field.fn.opcode === OpCode.Sin
    );

    expect(hasSinMap).toBe(true);
  });
});

// =============================================================================
// FieldColorize IR Tests
// =============================================================================

describe('FieldColorize IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('FieldColorize');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('FieldColorize');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should throw error indicating IR lowering not yet implemented', () => {
    const blockType = getBlockType('FieldColorize');
    if (!blockType) throw new Error('FieldColorize not registered');

    const fieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };
    const colorFieldType = { world: 'field' as const, domain: 'color' as const, category: 'core' as const, busEligible: true };

    const ctx = createMockLowerCtx('FieldColorize', [fieldType], [colorFieldType]);
    const fieldId = ctx.b.fieldConst(0.5, fieldType);

    expect(() => {
      blockType.lower({
        ctx,
        inputs: [{ k: 'field', id: fieldId, slot: ctx.b.allocValueSlot(fieldType, 'values') }],
        config: { mode: 'lerp', colorA: '#FF0000', colorB: '#0000FF' },
      });
    }).toThrow(/FieldColorize IR lowering requires field-level color operations/);
  });
});
