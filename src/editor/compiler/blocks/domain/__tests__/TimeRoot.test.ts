/**
 * TimeRoot Block Compiler Tests
 *
 * Tests compilation of TimeRoot blocks with the WP1 TimeRoot Compilers feature.
 * These tests ensure the TimeRoot blocks produce the correct outputs.
 */

import { describe, it, expect } from 'vitest';
import {
  FiniteTimeRootBlock,
  CycleTimeRootBlock,
  InfiniteTimeRootBlock,
  extractTimeRootAutoPublications
} from '../TimeRoot';
import type { CompileCtx } from '../../../types';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestContext(): CompileCtx {
  return {
    env: {},
    geom: {
      get: <K extends object, V>(_key: K, compute: () => V): V => compute(),
      invalidate: () => {},
    },
  };
}

// =============================================================================
// FiniteTimeRoot Tests
// =============================================================================

describe('FiniteTimeRootBlock', () => {
  it('should have correct type', () => {
    expect(FiniteTimeRootBlock.type).toBe('FiniteTimeRoot');
    // Note: category property doesn't exist on BlockCompiler interface
    // expect(FiniteTimeRootBlock.category).toBe('TimeRoot');
  });

  it('should have no inputs', () => {
    expect(FiniteTimeRootBlock.inputs).toEqual([]);
  });

  it('should have all expected outputs', () => {
    expect(FiniteTimeRootBlock.outputs).toEqual([
      { name: 'systemTime', type: { kind: 'Signal:Time' } },
      { name: 'progress', type: { kind: 'Signal:number' } },
      { name: 'end', type: { kind: 'Event' } },
      { name: 'energy', type: { kind: 'Signal:number' } },
    ]);
  });

  it('should compile with default duration', () => {
    const ctx = createTestContext();
    const result = FiniteTimeRootBlock.compile({
      id: 'test',
      params: {},
      inputs: {},
      ctx,
    });

    expect(result.systemTime?.kind).toBe('Signal:Time');
    expect(result.progress?.kind).toBe('Signal:number');
    expect(result.end?.kind).toBe('Event');
    expect(result.energy?.kind).toBe('Signal:number');

    // Test signal behavior
    if (result.systemTime?.kind === 'Signal:Time') {
      const signal = result.systemTime.value;
      expect(signal(1000, ctx)).toBe(1000); // Identity
      expect(signal(5000, ctx)).toBe(5000);
      expect(signal(6000, ctx)).toBe(6000);
    }

    // Test progress clamping
    if (result.progress?.kind === 'Signal:number') {
      const progress = result.progress.value;
      expect(progress(-1000, ctx)).toBe(0); // Before start
      expect(progress(0, ctx)).toBe(0); // Start
      expect(progress(2500, ctx)).toBe(0.5); // Halfway
      expect(progress(5000, ctx)).toBe(1); // End
      expect(progress(6000, ctx)).toBe(1); // After end (clamped)
    }

    // Test end event
    if (result.end?.kind === 'Event') {
      const endEvent = result.end.value;
      expect(endEvent(4999, 4000, ctx)).toBe(false); // Before end
      expect(endEvent(5000, 4000, ctx)).toBe(true); // At end
      expect(endEvent(5001, 5000, ctx)).toBe(false); // After end (not edge)
    }
  });

  it('should compile with custom duration', () => {
    const ctx = createTestContext();
    const result = FiniteTimeRootBlock.compile({
      id: 'test',
      params: { durationMs: 10000 },
      inputs: {},
      ctx,
    });

    if (result.progress?.kind === 'Signal:number') {
      const progress = result.progress.value;
      expect(progress(5000, ctx)).toBe(0.5); // Halfway through 10s
      expect(progress(10000, ctx)).toBe(1); // End at 10s
    }
  });
});

// =============================================================================
// CycleTimeRoot Tests
// =============================================================================

