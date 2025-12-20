/**
 * @file TimeRoot.test.ts - Tests for TimeRoot block compilers
 * @description Tests the three TimeRoot block types that define time topology.
 */

import { describe, it, expect } from 'vitest';
import type { CompileCtx, RuntimeCtx, GeometryCache } from '../../../types';
import {
  FiniteTimeRootBlock,
  CycleTimeRootBlock,
  InfiniteTimeRootBlock,
} from '../TimeRoot';

// Mock RuntimeCtx for testing signal evaluation
const mockRuntimeCtx: RuntimeCtx = {
  viewport: { w: 800, h: 600, dpr: 1 },
};

// Mock GeometryCache for CompileCtx
const mockGeom: GeometryCache = {
  get: <K extends object, V>(_key: K, compute: () => V) => compute(),
  invalidate: () => {},
};

// Mock CompileCtx
const mockCompileCtx: CompileCtx = {
  env: {},
  geom: mockGeom,
};

// Helper to extract signal function from compiled output
// Cast through unknown to handle the complex Artifact union type
function getSignalValue<T>(
  artifact: unknown,
  expectedKind: string
): (t: number, ctx: RuntimeCtx) => T {
  const art = artifact as { kind: string; value: unknown };
  expect(art.kind).toBe(expectedKind);
  return art.value as (t: number, ctx: RuntimeCtx) => T;
}

