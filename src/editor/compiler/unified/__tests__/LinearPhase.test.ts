/**
 * @file LinearPhase.test.ts - Unit tests for LinearPhaseBlock
 * @description Tests simple linear phase progression.
 */

import { describe, it, expect } from 'vitest';
import {
  createLinearPhaseSignal,
  calculatePhase,
  LinearPhaseBlock,
} from '../blocks/LinearPhaseBlock';
import { TimeCtxFactory } from '../TimeCtx';

describe('LinearPhaseBlock', () => {
  describe('Block metadata', () => {
    it('should have correct type', () => {
      expect(LinearPhaseBlock.type).toBe('LinearPhase');
    });

    it('should expose createSignal function', () => {
      expect(typeof LinearPhaseBlock.createSignal).toBe('function');
    });

    it('should expose calculatePhase function', () => {
      expect(typeof LinearPhaseBlock.calculatePhase).toBe('function');
    });
  });

  describe('Non-looping behavior', () => {
    it('should start at 0 at t=0', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const phase = signal(ctx);

      expect(phase).toBeCloseTo(0, 5);
    });

    it('should progress linearly to 1', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: 0,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0.25, 5);

      const ctx2 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.5, 5);

      const ctx3 = TimeCtxFactory.forPerformance(2.0, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(1.0, 5);
    });

    it('should clamp at 1 after duration', () => {
      const signal = createLinearPhaseSignal({
        duration: 1.0,
        looping: false,
        offset: 0,
      });

      const ctx1 = TimeCtxFactory.forPerformance(1.5, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(1.0, 5);

      const ctx2 = TimeCtxFactory.forPerformance(10.0, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(1.0, 5);
    });

    it('should clamp at 0 before start', () => {
      const signal = createLinearPhaseSignal({
        duration: 1.0,
        looping: false,
        offset: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(-0.5, 0, 0);
      const phase = signal(ctx);

      expect(phase).toBeCloseTo(0, 5);
    });
  });

  describe('Looping behavior', () => {
    it('should loop back to 0 after duration', () => {
      const signal = createLinearPhaseSignal({
        duration: 1.0,
        looping: true,
        offset: 0,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0.5, 5);

      const ctx2 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0, 5);

      const ctx3 = TimeCtxFactory.forPerformance(1.5, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(0.5, 5);
    });

    it('should loop continuously', () => {
      const signal = createLinearPhaseSignal({
        duration: 1.0,
        looping: true,
        offset: 0,
      });

      // First cycle
      const ctx1 = TimeCtxFactory.forPerformance(0.25, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0.25, 5);

      // Second cycle
      const ctx2 = TimeCtxFactory.forPerformance(1.25, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.25, 5);

      // Third cycle
      const ctx3 = TimeCtxFactory.forPerformance(2.25, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(0.25, 5);
    });

    it('should handle multiple complete loops', () => {
      const signal = createLinearPhaseSignal({
        duration: 0.5,
        looping: true,
        offset: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(2.75, 0, 0);
      const phase = signal(ctx);

      // 2.75 / 0.5 = 5.5 loops, so phase should be 0.5
      expect(phase).toBeCloseTo(0.5, 5);
    });
  });

  describe('Offset handling', () => {
    it('should respect positive offset in non-looping mode', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: 0.5,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0.25, 5); // (0 + 0.5) / 2

      const ctx2 = TimeCtxFactory.forPerformance(1.5, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(1.0, 5); // Clamped
    });

    it('should respect negative offset in non-looping mode', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: -1.0,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0, 5); // Clamped to 0

      const ctx2 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0, 5); // (1 - 1) / 2 = 0

      const ctx3 = TimeCtxFactory.forPerformance(2.0, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(0.5, 5); // (2 - 1) / 2 = 0.5
    });

    it('should respect offset in looping mode', () => {
      const signal = createLinearPhaseSignal({
        duration: 1.0,
        looping: true,
        offset: 0.3,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0.3, 5);

      const ctx2 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.8, 5);

      const ctx3 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(0.3, 5); // Loops back
    });
  });

  describe('Scrub behavior', () => {
    it('should be deterministic across scrub operations', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: 0,
      });

      // Sample same time multiple times
      const ctx1 = TimeCtxFactory.forScrub(1.5, 0);
      const phase1 = signal(ctx1);

      const ctx2 = TimeCtxFactory.forScrub(1.5, 10);
      const phase2 = signal(ctx2);

      expect(phase1).toBeCloseTo(phase2, 10);
    });

    it('should work in scrub mode', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: 0,
      });

      const ctx = TimeCtxFactory.forScrub(1.0, 0);
      const phase = signal(ctx);

      expect(phase).toBeCloseTo(0.5, 5);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero duration (returns 1)', () => {
      const signal = createLinearPhaseSignal({
        duration: 0,
        looping: false,
        offset: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(5.0, 0, 0);
      const phase = signal(ctx);

      expect(phase).toBeCloseTo(1, 5);
    });

    it('should handle very small duration', () => {
      const signal = createLinearPhaseSignal({
        duration: 0.001,
        looping: false,
        offset: 0,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0, 5);

      const ctx2 = TimeCtxFactory.forPerformance(0.0005, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.5, 5);

      const ctx3 = TimeCtxFactory.forPerformance(0.001, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(1, 5);
    });

    it('should handle very large duration', () => {
      const signal = createLinearPhaseSignal({
        duration: 1000.0,
        looping: false,
        offset: 0,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0, 5);

      const ctx2 = TimeCtxFactory.forPerformance(500, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.5, 5);

      const ctx3 = TimeCtxFactory.forPerformance(1000, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(1, 5);
    });

    it('should handle negative time with offset', () => {
      const signal = createLinearPhaseSignal({
        duration: 2.0,
        looping: false,
        offset: 1.0,
      });

      const ctx = TimeCtxFactory.forPerformance(-0.5, 0, 0);
      const phase = signal(ctx);

      // (-0.5 + 1.0) / 2 = 0.25
      expect(phase).toBeCloseTo(0.25, 5);
    });
  });

  describe('Default parameters', () => {
    it('should use default parameters when none provided', () => {
      const signal = createLinearPhaseSignal();

      const ctx1 = TimeCtxFactory.forPerformance(0, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0, 5);

      const ctx2 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.5, 5);

      const ctx3 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      expect(signal(ctx3)).toBeCloseTo(1.0, 5);

      // Should be non-looping by default
      const ctx4 = TimeCtxFactory.forPerformance(2.0, 0, 0);
      expect(signal(ctx4)).toBeCloseTo(1.0, 5);
    });

    it('should merge partial parameters with defaults', () => {
      const signal = createLinearPhaseSignal({
        looping: true,
        // duration, offset use defaults
      });

      const ctx1 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      expect(signal(ctx1)).toBeCloseTo(0.5, 5);

      const ctx2 = TimeCtxFactory.forPerformance(1.5, 0, 0);
      expect(signal(ctx2)).toBeCloseTo(0.5, 5); // Looping
    });
  });

  describe('calculatePhase direct function', () => {
    it('should calculate phase without Signal wrapper', () => {
      const phase = calculatePhase(1.5, {
        duration: 2.0,
        looping: false,
        offset: 0,
      });

      expect(phase).toBeCloseTo(0.75, 5);
    });

    it('should handle looping in direct function', () => {
      const phase = calculatePhase(2.5, {
        duration: 1.0,
        looping: true,
        offset: 0,
      });

      expect(phase).toBeCloseTo(0.5, 5);
    });
  });
});
