/**
 * Signal Math Block IR Lowering Tests
 *
 * Tests that Signal Math blocks (Add, Mul, Sub) emit correct IR nodes.
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';
import { OpCode } from '../../../ir/opcodes';

// Import to trigger block registration
import '../AddSignal';
import '../MulSignal';
import '../SubSignal';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(blockType: string): LowerCtx {
  const b = new IRBuilderImpl();
  const numberType = { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

  return {
    blockIdx: 0 as BlockIndex,
    blockType,
    instanceId: 'test-block',
    label: 'Test Block',
    inTypes: [numberType, numberType],
    outTypes: [numberType],
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// AddSignal IR Tests
// =============================================================================

describe('AddSignal IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('AddSignal');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('AddSignal');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit IR node for addition', () => {
    const blockType = getBlockType('AddSignal');
    if (!blockType) throw new Error('AddSignal not registered');

    const ctx = createMockLowerCtx('AddSignal');

    // Create input signals
    const aId = ctx.b.sigConst(1.0, ctx.inTypes[0]);
    const bId = ctx.b.sigConst(2.0, ctx.inTypes[1]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: aId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'a') },
        { k: 'sig', id: bId, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'b') },
      ],
      inputsById: {
        a: { k: 'sig', id: aId, slot: 0 },
        b: { k: 'sig', id: bId, slot: 1 },
      },
    });

    // Should return output via outputsById
    expect(result.outputsById).toBeDefined();
    expect(result.outputsById?.out).toBeDefined();

    const output = result.outputsById!.out;
    expect(output.k).toBe('sig');

    if (output.k === 'sig') {
      expect(output.slot).toBeGreaterThanOrEqual(0);
      expect(output.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('should create sigZip node with Add opcode', () => {
    const blockType = getBlockType('AddSignal');
    if (!blockType) throw new Error('AddSignal not registered');

    const ctx = createMockLowerCtx('AddSignal');

    const aId = ctx.b.sigConst(1.0, ctx.inTypes[0]);
    const bId = ctx.b.sigConst(2.0, ctx.inTypes[1]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: aId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'a') },
        { k: 'sig', id: bId, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'b') },
      ],
      inputsById: {
        a: { k: 'sig', id: aId, slot: 0 },
        b: { k: 'sig', id: bId, slot: 1 },
      },
    });

    // Check IR contains zip node with Add opcode
    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    const hasZipAdd = sigExprs.some(
      (sig) => sig.kind === 'zip' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Add
    );

    expect(hasZipAdd).toBe(true);
  });
});

// =============================================================================
// MulSignal IR Tests
// =============================================================================

describe('MulSignal IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('MulSignal');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('MulSignal');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit IR node for multiplication', () => {
    const blockType = getBlockType('MulSignal');
    if (!blockType) throw new Error('MulSignal not registered');

    const ctx = createMockLowerCtx('MulSignal');

    const aId = ctx.b.sigConst(2.0, ctx.inTypes[0]);
    const bId = ctx.b.sigConst(3.0, ctx.inTypes[1]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: aId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'a') },
        { k: 'sig', id: bId, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'b') },
      ],
      inputsById: {
        a: { k: 'sig', id: aId, slot: 0 },
        b: { k: 'sig', id: bId, slot: 1 },
      },
    });

    expect(result.outputsById).toBeDefined();
    expect(result.outputsById?.out).toBeDefined();

    const output = result.outputsById!.out;
    expect(output.k).toBe('sig');

    if (output.k === 'sig') {
      expect(output.slot).toBeGreaterThanOrEqual(0);
      expect(output.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('should create sigZip node with Mul opcode', () => {
    const blockType = getBlockType('MulSignal');
    if (!blockType) throw new Error('MulSignal not registered');

    const ctx = createMockLowerCtx('MulSignal');

    const aId = ctx.b.sigConst(2.0, ctx.inTypes[0]);
    const bId = ctx.b.sigConst(3.0, ctx.inTypes[1]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: aId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'a') },
        { k: 'sig', id: bId, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'b') },
      ],
      inputsById: {
        a: { k: 'sig', id: aId, slot: 0 },
        b: { k: 'sig', id: bId, slot: 1 },
      },
    });

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    const hasZipMul = sigExprs.some(
      (sig) => sig.kind === 'zip' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Mul
    );

    expect(hasZipMul).toBe(true);
  });
});

// =============================================================================
// SubSignal IR Tests
// =============================================================================

describe('SubSignal IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('SubSignal');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('SubSignal');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit IR node for subtraction', () => {
    const blockType = getBlockType('SubSignal');
    if (!blockType) throw new Error('SubSignal not registered');

    const ctx = createMockLowerCtx('SubSignal');

    const aId = ctx.b.sigConst(5.0, ctx.inTypes[0]);
    const bId = ctx.b.sigConst(3.0, ctx.inTypes[1]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: aId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'a') },
        { k: 'sig', id: bId, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'b') },
      ],
      inputsById: {
        a: { k: 'sig', id: aId, slot: 0 },
        b: { k: 'sig', id: bId, slot: 1 },
      },
    });

    expect(result.outputsById).toBeDefined();
    expect(result.outputsById?.out).toBeDefined();

    const output = result.outputsById!.out;
    expect(output.k).toBe('sig');

    if (output.k === 'sig') {
      expect(output.slot).toBeGreaterThanOrEqual(0);
      expect(output.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('should create sigZip node with Sub opcode', () => {
    const blockType = getBlockType('SubSignal');
    if (!blockType) throw new Error('SubSignal not registered');

    const ctx = createMockLowerCtx('SubSignal');

    const aId = ctx.b.sigConst(5.0, ctx.inTypes[0]);
    const bId = ctx.b.sigConst(3.0, ctx.inTypes[1]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: aId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'a') },
        { k: 'sig', id: bId, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'b') },
      ],
      inputsById: {
        a: { k: 'sig', id: aId, slot: 0 },
        b: { k: 'sig', id: bId, slot: 1 },
      },
    });

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    const hasZipSub = sigExprs.some(
      (sig) => sig.kind === 'zip' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Sub
    );

    expect(hasZipSub).toBe(true);
  });
});
