/**
 * FieldStats Tests
 *
 * Validates statistical computation for field data.
 */

import { describe, it, expect } from 'vitest';
import { computeFieldStats, isValidField, formatFieldStats } from '../FieldStats';

describe('computeFieldStats', () => {
  it('handles empty field gracefully', () => {
    const field = new Float32Array([]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.stdDev).toBe(0);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
  });

  it('computes correct stats for known distribution (0-1 uniform)', () => {
    // Uniform distribution: 0, 0.25, 0.5, 0.75, 1.0
    const field = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(5);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(1.0);
    expect(stats.mean).toBeCloseTo(0.5, 5); // Mean of uniform [0,1]
    expect(stats.stdDev).toBeCloseTo(0.3953, 3); // Sample stddev ≈ 0.395
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
  });

  it('computes correct stats for single value', () => {
    const field = new Float32Array([42]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(1);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.mean).toBe(42);
    expect(stats.stdDev).toBe(0); // stddev of single value is 0
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
  });

  it('computes correct stats for identical values', () => {
    const field = new Float32Array([5, 5, 5, 5, 5]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(5);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBe(5);
    expect(stats.stdDev).toBe(0); // No variance
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
  });

  it('handles negative values correctly', () => {
    const field = new Float32Array([-10, -5, 0, 5, 10]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(5);
    expect(stats.min).toBe(-10);
    expect(stats.max).toBe(10);
    expect(stats.mean).toBe(0);
    expect(stats.stdDev).toBeCloseTo(7.906, 3); // Sample stddev
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
  });

  it('filters NaN values from stats but counts them', () => {
    const field = new Float32Array([1, 2, NaN, 4, 5]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(5);
    expect(stats.nanCount).toBe(1);
    expect(stats.infCount).toBe(0);

    // Stats computed from [1, 2, 4, 5] (NaN filtered)
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBe(3); // (1 + 2 + 4 + 5) / 4
    expect(stats.stdDev).toBeCloseTo(1.826, 3); // Sample stddev
  });

  it('filters Infinity values from stats but counts them', () => {
    const field = new Float32Array([1, 2, Infinity, 4, -Infinity]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(5);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(2); // Both +Inf and -Inf

    // Stats computed from [1, 2, 4] (Inf filtered)
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(4);
    expect(stats.mean).toBeCloseTo(2.333, 3);
    expect(stats.stdDev).toBeCloseTo(1.528, 3);
  });

  it('handles field with all NaN values', () => {
    const field = new Float32Array([NaN, NaN, NaN]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(3);
    expect(stats.nanCount).toBe(3);
    expect(stats.infCount).toBe(0);

    // No valid values, stats should be zero
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.stdDev).toBe(0);
  });

  it('handles field with all Infinity values', () => {
    const field = new Float32Array([Infinity, -Infinity, Infinity]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(3);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(3);

    // No valid values, stats should be zero
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.stdDev).toBe(0);
  });

  it('handles large fields efficiently', () => {
    // Performance test: 10,000 elements should compute in <10ms
    const n = 10000;
    const field = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      field[i] = Math.sin(i * 0.1); // Oscillating values
    }

    const start = performance.now();
    const stats = computeFieldStats(field);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10); // <10ms target
    expect(stats.count).toBe(n);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);

    // Sin wave should have mean ≈ 0, min/max ≈ ±1
    expect(stats.mean).toBeCloseTo(0, 1);
    expect(stats.min).toBeCloseTo(-1, 1);
    expect(stats.max).toBeCloseTo(1, 1);
  });

  it('computes correct variance with Welford algorithm', () => {
    // Test Welford's algorithm with moderate values
    const field = new Float32Array([100, 101, 102, 103, 104]);
    const stats = computeFieldStats(field);

    expect(stats.count).toBe(5);
    expect(stats.mean).toBe(102); // Mean of [100, 101, 102, 103, 104]
    expect(stats.stdDev).toBeCloseTo(1.581, 3); // Sample stddev of [0,1,2,3,4]
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(104);
  });
});

describe('isValidField', () => {
  it('returns true for field with no special values', () => {
    const field = new Float32Array([1, 2, 3, 4, 5]);
    const stats = computeFieldStats(field);

    expect(isValidField(stats)).toBe(true);
  });

  it('returns false for field with NaN values', () => {
    const field = new Float32Array([1, 2, NaN, 4, 5]);
    const stats = computeFieldStats(field);

    expect(isValidField(stats)).toBe(false);
  });

  it('returns false for field with Infinity values', () => {
    const field = new Float32Array([1, 2, Infinity, 4, 5]);
    const stats = computeFieldStats(field);

    expect(isValidField(stats)).toBe(false);
  });

  it('returns true for empty field', () => {
    const field = new Float32Array([]);
    const stats = computeFieldStats(field);

    expect(isValidField(stats)).toBe(true);
  });
});

describe('formatFieldStats', () => {
  it('formats empty field stats', () => {
    const field = new Float32Array([]);
    const stats = computeFieldStats(field);
    const formatted = formatFieldStats(stats);

    expect(formatted).toBe('n=0');
  });

  it('formats normal field stats', () => {
    const field = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
    const stats = computeFieldStats(field);
    const formatted = formatFieldStats(stats);

    expect(formatted).toContain('n=5');
    expect(formatted).toContain('min=0.00');
    expect(formatted).toContain('max=1.00');
    expect(formatted).toContain('μ=0.50');
    expect(formatted).toContain('σ=0.40'); // Rounded
  });

  it('formats stats with NaN count', () => {
    const field = new Float32Array([1, 2, NaN, 4, 5]);
    const stats = computeFieldStats(field);
    const formatted = formatFieldStats(stats);

    expect(formatted).toContain('n=5');
    expect(formatted).toContain('NaN=1');
  });

  it('formats stats with Infinity count', () => {
    const field = new Float32Array([1, 2, Infinity, 4, -Infinity]);
    const stats = computeFieldStats(field);
    const formatted = formatFieldStats(stats);

    expect(formatted).toContain('n=5');
    expect(formatted).toContain('Inf=2');
  });

  it('formats stats with all special values', () => {
    const field = new Float32Array([NaN, Infinity, -Infinity]);
    const stats = computeFieldStats(field);
    const formatted = formatFieldStats(stats);

    expect(formatted).toBe('n=3, NaN=1, Inf=2');
    expect(formatted).not.toContain('min=');
    expect(formatted).not.toContain('max=');
  });
});
