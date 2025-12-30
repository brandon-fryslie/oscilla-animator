/**
 * Tests for SignalHistoryBuffer
 */

import { describe, it, expect } from 'vitest';
import { SignalHistoryBuffer, DEFAULT_HISTORY_CAPACITY } from '../SignalHistoryBuffer';

describe('SignalHistoryBuffer', () => {
  describe('Basic operations', () => {
    it('initializes with default capacity', () => {
      const buffer = new SignalHistoryBuffer();
      expect(buffer.getCapacity()).toBe(DEFAULT_HISTORY_CAPACITY);
      expect(buffer.size()).toBe(0);
    });

    it('initializes with custom capacity', () => {
      const buffer = new SignalHistoryBuffer(500);
      expect(buffer.getCapacity()).toBe(500);
    });

    it('adds a single sample', () => {
      const buffer = new SignalHistoryBuffer(100);
      const idx = buffer.addSample(0.5, 42.0);

      expect(idx).toBe(0);
      expect(buffer.size()).toBe(1);
    });

    it('retrieves samples correctly', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(0.0, 10.0);
      buffer.addSample(0.1, 20.0);
      buffer.addSample(0.2, 30.0);

      const samples = buffer.getSamples();
      expect(samples.length).toBe(3);
      expect(samples[0]).toEqual({ t: 0.0, value: 10.0 });
      expect(samples[1]).toEqual({ t: 0.1, value: 20.0 });
      expect(samples[2]).toEqual({ t: 0.2, value: 30.0 });
    });

    it('retrieves most recent N samples', () => {
      const buffer = new SignalHistoryBuffer(100);

      for (let i = 0; i < 10; i++) {
        buffer.addSample(i * 0.1, i * 10);
      }

      const recent = buffer.getSamples(3);
      expect(recent.length).toBe(3);
      expect(recent[0].value).toBe(70); // i=7
      expect(recent[1].value).toBe(80); // i=8
      expect(recent[2].value).toBe(90); // i=9
    });
  });

  describe('Ring wrapping behavior', () => {
    it('wraps at capacity without error', () => {
      const capacity = 10;
      const buffer = new SignalHistoryBuffer(capacity);

      // Write more than capacity
      for (let i = 0; i < 15; i++) {
        buffer.addSample(i * 0.1, i);
      }

      expect(buffer.size()).toBe(capacity); // Only capacity items retained
    });

    it('sample 1001 overwrites sample 1 in 1000-capacity buffer', () => {
      const capacity = 1000;
      const buffer = new SignalHistoryBuffer(capacity);

      // Write exactly capacity samples
      for (let i = 0; i < capacity; i++) {
        buffer.addSample(i, i);
      }

      // Verify first sample exists
      const before = buffer.getSamples();
      expect(before[0].value).toBe(0);

      // Write one more sample (should overwrite first)
      buffer.addSample(capacity, capacity);

      // Now oldest sample should be #1 (not #0)
      const after = buffer.getSamples();
      expect(after[0].value).toBe(1); // Sample 0 was overwritten
      expect(after[after.length - 1].value).toBe(capacity); // New sample at end
    });

    it('maintains chronological order after wrap', () => {
      const capacity = 5;
      const buffer = new SignalHistoryBuffer(capacity);

      // Write 8 samples (wraps after 5)
      for (let i = 0; i < 8; i++) {
        buffer.addSample(i * 0.1, i);
      }

      const samples = buffer.getSamples();
      expect(samples.length).toBe(5);

      // Should contain samples 3, 4, 5, 6, 7 in order
      expect(samples[0].value).toBe(3);
      expect(samples[1].value).toBe(4);
      expect(samples[2].value).toBe(5);
      expect(samples[3].value).toBe(6);
      expect(samples[4].value).toBe(7);
    });
  });

  describe('Auto-scaling bounds', () => {
    it('tracks min/max on initial samples', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(0.0, 10.0);
      buffer.addSample(0.1, -5.0);
      buffer.addSample(0.2, 20.0);

      const bounds = buffer.getBounds();
      // Should have padding (10% of range)
      expect(bounds.min).toBeLessThan(-5.0);
      expect(bounds.max).toBeGreaterThan(20.0);
    });

    it('updates min/max on new extremes', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(0.0, 10.0);
      const bounds1 = buffer.getBounds();

      buffer.addSample(0.1, -50.0); // New minimum
      const bounds2 = buffer.getBounds();

      expect(bounds2.min).toBeLessThan(bounds1.min);
    });

    it('recalculates bounds after ring wrap', () => {
      const capacity = 5;
      const buffer = new SignalHistoryBuffer(capacity);

      // Add samples with a peak at the start
      buffer.addSample(0.0, 100.0); // Peak (will be overwritten)
      buffer.addSample(0.1, 10.0);
      buffer.addSample(0.2, 10.0);
      buffer.addSample(0.3, 10.0);
      buffer.addSample(0.4, 10.0);

      const beforeWrap = buffer.getBounds();
      expect(beforeWrap.max).toBeGreaterThan(50); // Includes peak

      // Wrap by adding one more sample
      buffer.addSample(0.5, 10.0); // Overwrites peak at index 0

      const afterWrap = buffer.getBounds();
      // Peak should be gone from bounds
      expect(afterWrap.max).toBeLessThan(beforeWrap.max);
    });

    it('handles constant value with padding', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(0.0, 5.0);
      buffer.addSample(0.1, 5.0);
      buffer.addSample(0.2, 5.0);

      const bounds = buffer.getBounds();
      // Should add padding even for constant value
      expect(bounds.min).toBeLessThan(5.0);
      expect(bounds.max).toBeGreaterThan(5.0);
    });

    it('handles empty buffer gracefully', () => {
      const buffer = new SignalHistoryBuffer(100);
      const bounds = buffer.getBounds();

      expect(bounds.min).toBeDefined();
      expect(bounds.max).toBeDefined();
      expect(bounds.max).toBeGreaterThan(bounds.min);
    });
  });

  describe('Time range queries', () => {
    it('returns null for empty buffer', () => {
      const buffer = new SignalHistoryBuffer(100);
      expect(buffer.getTimeRange()).toBeNull();
    });

    it('returns correct time range for samples', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(1.0, 10);
      buffer.addSample(2.5, 20);
      buffer.addSample(4.0, 30);

      const range = buffer.getTimeRange();
      expect(range).not.toBeNull();
      expect(range!.start).toBe(1.0);
      expect(range!.end).toBe(4.0);
    });

    it('updates time range after wrap', () => {
      const capacity = 3;
      const buffer = new SignalHistoryBuffer(capacity);

      buffer.addSample(1.0, 10);
      buffer.addSample(2.0, 20);
      buffer.addSample(3.0, 30);
      buffer.addSample(4.0, 40); // Wraps, oldest sample (t=1.0) gone

      const range = buffer.getTimeRange();
      expect(range!.start).toBe(2.0); // Oldest remaining sample
      expect(range!.end).toBe(4.0);
    });
  });

  describe('Clear operation', () => {
    it('resets buffer to initial state', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(1.0, 10);
      buffer.addSample(2.0, 20);

      expect(buffer.size()).toBe(2);

      buffer.clear();

      expect(buffer.size()).toBe(0);
      expect(buffer.getTimeRange()).toBeNull();
    });

    it('resets bounds after clear', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(0.0, 100.0);
      const beforeClear = buffer.getBounds();
      expect(beforeClear.max).toBeGreaterThan(50);

      buffer.clear();

      const afterClear = buffer.getBounds();
      // Should return default range
      expect(afterClear.min).toBeDefined();
      expect(afterClear.max).toBeDefined();
    });
  });

  describe('Performance characteristics', () => {
    it('handles large capacity efficiently', () => {
      const buffer = new SignalHistoryBuffer(10000);

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        buffer.addSample(i * 0.016, Math.sin(i * 0.1));
      }
      const elapsed = performance.now() - start;

      // Should complete in <100ms (typical: <10ms)
      expect(elapsed).toBeLessThan(100);
    });

    it('getSamples is efficient for large buffers', () => {
      const buffer = new SignalHistoryBuffer(10000);

      for (let i = 0; i < 10000; i++) {
        buffer.addSample(i * 0.016, Math.sin(i * 0.1));
      }

      const start = performance.now();
      const samples = buffer.getSamples(1000);
      const elapsed = performance.now() - start;

      expect(samples.length).toBe(1000);
      expect(elapsed).toBeLessThan(10); // Should be <10ms
    });
  });

  describe('Real-world scenarios', () => {
    it('handles sine wave correctly', () => {
      const buffer = new SignalHistoryBuffer(1000);

      // Simulate 1 second of sine wave at 60fps
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const value = Math.sin(t * Math.PI * 2); // 1Hz sine
        buffer.addSample(t, value);
      }

      const bounds = buffer.getBounds();
      // Sine wave should be roughly [-1, 1] with padding
      expect(bounds.min).toBeLessThan(-0.9);
      expect(bounds.max).toBeGreaterThan(0.9);
    });

    it('handles step function', () => {
      const buffer = new SignalHistoryBuffer(100);

      // Step from 0 to 1
      for (let i = 0; i < 10; i++) {
        buffer.addSample(i * 0.1, 0);
      }
      for (let i = 10; i < 20; i++) {
        buffer.addSample(i * 0.1, 1);
      }

      const samples = buffer.getSamples();
      expect(samples.length).toBe(20);

      // Verify step transition
      expect(samples[9].value).toBe(0);
      expect(samples[10].value).toBe(1);
    });
  });
});
