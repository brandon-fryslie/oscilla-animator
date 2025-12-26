/**
 * Tests for SpanRing
 */

import { describe, it, expect } from 'vitest';
import { SpanRing, DEFAULT_SPAN_CAPACITY } from '../SpanRing';
import { SpanKind, SpanFlags } from '../SpanTypes';
import type { SpanData } from '../SpanTypes';

describe('SpanRing', () => {
  describe('Basic operations', () => {
    it('initializes with default capacity', () => {
      const ring = new SpanRing();
      expect(ring.getCapacity()).toBe(DEFAULT_SPAN_CAPACITY);
      expect(ring.size()).toBe(0);
      expect(ring.getWritePtr()).toBe(0);
    });

    it('initializes with custom capacity', () => {
      const ring = new SpanRing(1000);
      expect(ring.getCapacity()).toBe(1000);
    });

    it('writes a single span', () => {
      const ring = new SpanRing(100);
      const span: SpanData = {
        frameId: 1,
        tMs: 16.67,
        kind: SpanKind.BlockEval,
        subjectId: 42,
        parentSpanId: 0,
        durationUs: 125,
        flags: SpanFlags.None,
      };

      const idx = ring.writeSpan(span);
      expect(idx).toBe(0);
      expect(ring.size()).toBe(1);
      expect(ring.getWritePtr()).toBe(1);
    });

    it('retrieves written span correctly', () => {
      const ring = new SpanRing(100);
      const span: SpanData = {
        frameId: 10,
        tMs: 100.5,
        kind: SpanKind.BusCombine,
        subjectId: 7,
        parentSpanId: 2,
        durationUs: 250,
        flags: SpanFlags.HAS_NAN,
      };

      const idx = ring.writeSpan(span);
      const retrieved = ring.getSpan(idx);

      expect(retrieved).toEqual(span);
    });
  });

  describe('Ring wrapping behavior', () => {
    it('wraps at capacity without allocations', () => {
      const capacity = 10;
      const ring = new SpanRing(capacity);

      // Write more than capacity
      for (let i = 0; i < 15; i++) {
        ring.writeSpan({
          frameId: i,
          tMs: i * 16.67,
          kind: SpanKind.FrameEval,
          subjectId: 0,
          parentSpanId: 0,
          durationUs: 1000,
          flags: SpanFlags.None,
        });
      }

      expect(ring.getWritePtr()).toBe(15); // Total writes
      expect(ring.size()).toBe(capacity); // Only capacity items retained
    });

    it('overwrites oldest spans when full', () => {
      const capacity = 5;
      const ring = new SpanRing(capacity);

      // Write 5 spans
      for (let i = 0; i < capacity; i++) {
        ring.writeSpan({
          frameId: i,
          tMs: i * 10,
          kind: SpanKind.BlockEval,
          subjectId: i,
          parentSpanId: 0,
          durationUs: 100,
          flags: SpanFlags.None,
        });
      }

      // Write 5 more (should overwrite first 5)
      for (let i = capacity; i < capacity * 2; i++) {
        ring.writeSpan({
          frameId: i,
          tMs: i * 10,
          kind: SpanKind.BlockEval,
          subjectId: i,
          parentSpanId: 0,
          durationUs: 100,
          flags: SpanFlags.None,
        });
      }

      // First 5 should be overwritten (undefined)
      expect(ring.getSpan(0)).toBeUndefined();
      expect(ring.getSpan(4)).toBeUndefined();

      // Last 5 should be valid
      const span5 = ring.getSpan(5);
      expect(span5).not.toBeUndefined();
      expect(span5!.subjectId).toBe(5);

      const span9 = ring.getSpan(9);
      expect(span9).not.toBeUndefined();
      expect(span9!.subjectId).toBe(9);
    });
  });

  describe('Query API', () => {
    it('getSpansForFrame returns all spans for a frame', () => {
      const ring = new SpanRing(100);

      // Write spans for different frames
      ring.writeSpan({ frameId: 1, tMs: 10, kind: SpanKind.BlockEval, subjectId: 1, parentSpanId: 0, durationUs: 100, flags: SpanFlags.None });
      ring.writeSpan({ frameId: 1, tMs: 11, kind: SpanKind.BlockEval, subjectId: 2, parentSpanId: 0, durationUs: 100, flags: SpanFlags.None });
      ring.writeSpan({ frameId: 2, tMs: 20, kind: SpanKind.BlockEval, subjectId: 3, parentSpanId: 0, durationUs: 100, flags: SpanFlags.None });
      ring.writeSpan({ frameId: 1, tMs: 12, kind: SpanKind.BusCombine, subjectId: 4, parentSpanId: 0, durationUs: 100, flags: SpanFlags.None });

      const frame1Spans = ring.getSpansForFrame(1);
      expect(frame1Spans.length).toBe(3);
      expect(frame1Spans.every(s => s.frameId === 1)).toBe(true);

      const frame2Spans = ring.getSpansForFrame(2);
      expect(frame2Spans.length).toBe(1);
      expect(frame2Spans[0].subjectId).toBe(3);
    });

    it('getSpansInRange returns correct slice', () => {
      const ring = new SpanRing(100);

      // Write 10 spans
      for (let i = 0; i < 10; i++) {
        ring.writeSpan({
          frameId: i,
          tMs: i * 10,
          kind: SpanKind.BlockEval,
          subjectId: i,
          parentSpanId: 0,
          durationUs: 100,
          flags: SpanFlags.None,
        });
      }

      const slice = ring.getSpansInRange(3, 4);
      expect(slice.length).toBe(4);
      expect(slice[0].subjectId).toBe(3);
      expect(slice[1].subjectId).toBe(4);
      expect(slice[2].subjectId).toBe(5);
      expect(slice[3].subjectId).toBe(6);
    });

    it('handles out-of-range queries gracefully', () => {
      const ring = new SpanRing(10);

      ring.writeSpan({ frameId: 0, tMs: 0, kind: SpanKind.FrameEval, subjectId: 0, parentSpanId: 0, durationUs: 100, flags: SpanFlags.None });

      expect(ring.getSpan(999)).toBeUndefined();
      expect(ring.getSpansInRange(10, 5)).toEqual([]);
    });
  });

  describe('Performance requirements', () => {
    it('writes 10k spans in <10ms', () => {
      const ring = new SpanRing(20000);
      const span: SpanData = {
        frameId: 0,
        tMs: 0,
        kind: SpanKind.BlockEval,
        subjectId: 0,
        parentSpanId: 0,
        durationUs: 100,
        flags: SpanFlags.None,
      };

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        ring.writeSpan(span);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10); // <10ms for 10k writes (reasonable for real-world)
    });
  });

  describe('clear operation', () => {
    it('resets write pointer', () => {
      const ring = new SpanRing(100);

      for (let i = 0; i < 50; i++) {
        ring.writeSpan({
          frameId: i,
          tMs: i * 10,
          kind: SpanKind.BlockEval,
          subjectId: i,
          parentSpanId: 0,
          durationUs: 100,
          flags: SpanFlags.None,
        });
      }

      expect(ring.size()).toBe(50);

      ring.clear();

      expect(ring.size()).toBe(0);
      expect(ring.getWritePtr()).toBe(0);
    });
  });

  describe('SpanFlags handling', () => {
    it('preserves flags in written spans', () => {
      const ring = new SpanRing(10);

      const spanWithFlags: SpanData = {
        frameId: 0,
        tMs: 0,
        kind: SpanKind.BlockEval,
        subjectId: 0,
        parentSpanId: 0,
        durationUs: 100,
        flags: SpanFlags.HAS_NAN | SpanFlags.HAS_INF,
      };

      const idx = ring.writeSpan(spanWithFlags);
      const retrieved = ring.getSpan(idx);

      expect(retrieved!.flags).toBe(SpanFlags.HAS_NAN | SpanFlags.HAS_INF);
    });
  });
});