describe('CycleTimeRootBlock', () => {
  it('should have correct type', () => {
    expect(CycleTimeRootBlock.type).toBe('CycleTimeRoot');
    // Note: category property doesn't exist on BlockCompiler interface
    // expect(CycleTimeRootBlock.category).toBe('TimeRoot');
  });

  it('should have no inputs', () => {
    expect(CycleTimeRootBlock.inputs).toEqual([]);
  });

  it('should have all expected outputs', () => {
    expect(CycleTimeRootBlock.outputs).toEqual([
      { name: 'systemTime', type: { kind: 'Signal:Time' } },
      { name: 'cycleT', type: { kind: 'Signal:Time' } },
      { name: 'phase', type: { kind: 'Signal:phase' } },
      { name: 'wrap', type: { kind: 'Event' } },
      { name: 'cycleIndex', type: { kind: 'Signal:number' } },
      { name: 'energy', type: { kind: 'Signal:number' } },
    ]);
  });

  it('should compile with default period', () => {
    const ctx = createTestContext();
    const result = CycleTimeRootBlock.compile({
      id: 'test',
      params: {},
      inputs: {},
      ctx,
    });

    expect(result.systemTime?.kind).toBe('Signal:Time');
    expect(result.cycleT?.kind).toBe('Signal:Time');
    expect(result.phase?.kind).toBe('Signal:phase');
    expect(result.wrap?.kind).toBe('Event');
    expect(result.cycleIndex?.kind).toBe('Signal:number');
    expect(result.energy?.kind).toBe('Signal:number');

    // Test phase (0..1 normalized)
    if (result.phase?.kind === 'Signal:phase') {
      const phase = result.phase.value;
      expect(phase(0, ctx)).toBe(0);
      expect(phase(1500, ctx)).toBe(0.5); // Halfway through 3s period
      expect(phase(3000, ctx)).toBeCloseTo(0); // Complete cycle
      expect(phase(4500, ctx)).toBe(0.5); // Second cycle halfway
    }

    // Test cycleT (time within current cycle)
    if (result.cycleT?.kind === 'Signal:Time') {
      const cycleT = result.cycleT.value;
      expect(cycleT(0, ctx)).toBe(0);
      expect(cycleT(1500, ctx)).toBe(1500);
      expect(cycleT(3000, ctx)).toBe(0); // Reset at cycle boundary
      expect(cycleT(4500, ctx)).toBe(1500); // Second cycle
    }

    // Test wrap event
    if (result.wrap?.kind === 'Event') {
      const wrap = result.wrap.value;
      expect(wrap(2999, 2000, ctx)).toBe(false); // Before wrap
      expect(wrap(3000, 2000, ctx)).toBe(true); // At wrap boundary
      expect(wrap(3001, 3000, ctx)).toBe(false); // After wrap
    }

    // Test cycle index
    if (result.cycleIndex?.kind === 'Signal:number') {
      const cycleIndex = result.cycleIndex.value;
      expect(cycleIndex(1000, ctx)).toBe(0); // First cycle
      expect(cycleIndex(3000, ctx)).toBe(1); // Second cycle
      expect(cycleIndex(6000, ctx)).toBe(2); // Third cycle
    }
  });

  it('should compile with custom period', () => {
    const ctx = createTestContext();
    const result = CycleTimeRootBlock.compile({
      id: 'test',
      params: { periodMs: 6000 },
      inputs: {},
      ctx,
    });

    if (result.phase?.kind === 'Signal:phase') {
      const phase = result.phase.value;
      expect(phase(1500, ctx)).toBe(0.25); // Quarter through 6s period
      expect(phase(3000, ctx)).toBe(0.5); // Halfway through 6s period
    }
  });
});

// =============================================================================
// InfiniteTimeRoot Tests
// =============================================================================

describe('InfiniteTimeRootBlock', () => {
  it('should have correct type', () => {
    expect(InfiniteTimeRootBlock.type).toBe('InfiniteTimeRoot');
    // Note: category property doesn't exist on BlockCompiler interface
    // expect(InfiniteTimeRootBlock.category).toBe('TimeRoot');
  });

  it('should have no inputs', () => {
    expect(InfiniteTimeRootBlock.inputs).toEqual([]);
  });

  it('should have all expected outputs', () => {
    expect(InfiniteTimeRootBlock.outputs).toEqual([
      { name: 'systemTime', type: { kind: 'Signal:Time' } },
      { name: 'energy', type: { kind: 'Signal:number' } },
    ]);
  });

  it('should compile correctly', () => {
    const ctx = createTestContext();
    const result = InfiniteTimeRootBlock.compile({
      id: 'test',
      params: {},
      inputs: {},
      ctx,
    });

    expect(result.systemTime?.kind).toBe('Signal:Time');
    expect(result.energy?.kind).toBe('Signal:number');

    // Test system time (identity)
    if (result.systemTime?.kind === 'Signal:Time') {
      const signal = result.systemTime.value;
      expect(signal(1000, ctx)).toBe(1000);
      expect(signal(5000, ctx)).toBe(5000);
    }

    // Test energy (constant 1.0)
    if (result.energy?.kind === 'Signal:number') {
      const energy = result.energy.value;
      expect(energy(0, ctx)).toBe(1.0);
      expect(energy(1000, ctx)).toBe(1.0);
      expect(energy(5000, ctx)).toBe(1.0);
    }
  });
});

// =============================================================================
// Auto-Publication Tests
// =============================================================================

describe('extractTimeRootAutoPublications', () => {
  it('should extract publications for CycleTimeRoot', () => {
    const result = extractTimeRootAutoPublications('CycleTimeRoot', {});
    expect(result).toEqual([
      { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
      { busName: 'pulse', artifactKey: 'wrap', sortKey: 0 },
      { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
    ]);
  });

  it('should extract publications for FiniteTimeRoot', () => {
    const result = extractTimeRootAutoPublications('FiniteTimeRoot', {});
    expect(result).toEqual([
      { busName: 'progress', artifactKey: 'progress', sortKey: 0 },
      { busName: 'pulse', artifactKey: 'end', sortKey: 0 },
      { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
    ]);
  });

  it('should extract publications for InfiniteTimeRoot', () => {
    const result = extractTimeRootAutoPublications('InfiniteTimeRoot', {});
    expect(result).toEqual([
      { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
    ]);
  });

  it('should return empty array for unknown block type', () => {
    const result = extractTimeRootAutoPublications('UnknownTimeRoot', {});
    expect(result).toEqual([]);
  });
});