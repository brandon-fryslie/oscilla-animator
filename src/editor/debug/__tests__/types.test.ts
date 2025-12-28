/**
 * Tests for debug/types.ts
 *
 * Tests the value summarization and formatting functions.
 */

import { describe, it, expect } from 'vitest';
import { summarize, formatValueSummary, getNumericValue, createProbeId } from '../types';
import type { ProbeTarget } from '../types';

describe('summarize', () => {
  describe('null/undefined handling', () => {
    it('returns none for null', () => {
      expect(summarize('Signal:number', null)).toEqual({ t: 'none' });
    });

    it('returns none for undefined', () => {
      expect(summarize('Signal:number', undefined)).toEqual({ t: 'none' });
    });
  });

  describe('Signal:phase', () => {
    it('summarizes phase value', () => {
      expect(summarize('Signal:phase', 0.5)).toEqual({ t: 'phase', v: 0.5 });
    });

    it('returns error for NaN', () => {
      expect(summarize('Signal:phase', NaN)).toEqual({ t: 'err', code: 'nan' });
    });

    it('returns error for Infinity', () => {
      expect(summarize('Signal:phase', Infinity)).toEqual({ t: 'err', code: 'inf' });
    });

    it('returns error for negative Infinity', () => {
      expect(summarize('Signal:phase', -Infinity)).toEqual({ t: 'err', code: 'inf' });
    });
  });

  describe('Signal:number', () => {
    it('summarizes number value', () => {
      expect(summarize('Signal:number', 42)).toEqual({ t: 'num', v: 42 });
    });

    it('returns error for NaN', () => {
      expect(summarize('Signal:number', NaN)).toEqual({ t: 'err', code: 'nan' });
    });
  });

  describe('Signal:Time', () => {
    it('summarizes time value as number', () => {
      expect(summarize('Signal:Time', 1000)).toEqual({ t: 'num', v: 1000 });
    });
  });

  describe('Signal:bool', () => {
    it('summarizes true', () => {
      expect(summarize('Signal:bool', true)).toEqual({ t: 'bool', v: true });
    });

    it('summarizes false', () => {
      expect(summarize('Signal:bool', false)).toEqual({ t: 'bool', v: false });
    });

    it('coerces truthy values', () => {
      expect(summarize('Signal:bool', 1)).toEqual({ t: 'bool', v: true });
    });

    it('coerces falsy values', () => {
      expect(summarize('Signal:bool', 0)).toEqual({ t: 'bool', v: false });
    });
  });

  describe('Event', () => {
    it('summarizes fired event', () => {
      expect(summarize('Event', true)).toEqual({ t: 'trigger', fired: true });
    });

    it('summarizes idle event', () => {
      expect(summarize('Event', false)).toEqual({ t: 'trigger', fired: false });
    });
  });

  describe('Field types', () => {
    it('returns none for Field:number', () => {
      expect(summarize('Field:number', [1, 2, 3])).toEqual({ t: 'none' });
    });

    it('returns none for Field:color', () => {
      expect(summarize('Field:color', [[1, 0, 0]])).toEqual({ t: 'none' });
    });
  });

  describe('Signal:color', () => {
    it('packs RGBA color as u32', () => {
      const result = summarize('Signal:color', [1, 0, 0, 1]);
      expect(result.t).toBe('color');
      // Red (255) shifted left 24 bits, green 0, blue 0, alpha 255
      // 0xFF000000 | 0x000000 | 0x0000 | 0xFF = 0xFF0000FF
      expect((result as { t: 'color'; v: number }).v).toBe(0xFF0000FF >>> 0);
    });

    it('handles default alpha of 1', () => {
      const result = summarize('Signal:color', [1, 1, 1]);
      expect(result.t).toBe('color');
      // White: 0xFFFFFFFF
      expect((result as { t: 'color'; v: number }).v).toBe(0xFFFFFFFF >>> 0);
    });
  });

  describe('Signal:vec2', () => {
    it('summarizes vec2 object', () => {
      expect(summarize('Signal:vec2', { x: 10, y: 20 })).toEqual({ t: 'vec2', x: 10, y: 20 });
    });

    it('defaults missing x to 0', () => {
      expect(summarize('Signal:vec2', { y: 20 })).toEqual({ t: 'vec2', x: 0, y: 20 });
    });

    it('defaults missing y to 0', () => {
      expect(summarize('Signal:vec2', { x: 10 })).toEqual({ t: 'vec2', x: 10, y: 0 });
    });
  });

  describe('default handling', () => {
    it('extracts number from unknown kind', () => {
      expect(summarize('UnknownKind', 123)).toEqual({ t: 'num', v: 123 });
    });

    it('returns none for non-numeric unknown type', () => {
      expect(summarize('UnknownKind', 'string')).toEqual({ t: 'none' });
    });
  });
});