describe('TimeRoot Block Compilers', () => {
  describe('FiniteTimeRootBlock', () => {
    it('should have correct type', () => {
      expect(FiniteTimeRootBlock.type).toBe('FiniteTimeRoot');
    });

    it('should have no inputs', () => {
      expect(FiniteTimeRootBlock.inputs).toEqual([]);
    });

    it('should have systemTime and progress outputs', () => {
      expect(FiniteTimeRootBlock.outputs).toEqual([
        { name: 'systemTime', type: { kind: 'Signal:Time' } },
        { name: 'progress', type: { kind: 'Signal:number' } },
      ]);
    });

    describe('compile', () => {
      it('should return systemTime as identity function', () => {
        const result = FiniteTimeRootBlock.compile({
          id: 'test',
          params: { durationMs: 5000 },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const systemTime = getSignalValue<number>(result.systemTime, 'Signal:Time');
        expect(systemTime(0, mockRuntimeCtx)).toBe(0);
        expect(systemTime(1000, mockRuntimeCtx)).toBe(1000);
        expect(systemTime(5000, mockRuntimeCtx)).toBe(5000);
      });

      it('should return progress as 0..1 clamped', () => {
        const result = FiniteTimeRootBlock.compile({
          id: 'test',
          params: { durationMs: 5000 },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const progress = getSignalValue<number>(result.progress, 'Signal:number');
        expect(progress(0, mockRuntimeCtx)).toBe(0);
        expect(progress(2500, mockRuntimeCtx)).toBeCloseTo(0.5, 5);
        expect(progress(5000, mockRuntimeCtx)).toBe(1);
        expect(progress(10000, mockRuntimeCtx)).toBe(1); // Clamped
      });

      it('should handle negative time', () => {
        const result = FiniteTimeRootBlock.compile({
          id: 'test',
          params: { durationMs: 5000 },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const progress = getSignalValue<number>(result.progress, 'Signal:number');
        expect(progress(-100, mockRuntimeCtx)).toBe(0);
      });

      it('should use default duration when not specified', () => {
        const result = FiniteTimeRootBlock.compile({
          id: 'test',
          params: {},
          inputs: {},
          ctx: mockCompileCtx,
        });

        const progress = getSignalValue<number>(result.progress, 'Signal:number');
        // Default is 5000ms
        expect(progress(2500, mockRuntimeCtx)).toBeCloseTo(0.5, 5);
      });
    });
  });

  describe('CycleTimeRootBlock', () => {
    it('should have correct type', () => {
      expect(CycleTimeRootBlock.type).toBe('CycleTimeRoot');
    });

    it('should have no inputs', () => {
      expect(CycleTimeRootBlock.inputs).toEqual([]);
    });

    it('should have systemTime and phaseA outputs', () => {
      expect(CycleTimeRootBlock.outputs).toEqual([
        { name: 'systemTime', type: { kind: 'Signal:Time' } },
        { name: 'phaseA', type: { kind: 'Signal:phase' } },
      ]);
    });

    describe('compile - loop mode', () => {
      it('should return systemTime as identity function', () => {
        const result = CycleTimeRootBlock.compile({
          id: 'test',
          params: { periodMs: 3000, mode: 'loop' },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const systemTime = getSignalValue<number>(result.systemTime, 'Signal:Time');
        expect(systemTime(0, mockRuntimeCtx)).toBe(0);
        expect(systemTime(1000, mockRuntimeCtx)).toBe(1000);
      });

      it('should return phaseA as sawtooth wave (loop mode)', () => {
        const result = CycleTimeRootBlock.compile({
          id: 'test',
          params: { periodMs: 3000, mode: 'loop' },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const phaseA = getSignalValue<number>(result.phaseA, 'Signal:phase');
        expect(phaseA(0, mockRuntimeCtx)).toBeCloseTo(0, 5);
        expect(phaseA(1500, mockRuntimeCtx)).toBeCloseTo(0.5, 5);
        expect(phaseA(2999, mockRuntimeCtx)).toBeCloseTo(0.9997, 3);
        expect(phaseA(3000, mockRuntimeCtx)).toBeCloseTo(0, 5); // Wraps
        expect(phaseA(4500, mockRuntimeCtx)).toBeCloseTo(0.5, 5); // Second cycle
      });

      it('should handle negative time', () => {
        const result = CycleTimeRootBlock.compile({
          id: 'test',
          params: { periodMs: 3000, mode: 'loop' },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const phaseA = getSignalValue<number>(result.phaseA, 'Signal:phase');
        expect(phaseA(-100, mockRuntimeCtx)).toBe(0);
      });
    });

    describe('compile - pingpong mode', () => {
      it('should return phaseA as triangle wave (pingpong mode)', () => {
        const result = CycleTimeRootBlock.compile({
          id: 'test',
          params: { periodMs: 1000, mode: 'pingpong' },
          inputs: {},
          ctx: mockCompileCtx,
        });

        const phaseA = getSignalValue<number>(result.phaseA, 'Signal:phase');

        // First cycle: 0→1
        expect(phaseA(0, mockRuntimeCtx)).toBeCloseTo(0, 5);
        expect(phaseA(500, mockRuntimeCtx)).toBeCloseTo(0.5, 5);
        expect(phaseA(999, mockRuntimeCtx)).toBeCloseTo(0.999, 3);

        // Second cycle: 1→0 (ping-pong back)
        expect(phaseA(1000, mockRuntimeCtx)).toBeCloseTo(1, 5); // At wrap, phase is 0, so 1-0=1
        expect(phaseA(1500, mockRuntimeCtx)).toBeCloseTo(0.5, 5);
        expect(phaseA(1999, mockRuntimeCtx)).toBeCloseTo(0.001, 3);

        // Third cycle: 0→1 again
        expect(phaseA(2000, mockRuntimeCtx)).toBeCloseTo(0, 5);
      });
    });

    it('should use default values when not specified', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: {},
        inputs: {},
        ctx: mockCompileCtx,
      });

      const phaseA = getSignalValue<number>(result.phaseA, 'Signal:phase');
      // Default periodMs is 3000, default mode is 'loop'
      expect(phaseA(1500, mockRuntimeCtx)).toBeCloseTo(0.5, 5);
    });
  });

  describe('InfiniteTimeRootBlock', () => {
    it('should have correct type', () => {
      expect(InfiniteTimeRootBlock.type).toBe('InfiniteTimeRoot');
    });

    it('should have no inputs', () => {
      expect(InfiniteTimeRootBlock.inputs).toEqual([]);
    });

    it('should have only systemTime output', () => {
      expect(InfiniteTimeRootBlock.outputs).toEqual([
        { name: 'systemTime', type: { kind: 'Signal:Time' } },
      ]);
    });

    describe('compile', () => {
      it('should return systemTime as identity function', () => {
        const result = InfiniteTimeRootBlock.compile({
          id: 'test',
          params: {},
          inputs: {},
          ctx: mockCompileCtx,
        });

        const systemTime = getSignalValue<number>(result.systemTime, 'Signal:Time');
        expect(systemTime(0, mockRuntimeCtx)).toBe(0);
        expect(systemTime(1000, mockRuntimeCtx)).toBe(1000);
        expect(systemTime(1000000, mockRuntimeCtx)).toBe(1000000);
        expect(systemTime(-500, mockRuntimeCtx)).toBe(-500); // No clamping for infinite
      });
    });
  });

  describe('Output type consistency', () => {
    it('all TimeRoots should output Signal:Time for systemTime', () => {
      const finiteOutputs = FiniteTimeRootBlock.outputs;
      const cycleOutputs = CycleTimeRootBlock.outputs;
      const infiniteOutputs = InfiniteTimeRootBlock.outputs;

      expect(finiteOutputs.find(o => o.name === 'systemTime')?.type.kind).toBe('Signal:Time');
      expect(cycleOutputs.find(o => o.name === 'systemTime')?.type.kind).toBe('Signal:Time');
      expect(infiniteOutputs.find(o => o.name === 'systemTime')?.type.kind).toBe('Signal:Time');
    });
  });
});
