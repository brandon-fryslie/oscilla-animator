/**
 * Bus Semantics tests
 *
 * Tests for canonical bus semantics: publisher sorting and signal/field combination.
 */

import { describe, it, expect } from 'vitest';
import {
  getSortedPublishers,
  combineSignalArtifacts,
  combineFieldArtifacts,
  validateCombineMode,
  getSupportedCombineModes,
} from '../busSemantics';
import type { Publisher } from '../../types';
import type { Artifact, RuntimeCtx, CompileCtx, Seed } from '../../compiler/types';

// =============================================================================
// Publisher Sorting Tests
// =============================================================================

describe('getSortedPublishers', () => {
  it('sorts by sortKey ascending', () => {
    const publishers: Publisher[] = [
      { id: 'p1', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 2, enabled: true },
      { id: 'p2', busId: 'bus1', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: 1, enabled: true },
      { id: 'p3', busId: 'bus1', from: { blockId: 'b3', slotId: 's3', direction: 'output' }, sortKey: 3, enabled: true },
    ];
    const sorted = getSortedPublishers('bus1', publishers);
    expect(sorted.map(p => p.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('uses id as tie-breaker when sortKey equal', () => {
    const publishers: Publisher[] = [
      { id: 'charlie', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 0, enabled: true },
      { id: 'alpha', busId: 'bus1', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: 0, enabled: true },
      { id: 'bravo', busId: 'bus1', from: { blockId: 'b3', slotId: 's3', direction: 'output' }, sortKey: 0, enabled: true },
    ];
    const sorted = getSortedPublishers('bus1', publishers);
    expect(sorted.map(p => p.id)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('filters disabled publishers by default', () => {
    const publishers: Publisher[] = [
      { id: 'p1', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 1, enabled: true },
      { id: 'p2', busId: 'bus1', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: 2, enabled: false },
    ];
    const sorted = getSortedPublishers('bus1', publishers);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe('p1');
  });

  it('includes disabled publishers when requested', () => {
    const publishers: Publisher[] = [
      { id: 'p1', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 1, enabled: true },
      { id: 'p2', busId: 'bus1', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: 2, enabled: false },
    ];
    const sorted = getSortedPublishers('bus1', publishers, true);
    expect(sorted).toHaveLength(2);
    expect(sorted.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('filters by busId', () => {
    const publishers: Publisher[] = [
      { id: 'p1', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 1, enabled: true },
      { id: 'p2', busId: 'bus2', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: 2, enabled: true },
    ];
    const sorted = getSortedPublishers('bus1', publishers);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].busId).toBe('bus1');
  });

  it('returns empty array when no publishers match', () => {
    const publishers: Publisher[] = [
      { id: 'p1', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 1, enabled: true },
    ];
    const sorted = getSortedPublishers('bus2', publishers);
    expect(sorted).toEqual([]);
  });

  it('handles negative sortKey values correctly', () => {
    const publishers: Publisher[] = [
      { id: 'p1', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 1, enabled: true },
      { id: 'p2', busId: 'bus1', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: -1, enabled: true },
      { id: 'p3', busId: 'bus1', from: { blockId: 'b3', slotId: 's3', direction: 'output' }, sortKey: 0, enabled: true },
    ];
    const sorted = getSortedPublishers('bus1', publishers);
    expect(sorted.map(p => p.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('preserves original array (immutability)', () => {
    const publishers: Publisher[] = [
      { id: 'p2', busId: 'bus1', from: { blockId: 'b1', slotId: 's1', direction: 'output' }, sortKey: 2, enabled: true },
      { id: 'p1', busId: 'bus1', from: { blockId: 'b2', slotId: 's2', direction: 'output' }, sortKey: 1, enabled: true },
    ];
    const originalOrder = publishers.map(p => p.id);
    getSortedPublishers('bus1', publishers);
    expect(publishers.map(p => p.id)).toEqual(originalOrder);
  });
});

// =============================================================================
// Signal Combination Tests
// =============================================================================

describe('combineSignalArtifacts', () => {
  const mockCtx: RuntimeCtx = { viewport: { w: 1920, h: 1080, dpr: 1 } };

  describe('with no artifacts', () => {
    it('returns default number as Signal:number', () => {
      const result = combineSignalArtifacts([], 'last', 42);
      expect(result.kind).toBe('Signal:number');
      if (result.kind === 'Signal:number') {
        expect(result.value(0, mockCtx)).toBe(42);
      }
    });

    it('returns default vec2 as Signal:vec2', () => {
      const defaultVec = { x: 10, y: 20 };
      const result = combineSignalArtifacts([], 'last', defaultVec);
      expect(result.kind).toBe('Signal:vec2');
      if (result.kind === 'Signal:vec2') {
        expect(result.value(0, mockCtx)).toEqual(defaultVec);
      }
    });

    it('returns Scalar:number for unknown default types', () => {
      const result = combineSignalArtifacts([], 'last', 'unknown');
      expect(result.kind).toBe('Scalar:number');
    });
  });

  describe('with single artifact', () => {
    it('returns the artifact as-is', () => {
      const artifact: Artifact = {
        kind: 'Signal:number',
        value: () => 100,
      };
      const result = combineSignalArtifacts([artifact], 'last', 0);
      expect(result).toBe(artifact);
    });
  });

  describe('with multiple artifacts - last mode', () => {
    it('returns the last artifact (highest sortKey)', () => {
      const artifacts: Artifact[] = [
        { kind: 'Signal:number', value: () => 1 },
        { kind: 'Signal:number', value: () => 2 },
        { kind: 'Signal:number', value: () => 3 },
      ];
      const result = combineSignalArtifacts(artifacts, 'last', 0);
      expect(result.kind).toBe('Signal:number');
      if (result.kind === 'Signal:number') {
        expect(result.value(0, mockCtx)).toBe(3);
      }
    });
  });

  describe('with multiple artifacts - sum mode', () => {
    it('sums Signal:number values', () => {
      const artifacts: Artifact[] = [
        { kind: 'Signal:number', value: () => 10 },
        { kind: 'Signal:number', value: () => 20 },
        { kind: 'Signal:number', value: () => 30 },
      ];
      const result = combineSignalArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Signal:number');
      if (result.kind === 'Signal:number') {
        expect(result.value(0, mockCtx)).toBe(60);
      }
    });

    it('sums Signal:vec2 values', () => {
      const artifacts: Artifact[] = [
        { kind: 'Signal:vec2', value: () => ({ x: 1, y: 2 }) },
        { kind: 'Signal:vec2', value: () => ({ x: 3, y: 4 }) },
        { kind: 'Signal:vec2', value: () => ({ x: 5, y: 6 }) },
      ];
      const result = combineSignalArtifacts(artifacts, 'sum', { x: 0, y: 0 });
      expect(result.kind).toBe('Signal:vec2');
      if (result.kind === 'Signal:vec2') {
        expect(result.value(0, mockCtx)).toEqual({ x: 9, y: 12 });
      }
    });

    it('sums Scalar:number values', () => {
      const artifacts: Artifact[] = [
        { kind: 'Scalar:number', value: 5 },
        { kind: 'Scalar:number', value: 10 },
        { kind: 'Scalar:number', value: 15 },
      ];
      const result = combineSignalArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Scalar:number');
      if (result.kind === 'Scalar:number') {
        expect(result.value).toBe(30);
      }
    });

    it('sums Scalar:vec2 values', () => {
      const artifacts: Artifact[] = [
        { kind: 'Scalar:vec2', value: { x: 1, y: 2 } },
        { kind: 'Scalar:vec2', value: { x: 3, y: 4 } },
      ];
      const result = combineSignalArtifacts(artifacts, 'sum', { x: 0, y: 0 });
      expect(result.kind).toBe('Scalar:vec2');
      if (result.kind === 'Scalar:vec2') {
        expect(result.value).toEqual({ x: 4, y: 6 });
      }
    });

    it('returns Error for unsupported type in sum mode', () => {
      // Need 2+ artifacts to trigger combine logic (single artifacts pass through)
      const artifacts: Artifact[] = [
        { kind: 'Signal:phase' as any, value: () => 0.5 },
        { kind: 'Signal:phase' as any, value: () => 0.7 },
      ];
      const result = combineSignalArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Error');
      if (result.kind === 'Error') {
        expect(result.message).toContain('Sum mode not supported');
      }
    });
  });

  describe('with unsupported combine mode', () => {
    it('returns Error for unknown mode', () => {
      // Need 2+ artifacts to trigger combine logic (single artifacts pass through)
      const artifacts: Artifact[] = [
        { kind: 'Signal:number', value: () => 10 },
        { kind: 'Signal:number', value: () => 20 },
      ];
      const result = combineSignalArtifacts(artifacts, 'average', 0);
      expect(result.kind).toBe('Error');
      if (result.kind === 'Error') {
        expect(result.message).toContain('Unsupported combine mode: average');
      }
    });
  });

  describe('time-varying behavior', () => {
    it('evaluates signals at different times correctly', () => {
      const artifacts: Artifact[] = [
        { kind: 'Signal:number', value: (t: number) => t * 2 },
        { kind: 'Signal:number', value: (t: number) => t + 10 },
      ];
      const result = combineSignalArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Signal:number');
      if (result.kind === 'Signal:number') {
        expect(result.value(0, mockCtx)).toBe(10); // 0*2 + 0+10 = 10
        expect(result.value(5, mockCtx)).toBe(25); // 5*2 + 5+10 = 25
        expect(result.value(10, mockCtx)).toBe(40); // 10*2 + 10+10 = 40
      }
    });
  });
});

// =============================================================================
// Field Combination Tests
// =============================================================================

describe('combineFieldArtifacts', () => {
  const mockCtx: CompileCtx = { env: {}, geom: { get: () => null as any, invalidate: () => {} } };
  const seed: Seed = 12345; // Seed is just a number

  describe('with no artifacts', () => {
    it('returns constant field with default number', () => {
      const result = combineFieldArtifacts([], 'last', 42);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        const values = result.value(seed, 3, mockCtx);
        expect(values).toEqual([42, 42, 42]);
      }
    });

    it('returns Error for non-number default', () => {
      const result = combineFieldArtifacts([], 'last', 'not-a-number');
      expect(result.kind).toBe('Error');
      if (result.kind === 'Error') {
        expect(result.message).toContain('Default value type not supported');
      }
    });
  });

  describe('with single artifact', () => {
    it('returns the artifact as-is', () => {
      const artifact: Artifact = {
        kind: 'Field:number',
        value: () => [1, 2, 3],
      };
      const result = combineFieldArtifacts([artifact], 'last', 0);
      expect(result).toBe(artifact);
    });
  });

  describe('with multiple artifacts - last mode', () => {
    it('returns the last artifact (highest sortKey)', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [1, 2, 3] },
        { kind: 'Field:number', value: () => [4, 5, 6] },
        { kind: 'Field:number', value: () => [7, 8, 9] },
      ];
      const result = combineFieldArtifacts(artifacts, 'last', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([7, 8, 9]);
      }
    });
  });

  describe('with multiple artifacts - sum mode', () => {
    it('sums field values per-element', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [1, 2, 3] },
        { kind: 'Field:number', value: () => [10, 20, 30] },
        { kind: 'Field:number', value: () => [100, 200, 300] },
      ];
      const result = combineFieldArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([111, 222, 333]);
      }
    });

    it('handles missing values as 0', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [1, 2] },
        { kind: 'Field:number', value: () => [10, 20, 30] },
      ];
      const result = combineFieldArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([11, 22, 30]);
      }
    });
  });

  describe('with multiple artifacts - average mode', () => {
    it('averages field values per-element', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [10, 20, 30] },
        { kind: 'Field:number', value: () => [20, 40, 60] },
      ];
      const result = combineFieldArtifacts(artifacts, 'average', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([15, 30, 45]);
      }
    });

    it('divides by field count, not element count', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [9, 12, 15] },
        { kind: 'Field:number', value: () => [3, 6, 9] },
        { kind: 'Field:number', value: () => [0, 0, 0] },
      ];
      const result = combineFieldArtifacts(artifacts, 'average', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([4, 6, 8]);
      }
    });
  });

  describe('with multiple artifacts - max mode', () => {
    it('takes max value per-element', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [1, 20, 3] },
        { kind: 'Field:number', value: () => [10, 2, 30] },
        { kind: 'Field:number', value: () => [5, 15, 25] },
      ];
      const result = combineFieldArtifacts(artifacts, 'max', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([10, 20, 30]);
      }
    });

    it('handles negative values correctly', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [-5, -10, -15] },
        { kind: 'Field:number', value: () => [-2, -20, -8] },
      ];
      const result = combineFieldArtifacts(artifacts, 'max', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([-2, -10, -8]);
      }
    });
  });

  describe('with multiple artifacts - min mode', () => {
    it('takes min value per-element', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [1, 20, 3] },
        { kind: 'Field:number', value: () => [10, 2, 30] },
        { kind: 'Field:number', value: () => [5, 15, 25] },
      ];
      const result = combineFieldArtifacts(artifacts, 'min', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([1, 2, 3]);
      }
    });

    it('handles negative values correctly', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [-5, -10, -15] },
        { kind: 'Field:number', value: () => [-2, -20, -8] },
      ];
      const result = combineFieldArtifacts(artifacts, 'min', 0);
      expect(result.kind).toBe('Field:number');
      if (result.kind === 'Field:number') {
        expect(result.value(seed, 3, mockCtx)).toEqual([-5, -20, -15]);
      }
    });
  });

  describe('error handling', () => {
    it('returns Error for non-Field:number artifacts', () => {
      // Create wrong-type artifacts that will fail type checking
      const wrongArtifact1: Artifact = { kind: 'Signal:number', value: () => 10 };
      const wrongArtifact2: Artifact = { kind: 'Signal:number', value: () => 20 };
      const artifacts = [wrongArtifact1, wrongArtifact2];

      const result = combineFieldArtifacts(artifacts, 'sum', 0);
      expect(result.kind).toBe('Error');
      if (result.kind === 'Error') {
        expect(result.message).toContain('Field combination only supports Field:number');
      }
    });

    it('returns Error for unsupported combine mode', () => {
      const artifacts: Artifact[] = [
        { kind: 'Field:number', value: () => [1, 2, 3] },
        { kind: 'Field:number', value: () => [4, 5, 6] },
      ];
      const result = combineFieldArtifacts(artifacts, 'median', 0);
      expect(result.kind).toBe('Error');
      if (result.kind === 'Error') {
        expect(result.message).toContain('Unsupported combine mode: median');
      }
    });
  });
});

