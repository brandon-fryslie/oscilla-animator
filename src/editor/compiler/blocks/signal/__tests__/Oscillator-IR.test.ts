/**
 * Oscillator Block IR Lowering Tests
 *
 * Tests that Oscillator block emits correct IR nodes for waveform generation.
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';
import { OpCode } from '../../../ir/opcodes';

// Import to trigger block registration
import '../Oscillator';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(): LowerCtx {
  const b = new IRBuilderImpl();
  const phaseType = { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true };
  const scalarType = { world: 'scalar' as const, domain: 'waveform' as const, category: 'core' as const, busEligible: true };
  const numberType = { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

  return {
    blockIdx: 0 as BlockIndex,
    blockType: 'Oscillator',
    instanceId: 'test-oscillator',
    label: 'Test Oscillator',
    inTypes: [phaseType, scalarType, numberType, numberType],
    outTypes: [numberType],
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// Oscillator IR Tests
// =============================================================================

describe('Oscillator IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('Oscillator');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('Oscillator');
    expect(blockType?.capability).toBe('pure');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit IR node for sine wave', () => {
    const blockType = getBlockType('Oscillator');
    if (!blockType) throw new Error('Oscillator not registered');

    const ctx = createMockLowerCtx();

    const phaseId = ctx.b.sigConst(0.0, ctx.inTypes[0]);
    const shapeConstId = ctx.b.allocConstId('sine');
    const amplitudeId = ctx.b.sigConst(1.0, ctx.inTypes[2]);
    const biasId = ctx.b.sigConst(0.0, ctx.inTypes[3]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'phase') },
        { k: 'scalarConst', constId: shapeConstId },
        { k: 'sig', id: amplitudeId, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'amplitude') },
        { k: 'sig', id: biasId, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'bias') },
      ],
      inputsById: {
        phase: { k: 'sig', id: phaseId, slot: 0 },
        shape: { k: 'scalarConst', constId: shapeConstId },
        amplitude: { k: 'sig', id: amplitudeId, slot: 2 },
        bias: { k: 'sig', id: biasId, slot: 3 },
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

  it('should create IR nodes with Sin opcode for sine wave', () => {
    const blockType = getBlockType('Oscillator');
    if (!blockType) throw new Error('Oscillator not registered');

    const ctx = createMockLowerCtx();

    const phaseId = ctx.b.sigConst(0.0, ctx.inTypes[0]);
    const shapeConstId = ctx.b.allocConstId('sine');
    const amplitudeId = ctx.b.sigConst(1.0, ctx.inTypes[2]);
    const biasId = ctx.b.sigConst(0.0, ctx.inTypes[3]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'phase') },
        { k: 'scalarConst', constId: shapeConstId },
        { k: 'sig', id: amplitudeId, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'amplitude') },
        { k: 'sig', id: biasId, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'bias') },
      ],
      inputsById: {
        phase: { k: 'sig', id: phaseId, slot: 0 },
        shape: { k: 'scalarConst', constId: shapeConstId },
        amplitude: { k: 'sig', id: amplitudeId, slot: 2 },
        bias: { k: 'sig', id: biasId, slot: 3 },
      },
    });

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    // Should have Sin opcode in map node
    const hasSinOp = sigExprs.some(
      (sig) => sig.kind === 'map' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Sin
    );

    expect(hasSinOp).toBe(true);
  });

  it('should create IR nodes with Cos opcode for cosine wave', () => {
    const blockType = getBlockType('Oscillator');
    if (!blockType) throw new Error('Oscillator not registered');

    const ctx = createMockLowerCtx();

    const phaseId = ctx.b.sigConst(0.0, ctx.inTypes[0]);
    const shapeConstId = ctx.b.allocConstId('cosine');
    const amplitudeId = ctx.b.sigConst(1.0, ctx.inTypes[2]);
    const biasId = ctx.b.sigConst(0.0, ctx.inTypes[3]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'phase') },
        { k: 'scalarConst', constId: shapeConstId },
        { k: 'sig', id: amplitudeId, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'amplitude') },
        { k: 'sig', id: biasId, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'bias') },
      ],
      inputsById: {
        phase: { k: 'sig', id: phaseId, slot: 0 },
        shape: { k: 'scalarConst', constId: shapeConstId },
        amplitude: { k: 'sig', id: amplitudeId, slot: 2 },
        bias: { k: 'sig', id: biasId, slot: 3 },
      },
    });

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    const hasCosOp = sigExprs.some(
      (sig) => sig.kind === 'map' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Cos
    );

    expect(hasCosOp).toBe(true);
  });

  it('should apply amplitude and bias via sigZip nodes', () => {
    const blockType = getBlockType('Oscillator');
    if (!blockType) throw new Error('Oscillator not registered');

    const ctx = createMockLowerCtx();

    const phaseId = ctx.b.sigConst(0.0, ctx.inTypes[0]);
    const shapeConstId = ctx.b.allocConstId('sine');
    const amplitudeId = ctx.b.sigConst(2.0, ctx.inTypes[2]);
    const biasId = ctx.b.sigConst(1.0, ctx.inTypes[3]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'phase') },
        { k: 'scalarConst', constId: shapeConstId },
        { k: 'sig', id: amplitudeId, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'amplitude') },
        { k: 'sig', id: biasId, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'bias') },
      ],
      inputsById: {
        phase: { k: 'sig', id: phaseId, slot: 0 },
        shape: { k: 'scalarConst', constId: shapeConstId },
        amplitude: { k: 'sig', id: amplitudeId, slot: 2 },
        bias: { k: 'sig', id: biasId, slot: 3 },
      },
    });

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    // Should have Mul opcode for amplitude scaling
    const hasMulOp = sigExprs.some(
      (sig) => sig.kind === 'zip' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Mul
    );

    // Should have Add opcode for bias
    const hasAddOp = sigExprs.some(
      (sig) => sig.kind === 'zip' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Add
    );

    expect(hasMulOp).toBe(true);
    expect(hasAddOp).toBe(true);
  });

  it('should handle triangle waveform', () => {
    const blockType = getBlockType('Oscillator');
    if (!blockType) throw new Error('Oscillator not registered');

    const ctx = createMockLowerCtx();

    const phaseId = ctx.b.sigConst(0.0, ctx.inTypes[0]);
    const shapeConstId = ctx.b.allocConstId('triangle');
    const amplitudeId = ctx.b.sigConst(1.0, ctx.inTypes[2]);
    const biasId = ctx.b.sigConst(0.0, ctx.inTypes[3]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'phase') },
        { k: 'scalarConst', constId: shapeConstId },
        { k: 'sig', id: amplitudeId, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'amplitude') },
        { k: 'sig', id: biasId, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'bias') },
      ],
      inputsById: {
        phase: { k: 'sig', id: phaseId, slot: 0 },
        shape: { k: 'scalarConst', constId: shapeConstId },
        amplitude: { k: 'sig', id: amplitudeId, slot: 2 },
        bias: { k: 'sig', id: biasId, slot: 3 },
      },
    });

    expect(result.outputsById?.out).toBeDefined();

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    // Triangle should use Fract and Abs opcodes
    const hasFractOp = sigExprs.some(
      (sig) => sig.kind === 'map' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Fract
    );
    const hasAbsOp = sigExprs.some(
      (sig) => sig.kind === 'map' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Abs
    );

    expect(hasFractOp).toBe(true);
    expect(hasAbsOp).toBe(true);
  });

  it('should handle sawtooth waveform', () => {
    const blockType = getBlockType('Oscillator');
    if (!blockType) throw new Error('Oscillator not registered');

    const ctx = createMockLowerCtx();

    const phaseId = ctx.b.sigConst(0.0, ctx.inTypes[0]);
    const shapeConstId = ctx.b.allocConstId('saw');
    const amplitudeId = ctx.b.sigConst(1.0, ctx.inTypes[2]);
    const biasId = ctx.b.sigConst(0.0, ctx.inTypes[3]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot(ctx.inTypes[0], 'phase') },
        { k: 'scalarConst', constId: shapeConstId },
        { k: 'sig', id: amplitudeId, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'amplitude') },
        { k: 'sig', id: biasId, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'bias') },
      ],
      inputsById: {
        phase: { k: 'sig', id: phaseId, slot: 0 },
        shape: { k: 'scalarConst', constId: shapeConstId },
        amplitude: { k: 'sig', id: amplitudeId, slot: 2 },
        bias: { k: 'sig', id: biasId, slot: 3 },
      },
    });

    expect(result.outputsById?.out).toBeDefined();

    const program = ctx.b.build();
    const sigExprs = program.signalIR.nodes;

    // Saw should use Fract opcode
    const hasFractOp = sigExprs.some(
      (sig) => sig.kind === 'map' && sig.fn.kind === 'opcode' && sig.fn.opcode === OpCode.Fract
    );

    expect(hasFractOp).toBe(true);
  });
});
