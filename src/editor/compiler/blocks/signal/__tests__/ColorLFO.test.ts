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
    const phaseSignal = (_t: number): number => (_t / 1000) % 1; // Simple phase function

    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {},
      inputs: {
        phase: { kind: 'Signal:phase', value: phaseSignal },
        base: { kind: 'Scalar:color', value: '#3B82F6' },
        hueSpan: { kind: 'Scalar:number', value: 180 },
        sat: { kind: 'Scalar:number', value: 0.8 },
        light: { kind: 'Scalar:number', value: 0.5 },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    expect(result.color).toBeDefined();
    expect(result.color.kind).toBe('Signal:color');
  });

  it('should produce valid hex colors', () => {
    const phaseSignal = (_t: number): number => 0.5; // Fixed phase

    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {},
      inputs: {
        phase: { kind: 'Signal:phase', value: phaseSignal },
        base: { kind: 'Scalar:color', value: '#FF0000' }, // Red
        hueSpan: { kind: 'Scalar:number', value: 360 },
        sat: { kind: 'Scalar:number', value: 1.0 },
        light: { kind: 'Scalar:number', value: 0.5 },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    if (result.color.kind !== 'Signal:color') {
      throw new Error('Expected Signal:color');
    }

    const colorFn = result.color.value as (_t: number, _ctx: RuntimeCtx) => string;
    const color = colorFn(500, mockCtx);

    // Should be a valid hex color
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('should rotate hue based on phase', () => {
    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {},
      inputs: {
        phase: { kind: 'Signal:phase', value: (t: number): number => t / 1000 },
        base: { kind: 'Scalar:color', value: '#FF0000' }, // Red (hue = 0)
        hueSpan: { kind: 'Scalar:number', value: 120 },
        sat: { kind: 'Scalar:number', value: 1.0 },
        light: { kind: 'Scalar:number', value: 0.5 },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    if (result.color.kind !== 'Signal:color') {
      throw new Error('Expected Signal:color');
    }

    const colorFn = result.color.value as (_t: number, _ctx: RuntimeCtx) => string;

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
      inputs: {
        base: { kind: 'Scalar:color', value: '#3B82F6' },
        hueSpan: { kind: 'Scalar:number', value: 180 },
        sat: { kind: 'Scalar:number', value: 0.8 },
        light: { kind: 'Scalar:number', value: 0.5 },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    expect(result.color.kind).toBe('Error');
  });

  it('should use default parameters', () => {
    const phaseSignal = (_t: number): number => 0;

    // Even with "default" params, we must provide values through inputs
    const result = ColorLFOBlock.compile({
      id: 'test-color-lfo',
      params: {},
      inputs: {
        phase: { kind: 'Signal:phase', value: phaseSignal },
        base: { kind: 'Scalar:color', value: '#3B82F6' },
        hueSpan: { kind: 'Scalar:number', value: 180 },
        sat: { kind: 'Scalar:number', value: 80 },
        light: { kind: 'Scalar:number', value: 50 },
      },
      ctx: { env: {}, geom: mockGeom },
    });

    expect(result.color.kind).toBe('Signal:color');

    if (result.color.kind !== 'Signal:color') {
      throw new Error('Expected Signal:color');
    }

    const colorFn = result.color.value as (_t: number, _ctx: RuntimeCtx) => string;
    const color = colorFn(0, mockCtx);

    // Should produce a valid hex color with defaults
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