// =============================================================================
// Validation Helper Tests
// =============================================================================

describe('validateCombineMode', () => {
  it('accepts valid signal modes', () => {
    expect(validateCombineMode('signal', 'last')).toBe(true);
    expect(validateCombineMode('signal', 'sum')).toBe(true);
  });

  it('rejects invalid signal modes', () => {
    expect(validateCombineMode('signal', 'average')).toBe(false);
    expect(validateCombineMode('signal', 'max')).toBe(false);
    expect(validateCombineMode('signal', 'min')).toBe(false);
    expect(validateCombineMode('signal', 'unknown')).toBe(false);
  });

  it('accepts valid field modes', () => {
    expect(validateCombineMode('field', 'last')).toBe(true);
    expect(validateCombineMode('field', 'sum')).toBe(true);
    expect(validateCombineMode('field', 'average')).toBe(true);
    expect(validateCombineMode('field', 'max')).toBe(true);
    expect(validateCombineMode('field', 'min')).toBe(true);
  });

  it('rejects invalid field modes', () => {
    expect(validateCombineMode('field', 'unknown')).toBe(false);
    expect(validateCombineMode('field', 'median')).toBe(false);
  });
});

describe('getSupportedCombineModes', () => {
  it('returns correct modes for signal world', () => {
    const modes = getSupportedCombineModes('signal');
    expect(modes).toEqual(['last', 'sum']);
  });

  it('returns correct modes for field world', () => {
    const modes = getSupportedCombineModes('field');
    expect(modes).toEqual(['last', 'sum', 'average', 'max', 'min']);
  });

  it('returns empty array for unknown world', () => {
    const modes = getSupportedCombineModes('unknown' as any);
    expect(modes).toEqual([]);
  });
});
