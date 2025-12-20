/**
 * ColorLFO Block Tests
 */

import { describe, it, expect } from 'vitest';
import { ColorLFOBlock } from '../ColorLFO';
import type { RuntimeCtx, GeometryCache } from '../../../types';

const mockCtx: RuntimeCtx = {
  viewport: { w: 800, h: 600, dpr: 1 },
};

const mockGeom: GeometryCache = {
  get: <K extends object, V>(_key: K, compute: () => V): V => compute(),
  invalidate: () => {},
};

describe('ColorLFOBlock', () => {
  it('should compile with valid phase input', () => {
    const phaseSignal = (t: number) => (t / 1000) % 1; // Simple phase function

    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {
        base: '#3B82F6',
        hueSpan: 180,
        sat: 0.8,
        light: 0.5,
      },
      inputs: {
        phase: { kind: 'Signal:phase', value: phaseSignal },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    expect(result.color).toBeDefined();
    expect(result.color.kind).toBe('Signal:color');
  });

  it('should produce valid hex colors', () => {
    const phaseSignal = (_t: number) => 0.5; // Fixed phase

    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {
        base: '#FF0000', // Red
        hueSpan: 360,
        sat: 1.0,
        light: 0.5,
      },
      inputs: {
        phase: { kind: 'Signal:phase', value: phaseSignal },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    if (result.color.kind !== 'Signal:color') {
      throw new Error('Expected Signal:color');
    }

    const colorFn = result.color.value as (t: number, ctx: RuntimeCtx) => string;
    const color = colorFn(500, mockCtx);

    // Should be a valid hex color
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('should rotate hue based on phase', () => {
    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {
        base: '#FF0000', // Red (hue = 0)
        hueSpan: 120,
        sat: 1.0,
        light: 0.5,
      },
      inputs: {
        phase: { kind: 'Signal:phase', value: (t: number) => t / 1000 },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    if (result.color.kind !== 'Signal:color') {
      throw new Error('Expected Signal:color');
    }

    const colorFn = result.color.value as (t: number, ctx: RuntimeCtx) => string;

    // At phase 0, should be near red
    const color0 = colorFn(0, mockCtx);
    expect(color0).toBeDefined();

    // At phase 0.5, hue should be rotated by 60 degrees
    const color500 = colorFn(500, mockCtx);
    expect(color500).toBeDefined();
    expect(color500).not.toBe(color0);

    // At phase 1, hue should be rotated by 120 degrees
    const color1000 = colorFn(1000, mockCtx);
    expect(color1000).toBeDefined();
    expect(color1000).not.toBe(color0);
    expect(color1000).not.toBe(color500);
  });

  it('should handle missing phase input', () => {
    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {},
      inputs: {},
      ctx: { env: {}, geom: mockGeom },
    });

    expect(result.color.kind).toBe('Error');
  });

  it('should use default parameters', () => {
    const phaseSignal = (_t: number) => 0;

    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {}, // No params specified
      inputs: {
        phase: { kind: 'Signal:phase', value: phaseSignal },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    expect(result.color.kind).toBe('Signal:color');

    if (result.color.kind !== 'Signal:color') {
      throw new Error('Expected Signal:color');
    }

    const colorFn = result.color.value as (t: number, ctx: RuntimeCtx) => string;
    const color = colorFn(0, mockCtx);

    // Should produce a valid hex color with defaults
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
