/**
 * Tests for SignalGraph component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalHistoryBuffer } from '../../debug/SignalHistoryBuffer';

describe('SignalGraph', () => {
  // Mock HTMLCanvasElement.getContext for tests
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      translate: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      // Add required properties
      canvas: null,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      font: '',
      textAlign: 'start' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
    })) as any;
  });

  describe('SignalHistoryBuffer integration', () => {
    it('works with empty buffer', () => {
      const buffer = new SignalHistoryBuffer(100);
      expect(buffer.size()).toBe(0);
      expect(buffer.getSamples()).toEqual([]);
    });

    it('works with sine wave data', () => {
      const buffer = new SignalHistoryBuffer(100);

      // Add sine wave samples
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const value = Math.sin(t * Math.PI * 2);
        buffer.addSample(t, value);
      }

      expect(buffer.size()).toBe(60);
      const samples = buffer.getSamples();
      expect(samples.length).toBe(60);
      expect(samples[0].value).toBeCloseTo(0, 2);
    });

    it('auto-scales Y-axis for varying data', () => {
      const buffer = new SignalHistoryBuffer(100);

      // Add samples with different ranges
      buffer.addSample(0.0, -10);
      buffer.addSample(0.1, 50);
      buffer.addSample(0.2, 20);

      const bounds = buffer.getBounds();

      // Bounds should include range with padding
      expect(bounds.min).toBeLessThan(-10);
      expect(bounds.max).toBeGreaterThan(50);
    });

    it('handles step function correctly', () => {
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

      // Verify step is present
      expect(samples[9].value).toBe(0);
      expect(samples[10].value).toBe(1);
    });

    it('handles time range queries', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(1.0, 10);
      buffer.addSample(2.5, 20);
      buffer.addSample(4.0, 30);

      const range = buffer.getTimeRange();
      expect(range).not.toBeNull();
      expect(range!.start).toBe(1.0);
      expect(range!.end).toBe(4.0);
    });
  });

  describe('Rendering logic', () => {
    it('handles large datasets efficiently', () => {
      const buffer = new SignalHistoryBuffer(1000);

      const start = performance.now();
      // Add 1000 samples
      for (let i = 0; i < 1000; i++) {
        buffer.addSample(i * 0.016, Math.sin(i * 0.1));
      }
      const elapsed = performance.now() - start;

      expect(buffer.size()).toBe(1000);
      // Should be fast (<100ms)
      expect(elapsed).toBeLessThan(100);
    });

    it('samples have correct structure for rendering', () => {
      const buffer = new SignalHistoryBuffer(100);

      buffer.addSample(0.0, 1.0);
      buffer.addSample(0.1, 2.0);

      const samples = buffer.getSamples();
      expect(samples[0]).toHaveProperty('t');
      expect(samples[0]).toHaveProperty('value');
      expect(samples[0].t).toBe(0.0);
      expect(samples[0].value).toBe(1.0);
    });
  });
});
