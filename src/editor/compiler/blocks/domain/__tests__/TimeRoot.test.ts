/**
 * TimeRoot Block Compiler Tests
 *
 * Tests compilation of TimeRoot blocks with the WP1 TimeRoot Compilers feature.
 * These tests ensure the TimeRoot blocks produce the correct outputs.
 */

import { describe, it, expect } from 'vitest';
import {
  FiniteTimeRootBlock,
  InfiniteTimeRootBlock,
  extractTimeRootAutoPublications
} from '../TimeRoot';
import type { CompileCtx, RuntimeCtx } from '../../../types';

// =============================================================================
// Test Helpers
// =============================================================================

type Event = (tMs: number, lastTMs: number, ctx: RuntimeCtx) => boolean;

function createTestContext(): CompileCtx & RuntimeCtx {
  return {
    env: {},
    geom: {
      get: <K extends object, V>(_key: K, compute: () => V): V => compute(),
      invalidate: () => {},
    },
    viewport: { w: 1920, h: 1080, dpr: 1 },
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
      { name: 'progress', type: { kind: 'Signal:float' } },
      { name: 'phase', type: { kind: 'Signal:phase' } },
      { name: 'end', type: { kind: 'Event' } },
      { name: 'energy', type: { kind: 'Signal:float' } },
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
    expect(result.progress?.kind).toBe('Signal:float');
    expect(result.end?.kind).toBe('Event');
    expect(result.energy?.kind).toBe('Signal:float');

    // Test signal behavior
    if (result.systemTime?.kind === 'Signal:Time') {
      const signal = result.systemTime.value;
      expect(signal(1000, ctx)).toBe(1000); // Identity
      expect(signal(5000, ctx)).toBe(5000);
      expect(signal(6000, ctx)).toBe(6000);
    }

    // Test progress clamping
    if (result.progress?.kind === 'Signal:float') {
      const progress = result.progress.value;
      expect(progress(-1000, ctx)).toBe(0); // Before start
      expect(progress(0, ctx)).toBe(0); // Start
      expect(progress(2500, ctx)).toBe(0.5); // Halfway
      expect(progress(5000, ctx)).toBe(1); // End
      expect(progress(6000, ctx)).toBe(1); // After end (clamped)
    }

    // Test end event
    if (result.end?.kind === 'Event') {
      const endEvent = result.end.value as Event;
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

    if (result.progress?.kind === 'Signal:float') {
      const progress = result.progress.value;
      expect(progress(5000, ctx)).toBe(0.5); // Halfway through 10s
      expect(progress(10000, ctx)).toBe(1); // End at 10s
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

  it('should have expected inputs', () => {
    expect(InfiniteTimeRootBlock.inputs).toEqual([
      { name: 'windowMs', type: { kind: 'Scalar:float' } },
      { name: 'periodMs', type: { kind: 'Scalar:float' } },
    ]);
  });

  it('should have all expected outputs', () => {
    expect(InfiniteTimeRootBlock.outputs).toEqual([
      { name: 'systemTime', type: { kind: 'Signal:Time' } },
      { name: 'phase', type: { kind: 'Signal:phase' } },
      { name: 'pulse', type: { kind: 'Event' } },
      { name: 'energy', type: { kind: 'Signal:float' } },
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
    expect(result.energy?.kind).toBe('Signal:float');

    // Test system time (identity)
    if (result.systemTime?.kind === 'Signal:Time') {
      const signal = result.systemTime.value;
      expect(signal(1000, ctx)).toBe(1000);
      expect(signal(5000, ctx)).toBe(5000);
    }

    // Test energy (constant 1.0)
    if (result.energy?.kind === 'Signal:float') {
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
  it('should extract publications for InfiniteTimeRoot', () => {
    const result = extractTimeRootAutoPublications('InfiniteTimeRoot', {});
    expect(result).toEqual([
      { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
      { busName: 'phaseB', artifactKey: 'phase', sortKey: 0 },
      { busName: 'pulse', artifactKey: 'pulse', sortKey: 0 },
      { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
    ]);
  });

  it('should extract publications for FiniteTimeRoot', () => {
    const result = extractTimeRootAutoPublications('FiniteTimeRoot', {});
    expect(result).toEqual([
      { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
      { busName: 'phaseB', artifactKey: 'phase', sortKey: 0 },
      { busName: 'progress', artifactKey: 'progress', sortKey: 0 },
      { busName: 'pulse', artifactKey: 'end', sortKey: 0 },
      { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
    ]);
  });

  it('should extract publications for InfiniteTimeRoot', () => {
    const result = extractTimeRootAutoPublications('InfiniteTimeRoot', {});
    expect(result).toEqual([
      { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
      { busName: 'phaseB', artifactKey: 'phase', sortKey: 0 },
      { busName: 'pulse', artifactKey: 'pulse', sortKey: 0 },
      { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
    ]);
  });

  it('should return empty array for unknown block type', () => {
    const result = extractTimeRootAutoPublications('UnknownTimeRoot', {});
    expect(result).toEqual([]);
  });
});
