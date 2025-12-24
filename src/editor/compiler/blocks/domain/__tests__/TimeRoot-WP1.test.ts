/**
 * TimeRoot WP1 Tests
 *
 * Tests for new WP1 TimeRoot features:
 * - Wrap events
 * - Energy outputs
 * - CycleIndex and cycleT
 * - End events for FiniteTimeRoot
 * - Auto-publications
 */

import { describe, it, expect } from 'vitest';
import type { CompileCtx, RuntimeCtx, GeometryCache } from '../../../types';
import {
  FiniteTimeRootBlock,
  CycleTimeRootBlock,
  InfiniteTimeRootBlock,
  extractTimeRootAutoPublications,
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
/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
function getSignalValue<T>(
  artifact: unknown,
  expectedKind: string
): (t: number, ctx: RuntimeCtx) => T {
  const art = artifact as { kind: string; value: unknown };
  expect(art.kind).toBe(expectedKind);
  return art.value as (t: number, ctx: RuntimeCtx) => T;
}

// Helper to extract event function from compiled output
function getEventValue(
  artifact: unknown,
  expectedKind: string
): (t: number, lastT: number, ctx: RuntimeCtx) => boolean {
  const art = artifact as { kind: string; value: unknown };
  expect(art.kind).toBe(expectedKind);
  return art.value as (t: number, lastT: number, ctx: RuntimeCtx) => boolean;
}
/* eslint-enable @typescript-eslint/prefer-readonly-parameter-types */

describe('TimeRoot WP1 Features', () => {
  describe('FiniteTimeRoot - end event', () => {
    it('fires end event exactly once at durationMs transition', () => {
      const result = FiniteTimeRootBlock.compile({
        id: 'test',
        params: { durationMs: 5000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      expect(result.end).toBeDefined();
      expect(result.end.kind).toBe('Event');

      const endEvent = getEventValue(result.end, 'Event');

      // Should not fire before duration
      expect(endEvent(1000, 984, mockRuntimeCtx)).toBe(false); // First frame
      expect(endEvent(4000, 3984, mockRuntimeCtx)).toBe(false); // Before end

      // Should fire at duration transition
      expect(endEvent(5000, 4984, mockRuntimeCtx)).toBe(true);  // Exactly at duration

      // Should not fire again after completion
      expect(endEvent(6000, 5984, mockRuntimeCtx)).toBe(false); // After completion
      expect(endEvent(7000, 6984, mockRuntimeCtx)).toBe(false); // Still after
    });

    it('energy is 1.0 while animating, 0 when complete', () => {
      const result = FiniteTimeRootBlock.compile({
        id: 'test',
        params: { durationMs: 3000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const energy = getSignalValue<number>(result.energy, 'Signal:number');

      expect(energy(1000, mockRuntimeCtx)).toBe(1.0);  // During animation
      expect(energy(2999, mockRuntimeCtx)).toBe(1.0);  // Just before end
      expect(energy(3000, mockRuntimeCtx)).toBe(0.0);  // At duration
      expect(energy(5000, mockRuntimeCtx)).toBe(0.0);  // After completion
    });
  });

  describe('CycleTimeRoot - wrap events', () => {
    it('fires wrap event at period boundary in loop mode', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000, mode: 'loop' },
        inputs: {},
        ctx: mockCompileCtx,
      });

      expect(result.wrap).toBeDefined();
      expect(result.wrap.kind).toBe('Event');

      const wrapEvent = getEventValue(result.wrap, 'Event');

      // Should not fire initially or mid-cycle
      expect(wrapEvent(0, -16, mockRuntimeCtx)).toBe(false);     // First frame
      expect(wrapEvent(500, 484, mockRuntimeCtx)).toBe(false);   // Mid-cycle

      // Should fire at period boundary
      expect(wrapEvent(1000, 984, mockRuntimeCtx)).toBe(true);   // Wrap!
      expect(wrapEvent(1016, 1000, mockRuntimeCtx)).toBe(false); // After wrap

      // Should fire again at next period
      expect(wrapEvent(1500, 1484, mockRuntimeCtx)).toBe(false);  // Mid-second-cycle
      expect(wrapEvent(2000, 1984, mockRuntimeCtx)).toBe(true);   // Second wrap!
    });

    it('fires wrap event on pingpong direction flips', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000, mode: 'pingpong' },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const wrapEvent = getEventValue(result.wrap, 'Event');

      // Forward (even cycle 0): no wrap at start
      expect(wrapEvent(0, -16, mockRuntimeCtx)).toBe(false);
      expect(wrapEvent(500, 484, mockRuntimeCtx)).toBe(false);

      // Forward→backward transition at period 1: wrap!
      expect(wrapEvent(1000, 984, mockRuntimeCtx)).toBe(true);

      // Backward (odd cycle 1): no wrap mid-cycle
      expect(wrapEvent(1500, 1484, mockRuntimeCtx)).toBe(false);

      // Backward→forward transition at period 2: wrap!
      expect(wrapEvent(2000, 1984, mockRuntimeCtx)).toBe(true);

      // Total: 2 wraps per period in pingpong mode
    });

    it('cycleIndex increments correctly over multiple cycles', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000, mode: 'loop' },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const cycleIndex = getSignalValue<number>(result.cycleIndex, 'Signal:number');

      expect(cycleIndex(0, mockRuntimeCtx)).toBe(0);      // Start of cycle 0
      expect(cycleIndex(500, mockRuntimeCtx)).toBe(0);    // During cycle 0
      expect(cycleIndex(999, mockRuntimeCtx)).toBe(0);    // End of cycle 0

      expect(cycleIndex(1000, mockRuntimeCtx)).toBe(1);   // Start of cycle 1
      expect(cycleIndex(1500, mockRuntimeCtx)).toBe(1);   // During cycle 1
      expect(cycleIndex(2500, mockRuntimeCtx)).toBe(2);   // Cycle 2
      expect(cycleIndex(3000, mockRuntimeCtx)).toBe(3);   // Cycle 3
    });

    it('cycleT provides time within current cycle', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000, mode: 'loop' },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const cycleT = getSignalValue<number>(result.cycleT, 'Signal:Time');

      expect(cycleT(0, mockRuntimeCtx)).toBe(0);      // Start of cycle 0
      expect(cycleT(500, mockRuntimeCtx)).toBe(500);  // Mid cycle 0
      expect(cycleT(999, mockRuntimeCtx)).toBe(999);  // End of cycle 0

      expect(cycleT(1000, mockRuntimeCtx)).toBe(0);   // Start of cycle 1 (wraps to 0)
      expect(cycleT(1500, mockRuntimeCtx)).toBe(500); // Mid cycle 1
      expect(cycleT(2000, mockRuntimeCtx)).toBe(0);   // Start of cycle 2
    });

    it('energy is constant 1.0 baseline', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const energy = getSignalValue<number>(result.energy, 'Signal:number');

      expect(energy(0, mockRuntimeCtx)).toBe(1.0);
      expect(energy(500, mockRuntimeCtx)).toBe(1.0);
      expect(energy(1000, mockRuntimeCtx)).toBe(1.0);
      expect(energy(5000, mockRuntimeCtx)).toBe(1.0);
    });
  });

  describe('InfiniteTimeRoot - energy only', () => {
    it('energy is constant 1.0 for ambient content', () => {
      const result = InfiniteTimeRootBlock.compile({
        id: 'test',
        params: { windowMs: 10000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const energy = getSignalValue<number>(result.energy, 'Signal:number');

      expect(energy(0, mockRuntimeCtx)).toBe(1.0);
      expect(energy(5000, mockRuntimeCtx)).toBe(1.0);
      expect(energy(50000, mockRuntimeCtx)).toBe(1.0);
    });
  });

  describe('Auto-publications', () => {
    it('CycleTimeRoot returns correct auto-publications', () => {
      const result = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const autoPubs = extractTimeRootAutoPublications('CycleTimeRoot', result);

      expect(autoPubs).toEqual([
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'wrap', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ]);
    });

    it('FiniteTimeRoot returns correct auto-publications', () => {
      const result = FiniteTimeRootBlock.compile({
        id: 'test',
        params: { durationMs: 5000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const autoPubs = extractTimeRootAutoPublications('FiniteTimeRoot', result);

      expect(autoPubs).toEqual([
        { busName: 'progress', artifactKey: 'progress', sortKey: 0 },
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'end', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ]);
    });

    it('InfiniteTimeRoot returns correct auto-publications', () => {
      const result = InfiniteTimeRootBlock.compile({
        id: 'test',
        params: { windowMs: 10000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const autoPubs = extractTimeRootAutoPublications('InfiniteTimeRoot', result);

      expect(autoPubs).toEqual([
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'pulse', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ]);
    });

    it('all auto-publications have sortKey=0 (highest priority)', () => {
      const cycleResult = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const finiteResult = FiniteTimeRootBlock.compile({
        id: 'test',
        params: { durationMs: 5000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const infiniteResult = InfiniteTimeRootBlock.compile({
        id: 'test',
        params: { windowMs: 10000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const cyclePubs = extractTimeRootAutoPublications('CycleTimeRoot', cycleResult);
      const finitePubs = extractTimeRootAutoPublications('FiniteTimeRoot', finiteResult);
      const infinitePubs = extractTimeRootAutoPublications('InfiniteTimeRoot', infiniteResult);

      // All auto-publications should have sortKey=0
      [...cyclePubs, ...finitePubs, ...infinitePubs].forEach(pub => {
        expect(pub.sortKey).toBe(0);
      });
    });
  });

  describe('Edge cases', () => {
    it('negative time does not trigger wrap or end events', () => {
      const cycleResult = CycleTimeRootBlock.compile({
        id: 'test',
        params: { periodMs: 1000, mode: 'loop' },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const finiteResult = FiniteTimeRootBlock.compile({
        id: 'test',
        params: { durationMs: 5000 },
        inputs: {},
        ctx: mockCompileCtx,
      });

      const cycleWrap = getEventValue(cycleResult.wrap, 'Event');
      const finiteEnd = getEventValue(finiteResult.end, 'Event');

      // Negative time should never trigger events
      expect(cycleWrap(-100, -116, mockRuntimeCtx)).toBe(false);
      expect(finiteEnd(-100, -116, mockRuntimeCtx)).toBe(false);

      // Clamping to 0 should not trigger events
      expect(cycleWrap(0, -100, mockRuntimeCtx)).toBe(false);
      expect(finiteEnd(0, -100, mockRuntimeCtx)).toBe(false);
    });
  });
});