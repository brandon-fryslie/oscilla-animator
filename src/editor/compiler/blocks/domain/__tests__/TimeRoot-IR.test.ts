/**
 * TimeRoot Block IR Lowering Tests
 *
 * Tests that TimeRoot blocks emit correct IR nodes (not closures).
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';

// Import to trigger block registration
import '../TimeRoot';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(blockType: string, outTypes: any[]): LowerCtx {
  const b = new IRBuilderImpl();

  return {
    blockIdx: 0 as BlockIndex,
    blockType,
    instanceId: 'test-block',
    label: 'Test Block',
    inTypes: [],
    outTypes,
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// FiniteTimeRoot IR Tests
// =============================================================================

describe('FiniteTimeRoot IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('FiniteTimeRoot');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('FiniteTimeRoot');
    expect(blockType?.capability).toBe('time');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit IR nodes for all outputs', () => {
    const blockType = getBlockType('FiniteTimeRoot');
    if (!blockType) throw new Error('FiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('FiniteTimeRoot', outTypes);
    const result = blockType.lower({
      ctx,
      inputs: [],
      config: { durationMs: 5000 },
    });

    // Should have 5 outputs
    expect(result.outputs).toHaveLength(5);

    // All outputs should be signal or event references
    const [systemTime, progress, phase, end, energy] = result.outputs;

    expect(systemTime.k).toBe('sig');
    expect(progress.k).toBe('sig');
    expect(phase.k).toBe('sig');
    expect(end.k).toBe('sig'); // sigWrapEvent is technically a signal
    expect(energy.k).toBe('sig');

    // Each should have a slot allocated
    if (systemTime.k === 'sig') expect(systemTime.slot).toBeGreaterThanOrEqual(0);
    if (progress.k === 'sig') expect(progress.slot).toBeGreaterThanOrEqual(0);
    if (phase.k === 'sig') expect(phase.slot).toBeGreaterThanOrEqual(0);
    if (end.k === 'sig') expect(end.slot).toBeGreaterThanOrEqual(0);
    if (energy.k === 'sig') expect(energy.slot).toBeGreaterThanOrEqual(0);
  });

  it('should declare TimeModel with correct duration', () => {
    const blockType = getBlockType('FiniteTimeRoot');
    if (!blockType) throw new Error('FiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('FiniteTimeRoot', outTypes);
    const result = blockType.lower({
      ctx,
      inputs: [],
      config: { durationMs: 10000 },
    });

    expect(result.declares).toBeDefined();
    expect(result.declares?.timeModel).toEqual({
      kind: 'finite',
      durationMs: 10000,
    });
  });

  it('should use default duration when config is empty', () => {
    const blockType = getBlockType('FiniteTimeRoot');
    if (!blockType) throw new Error('FiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('FiniteTimeRoot', outTypes);
    const result = blockType.lower({
      ctx,
      inputs: [],
      config: {},
    });

    expect(result.declares?.timeModel).toEqual({
      kind: 'finite',
      durationMs: 1000, // Default from implementation
    });
  });

  it('should set time slots in IRBuilder', () => {
    const blockType = getBlockType('FiniteTimeRoot');
    if (!blockType) throw new Error('FiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('FiniteTimeRoot', outTypes);
    blockType.lower({
      ctx,
      inputs: [],
      config: { durationMs: 5000 },
    });

    const timeSlots = ctx.b.getTimeSlots();
    expect(timeSlots).toBeDefined();
    expect(timeSlots?.systemTime).toBeGreaterThanOrEqual(0);
    expect(timeSlots?.tAbsMs).toBeGreaterThanOrEqual(0);
    expect(timeSlots?.tModelMs).toBeGreaterThanOrEqual(0);
    expect(timeSlots?.phase01).toBeGreaterThanOrEqual(0);
    expect(timeSlots?.progress01).toBeGreaterThanOrEqual(0);
    expect(timeSlots?.wrapEvent).toBeGreaterThanOrEqual(0);
  });

  it('should create IR signal expressions', () => {
    const blockType = getBlockType('FiniteTimeRoot');
    if (!blockType) throw new Error('FiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('FiniteTimeRoot', outTypes);
    blockType.lower({
      ctx,
      inputs: [],
      config: { durationMs: 5000 },
    });

    // Verify IR nodes were created
    const program = ctx.b.build();
    expect(program.signalIR.nodes.length).toBeGreaterThan(0);

    // Should have at least canonical time signals
    const sigExprs = program.signalIR.nodes;
    const hasTimeAbsMs = sigExprs.some((sig) => sig.kind === 'timeAbsMs');
    const hasTimeModelMs = sigExprs.some((sig) => sig.kind === 'timeModelMs');
    const hasPhase01 = sigExprs.some((sig) => sig.kind === 'phase01');

    expect(hasTimeAbsMs).toBe(true);
    expect(hasTimeModelMs).toBe(true);
    expect(hasPhase01).toBe(true);
  });
});

// =============================================================================
// InfiniteTimeRoot IR Tests
// =============================================================================

describe('InfiniteTimeRoot IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('InfiniteTimeRoot');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('InfiniteTimeRoot');
    expect(blockType?.capability).toBe('time');
    expect(blockType?.lower).toBeDefined();
  });

  it('should emit IR nodes for all outputs', () => {
    const blockType = getBlockType('InfiniteTimeRoot');
    if (!blockType) throw new Error('InfiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('InfiniteTimeRoot', outTypes);
    const result = blockType.lower({
      ctx,
      inputs: [
        // windowMs input (optional)
        { k: 'scalarConst' as const, constId: ctx.b.allocConstId(8000) },
        // periodMs input (optional)
        { k: 'scalarConst' as const, constId: ctx.b.allocConstId(4000) },
      ],
      config: {},
    });

    // Should have 4 outputs
    expect(result.outputs).toHaveLength(4);

    const [systemTime, phase, pulse, energy] = result.outputs;

    expect(systemTime.k).toBe('sig');
    expect(phase.k).toBe('sig');
    expect(pulse.k).toBe('sig'); // sigWrapEvent is technically a signal
    expect(energy.k).toBe('sig');

    // Each should have a slot allocated
    if (systemTime.k === 'sig') expect(systemTime.slot).toBeGreaterThanOrEqual(0);
    if (phase.k === 'sig') expect(phase.slot).toBeGreaterThanOrEqual(0);
    if (pulse.k === 'sig') expect(pulse.slot).toBeGreaterThanOrEqual(0);
    if (energy.k === 'sig') expect(energy.slot).toBeGreaterThanOrEqual(0);
  });

  it('should declare cyclic TimeModel', () => {
    const blockType = getBlockType('InfiniteTimeRoot');
    if (!blockType) throw new Error('InfiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('InfiniteTimeRoot', outTypes);
    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst' as const, constId: ctx.b.allocConstId(8000) },
        { k: 'scalarConst' as const, constId: ctx.b.allocConstId(4000) },
      ],
      config: {},
    });

    expect(result.declares).toBeDefined();
    expect(result.declares?.timeModel?.kind).toBe('cyclic');
  });

  it('should create IR signal expressions', () => {
    const blockType = getBlockType('InfiniteTimeRoot');
    if (!blockType) throw new Error('InfiniteTimeRoot not registered');

    const outTypes = [
      { world: 'signal' as const, domain: 'timeMs' as const, category: 'internal' as const, busEligible: false },
      { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const, category: 'core' as const, busEligible: true },
      { world: 'event' as const, domain: 'trigger' as const, category: 'core' as const, busEligible: true },
      { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true },
    ];

    const ctx = createMockLowerCtx('InfiniteTimeRoot', outTypes);
    blockType.lower({
      ctx,
      inputs: [
        { k: 'scalarConst' as const, constId: ctx.b.allocConstId(8000) },
        { k: 'scalarConst' as const, constId: ctx.b.allocConstId(4000) },
      ],
      config: {},
    });

    // Verify IR nodes were created
    const program = ctx.b.build();
    expect(program.signalIR.nodes.length).toBeGreaterThan(0);
  });
});
