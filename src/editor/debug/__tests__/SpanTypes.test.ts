/**
 * Tests for SpanTypes
 */

import { describe, it, expect } from 'vitest';
import {
  SpanKind,
  SpanFlags,
  hasFlag,
  setFlag,
  clearFlag,
  getSpanKindName,
} from '../SpanTypes';

describe('SpanTypes', () => {
  describe('SpanKind enum', () => {
    it('has expected kinds defined', () => {
      expect(SpanKind.FrameEval).toBe(1);
      expect(SpanKind.BlockEval).toBe(2);
      expect(SpanKind.BusRead).toBe(3);
      expect(SpanKind.BusCombine).toBe(4);
      expect(SpanKind.BusDefault).toBe(5);
      expect(SpanKind.MaterializeField).toBe(6);
      expect(SpanKind.RenderSinkEval).toBe(7);
      expect(SpanKind.SignalSample).toBe(8);
      expect(SpanKind.AdapterStep).toBe(9);
      expect(SpanKind.LensStep).toBe(10);
    });
  });

  describe('SpanFlags bitfield operations', () => {
    it('hasFlag returns false for None', () => {
      expect(hasFlag(SpanFlags.None, SpanFlags.HAS_NAN)).toBe(false);
      expect(hasFlag(SpanFlags.None, SpanFlags.HAS_INF)).toBe(false);
    });

    it('setFlag sets individual flags', () => {
      let flags: number = SpanFlags.None;
      flags = setFlag(flags, SpanFlags.HAS_NAN);
      expect(hasFlag(flags, SpanFlags.HAS_NAN)).toBe(true);
      expect(hasFlag(flags, SpanFlags.HAS_INF)).toBe(false);
    });

    it('setFlag can set multiple flags', () => {
      let flags: number = SpanFlags.None;
      flags = setFlag(flags, SpanFlags.HAS_NAN);
      flags = setFlag(flags, SpanFlags.HAS_INF);
      expect(hasFlag(flags, SpanFlags.HAS_NAN)).toBe(true);
      expect(hasFlag(flags, SpanFlags.HAS_INF)).toBe(true);
      expect(hasFlag(flags, SpanFlags.CACHE_HIT)).toBe(false);
    });

    it('clearFlag removes specific flags', () => {
      let flags: number = SpanFlags.None;
      flags = setFlag(flags, SpanFlags.HAS_NAN);
      flags = setFlag(flags, SpanFlags.HAS_INF);
      flags = clearFlag(flags, SpanFlags.HAS_NAN);
      expect(hasFlag(flags, SpanFlags.HAS_NAN)).toBe(false);
      expect(hasFlag(flags, SpanFlags.HAS_INF)).toBe(true);
    });

    it('flag bits do not overlap', () => {
      expect(SpanFlags.HAS_NAN).toBe(1);
      expect(SpanFlags.HAS_INF).toBe(2);
      expect(SpanFlags.CACHE_HIT).toBe(4);
      expect(SpanFlags.TYPE_COERCION).toBe(8);
      expect(SpanFlags.AUTO_ADAPTER).toBe(16);
    });
  });

  describe('getSpanKindName', () => {
    it('returns correct names for all kinds', () => {
      expect(getSpanKindName(SpanKind.FrameEval)).toBe('FrameEval');
      expect(getSpanKindName(SpanKind.BlockEval)).toBe('BlockEval');
      expect(getSpanKindName(SpanKind.BusRead)).toBe('BusRead');
      expect(getSpanKindName(SpanKind.BusCombine)).toBe('BusCombine');
      expect(getSpanKindName(SpanKind.BusDefault)).toBe('BusDefault');
      expect(getSpanKindName(SpanKind.MaterializeField)).toBe('MaterializeField');
      expect(getSpanKindName(SpanKind.RenderSinkEval)).toBe('RenderSinkEval');
      expect(getSpanKindName(SpanKind.SignalSample)).toBe('SignalSample');
      expect(getSpanKindName(SpanKind.AdapterStep)).toBe('AdapterStep');
      expect(getSpanKindName(SpanKind.LensStep)).toBe('LensStep');
    });

    it('handles unknown kinds gracefully', () => {
      expect(getSpanKindName(999 as SpanKind)).toMatch(/Unknown\(999\)/);
    });
  });
});