describe('formatValueSummary', () => {
  it('formats number with 4 decimal places', () => {
    expect(formatValueSummary({ t: 'num', v: 3.14159 })).toBe('3.1416');
  });

  it('formats phase as percentage', () => {
    expect(formatValueSummary({ t: 'phase', v: 0.5 })).toBe('50.0%');
  });

  it('formats true boolean', () => {
    expect(formatValueSummary({ t: 'bool', v: true })).toBe('true');
  });

  it('formats false boolean', () => {
    expect(formatValueSummary({ t: 'bool', v: false })).toBe('false');
  });

  it('formats color as hex', () => {
    // Red: 0xFF0000FF (RGBA packed)
    expect(formatValueSummary({ t: 'color', v: 0xFF0000FF })).toBe('#ff0000');
  });

  it('formats vec2', () => {
    expect(formatValueSummary({ t: 'vec2', x: 1.5, y: 2.5 })).toBe('(1.50, 2.50)');
  });

  it('formats fired trigger', () => {
    expect(formatValueSummary({ t: 'trigger', fired: true })).toBe('fired');
  });

  it('formats idle trigger', () => {
    expect(formatValueSummary({ t: 'trigger', fired: false })).toBe('idle');
  });

  it('formats none as dash', () => {
    expect(formatValueSummary({ t: 'none' })).toBe('—');
  });

  it('formats nan error', () => {
    expect(formatValueSummary({ t: 'err', code: 'nan' })).toBe('NaN');
  });

  it('formats inf error', () => {
    expect(formatValueSummary({ t: 'err', code: 'inf' })).toBe('∞');
  });

  it('formats unknown error', () => {
    expect(formatValueSummary({ t: 'err', code: 'unknown' })).toBe('?');
  });
});

describe('getNumericValue', () => {
  it('returns number value', () => {
    expect(getNumericValue({ t: 'num', v: 42 })).toBe(42);
  });

  it('returns phase value', () => {
    expect(getNumericValue({ t: 'phase', v: 0.75 })).toBe(0.75);
  });

  it('returns 1 for true boolean', () => {
    expect(getNumericValue({ t: 'bool', v: true })).toBe(1);
  });

  it('returns 0 for false boolean', () => {
    expect(getNumericValue({ t: 'bool', v: false })).toBe(0);
  });

  it('returns 1 for fired trigger', () => {
    expect(getNumericValue({ t: 'trigger', fired: true })).toBe(1);
  });

  it('returns 0 for idle trigger', () => {
    expect(getNumericValue({ t: 'trigger', fired: false })).toBe(0);
  });

  it('returns null for color', () => {
    expect(getNumericValue({ t: 'color', v: 0xFF0000FF })).toBe(null);
  });

  it('returns null for vec2', () => {
    expect(getNumericValue({ t: 'vec2', x: 1, y: 2 })).toBe(null);
  });

  it('returns null for none', () => {
    expect(getNumericValue({ t: 'none' })).toBe(null);
  });

  it('returns null for error', () => {
    expect(getNumericValue({ t: 'err', code: 'nan' })).toBe(null);
  });
});

describe('createProbeId', () => {
  it('creates block probe ID', () => {
    const target: ProbeTarget = { kind: 'block', blockId: 'block_123' };
    expect(createProbeId(target)).toBe('probe:block:block_123');
  });

  it('creates bus probe ID', () => {
    const target: ProbeTarget = { kind: 'bus', busId: 'bus_456' };
    expect(createProbeId(target)).toBe('probe:bus:bus_456');
  });

  it('creates publish binding probe ID', () => {
    const target: ProbeTarget = { kind: 'binding', bindingId: 'pub_789', direction: 'publish' };
    expect(createProbeId(target)).toBe('probe:binding:pub_789:publish');
  });

  it('creates subscribe binding probe ID', () => {
    const target: ProbeTarget = { kind: 'binding', bindingId: 'sub_012', direction: 'subscribe' };
    expect(createProbeId(target)).toBe('probe:binding:sub_012:subscribe');
  });
});
