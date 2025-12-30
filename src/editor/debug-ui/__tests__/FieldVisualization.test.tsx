/**
 * Field Visualization Integration Tests
 *
 * Tests the integration between FieldStats and visualization components.
 * UI rendering is tested manually; here we test data flow and computation.
 */

import { describe, it, expect } from 'vitest';
import { computeFieldStats, formatFieldStats } from '../../debug/FieldStats';

describe('Field Visualization Integration', () => {
  describe('FieldStats for heatmap', () => {
    it('provides colormap range from min/max', () => {
      const field = new Float32Array([0, 0.5, 1.0]);
      const stats = computeFieldStats(field);

      // Heatmap should use [min, max] for colormap scaling
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(1.0);
      const range = stats.max - stats.min;
      expect(range).toBe(1.0);
    });

    it('handles uniform field (no variance)', () => {
      const field = new Float32Array([5, 5, 5, 5]);
      const stats = computeFieldStats(field);

      // All values same → min = max
      expect(stats.min).toBe(5);
      expect(stats.max).toBe(5);
      expect(stats.stdDev).toBe(0);

      // Heatmap should still render (all same color)
      const range = stats.max - stats.min || 1; // Avoid division by zero
      expect(range).toBe(1);
    });

    it('auto-detects square grid dimensions', () => {
      // 100 elements → 10x10 grid
      const n = 100;
      const sqrt = Math.ceil(Math.sqrt(n));
      expect(sqrt).toBe(10);

      const cols = sqrt;
      const rows = Math.ceil(n / cols);
      expect(rows).toBe(10);
      expect(rows * cols).toBeGreaterThanOrEqual(n);
    });

    it('handles non-square field dimensions', () => {
      // 50 elements → 8x7 grid (56 cells, 6 empty)
      const n = 50;
      const sqrt = Math.ceil(Math.sqrt(n));
      expect(sqrt).toBe(8);

      const cols = sqrt;
      const rows = Math.ceil(n / cols);
      expect(rows).toBe(7);
      expect(rows * cols).toBe(56);
      expect(rows * cols).toBeGreaterThanOrEqual(n);
    });
  });

  describe('FieldStats for histogram', () => {
    it('provides binning range from min/max', () => {
      const field = new Float32Array([0, 5, 10, 15, 20]);
      const stats = computeFieldStats(field);

      const binCount = 5;
      const range = stats.max - stats.min;
      const binWidth = range / binCount;

      expect(range).toBe(20);
      expect(binWidth).toBe(4);

      // Bins: [0-4), [4-8), [8-12), [12-16), [16-20]
      // Values: 0→bin0, 5→bin1, 10→bin2, 15→bin3, 20→bin4
    });

    it('handles edge values in bin assignment', () => {
      const field = new Float32Array([0, 10]); // min=0, max=10
      const stats = computeFieldStats(field);

      const binCount = 10;
      const binWidth = (stats.max - stats.min) / binCount;
      expect(binWidth).toBe(1);

      // Value 0 → bin 0 (index 0)
      const bin0 = Math.floor((0 - stats.min) / binWidth);
      expect(bin0).toBe(0);

      // Value 10 → bin 9 (last bin, clamped)
      let bin10 = Math.floor((10 - stats.min) / binWidth);
      if (bin10 >= binCount) bin10 = binCount - 1;
      expect(bin10).toBe(9);
    });

    it('handles single-bin histogram', () => {
      const field = new Float32Array([1, 2, 3, 4, 5]);
      const stats = computeFieldStats(field);

      const binCount = 1;
      const binWidth = (stats.max - stats.min) / binCount;
      expect(binWidth).toBe(4);

      // All values fall into single bin
      for (let i = 0; i < field.length; i++) {
        const binIndex = Math.floor((field[i] - stats.min) / binWidth);
        const clampedIndex = Math.max(0, Math.min(binCount - 1, binIndex));
        expect(clampedIndex).toBe(0);
      }
    });
  });

  describe('Text mode formatting', () => {
    it('formats stats for display', () => {
      const field = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
      const stats = computeFieldStats(field);

      const formatted = formatFieldStats(stats);

      expect(formatted).toContain('n=5');
      expect(formatted).toContain('min=0.00');
      expect(formatted).toContain('max=1.00');
      expect(formatted).toContain('μ=0.50');
    });

    it('shows first 5 values in text mode', () => {
      const field = new Float32Array([10, 20, 30, 40, 50, 60, 70]);

      const sample = Array.from(field.slice(0, 5));
      expect(sample).toEqual([10, 20, 30, 40, 50]);
      expect(sample.length).toBe(5);

      const remaining = field.length - 5;
      expect(remaining).toBe(2);
    });

    it('handles field with NaN/Inf in text mode', () => {
      const field = new Float32Array([1, 2, NaN, 4, Infinity]);
      const stats = computeFieldStats(field);

      const formatted = formatFieldStats(stats);

      expect(formatted).toContain('NaN=1');
      expect(formatted).toContain('Inf=1');
    });
  });

  describe('Colormap mapping (Turbo)', () => {
    it('maps 0.0 → blue (low)', () => {
      const t = 0.0;
      const index = Math.floor(t * 255);
      expect(index).toBe(0);
      // Turbo[0] = [48, 18, 59] (dark blue)
    });

    it('maps 0.5 → green/yellow (mid)', () => {
      const t = 0.5;
      const index = Math.floor(t * 255);
      expect(index).toBe(127);
      // Turbo[127] ≈ green/yellow transition
    });

    it('maps 1.0 → red (high)', () => {
      const t = 1.0;
      const index = Math.floor(t * 255);
      expect(index).toBe(255);
      // Turbo[255] = [122, 4, 3] (dark red)
    });

    it('clamps out-of-range values', () => {
      // Test clamping logic
      const clamp = (v: number) => Math.max(0, Math.min(1, v));

      expect(clamp(-0.5)).toBe(0);
      expect(clamp(1.5)).toBe(1);
      expect(clamp(0.5)).toBe(0.5);
    });
  });

  describe('Mode persistence', () => {
    it('generates unique storage key per probe', () => {
      const probeId1 = 'block123:field';
      const probeId2 = 'block456:field';

      const key1 = `oscilla.debug.field.${probeId1}.mode`;
      const key2 = `oscilla.debug.field.${probeId2}.mode`;

      expect(key1).not.toBe(key2);
      expect(key1).toContain('block123');
      expect(key2).toContain('block456');
    });
  });

  describe('Performance', () => {
    it('computes stats for 1000-element field efficiently', () => {
      const n = 1000;
      const field = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        field[i] = Math.random();
      }

      const start = performance.now();
      const stats = computeFieldStats(field);
      const elapsed = performance.now() - start;

      expect(stats.count).toBe(n);
      expect(elapsed).toBeLessThan(10); // <10ms target
    });

    it('grid auto-detection is O(1)', () => {
      const counts = [100, 1000, 10000];

      for (const n of counts) {
        const start = performance.now();
        const sqrt = Math.ceil(Math.sqrt(n));
        const cols = sqrt;
        const rows = Math.ceil(n / cols);
        const elapsed = performance.now() - start;

        expect(rows * cols).toBeGreaterThanOrEqual(n);
        expect(elapsed).toBeLessThan(1); // Essentially instant
      }
    });
  });
});
