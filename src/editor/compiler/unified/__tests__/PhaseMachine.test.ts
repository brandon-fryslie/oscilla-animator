/**
 * @file PhaseMachine.test.ts - Unit tests for PhaseMachineBlock
 * @description Tests animation phase lifecycle.
 */

import { describe, it, expect } from 'vitest';
import {
  createPhaseMachineSignal,
  calculatePhaseSample,
  PhaseMachineBlock,
} from '../blocks/PhaseMachineBlock';
import { TimeCtxFactory } from '../TimeCtx';

describe('PhaseMachineBlock', () => {
  describe('Block metadata', () => {
    it('should have correct type', () => {
      expect(PhaseMachineBlock.type).toBe('PhaseMachine');
    });

    it('should expose createSignal function', () => {
      expect(typeof PhaseMachineBlock.createSignal).toBe('function');
    });

    it('should expose calculateSample function', () => {
      expect(typeof PhaseMachineBlock.calculateSample).toBe('function');
    });
  });

  describe('Phase transitions', () => {
    it('should start in entrance phase at t=0', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 2.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('entrance');
      expect(sample.uRaw).toBeCloseTo(0, 5);
    });

    it('should transition from entrance to hold', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      // Just before transition
      const ctx1 = TimeCtxFactory.forPerformance(0.99, 0, 0);
      const sample1 = signal(ctx1);
      expect(sample1.phase).toBe('entrance');

      // Just after transition
      const ctx2 = TimeCtxFactory.forPerformance(1.01, 0, 0);
      const sample2 = signal(ctx2);
      expect(sample2.phase).toBe('hold');
    });

    it('should transition from hold to exit', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      // In hold phase
      const ctx1 = TimeCtxFactory.forPerformance(1.5, 0, 0);
      const sample1 = signal(ctx1);
      expect(sample1.phase).toBe('hold');

      // In exit phase
      const ctx2 = TimeCtxFactory.forPerformance(2.5, 0, 0);
      const sample2 = signal(ctx2);
      expect(sample2.phase).toBe('exit');
    });

    it('should complete animation at total duration', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const totalDuration = 2.5;
      const ctx = TimeCtxFactory.forPerformance(totalDuration, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('exit');
      expect(sample.uRaw).toBeCloseTo(1, 5);
    });
  });

  describe('Phase progress', () => {
    it('should have linear uRaw progress in entrance', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 2.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      const sample1 = signal(ctx1);
      expect(sample1.uRaw).toBeCloseTo(0.25, 5);

      const ctx2 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      const sample2 = signal(ctx2);
      expect(sample2.uRaw).toBeCloseTo(0.5, 5);

      const ctx3 = TimeCtxFactory.forPerformance(2.0, 0, 0);
      const sample3 = signal(ctx3);
      expect(sample3.uRaw).toBeCloseTo(1.0, 5);
    });

    it('should have eased u in entrance phase', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 0,
        exitDuration: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(0.5, 0, 0);
      const sample = signal(ctx);

      // easeOutCubic should produce u > uRaw for middle values
      expect(sample.u).toBeGreaterThan(sample.uRaw);
    });

    it('should have linear progress in hold phase', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 2.0,
        exitDuration: 0.5,
      });

      const ctx1 = TimeCtxFactory.forPerformance(1.5, 0, 0);
      const sample1 = signal(ctx1);
      expect(sample1.uRaw).toBeCloseTo(0.25, 5);
      expect(sample1.u).toBeCloseTo(sample1.uRaw, 5); // No easing in hold

      const ctx2 = TimeCtxFactory.forPerformance(2.0, 0, 0);
      const sample2 = signal(ctx2);
      expect(sample2.uRaw).toBeCloseTo(0.5, 5);
      expect(sample2.u).toBeCloseTo(sample2.uRaw, 5);
    });

    it('should have eased u in exit phase', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 1.0,
      });

      const ctx = TimeCtxFactory.forPerformance(2.5, 0, 0);
      const sample = signal(ctx);

      // easeInCubic should produce u < uRaw for middle values
      expect(sample.u).toBeLessThan(sample.uRaw);
    });
  });

  describe('Local time tracking', () => {
    it('should track tLocal within each phase', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      // Entrance: tLocal should be absolute time
      const ctx1 = TimeCtxFactory.forPerformance(0.3, 0, 0);
      const sample1 = signal(ctx1);
      expect(sample1.tLocal).toBeCloseTo(0.3, 5);

      // Hold: tLocal should restart at 0
      const ctx2 = TimeCtxFactory.forPerformance(1.4, 0, 0);
      const sample2 = signal(ctx2);
      expect(sample2.tLocal).toBeCloseTo(0.4, 5);

      // Exit: tLocal should restart at 0
      const ctx3 = TimeCtxFactory.forPerformance(2.2, 0, 0);
      const sample3 = signal(ctx3);
      expect(sample3.tLocal).toBeCloseTo(0.2, 5);
    });
  });

  describe('Scrub behavior', () => {
    it('should be deterministic across scrub operations', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      // Sample same time multiple times
      const ctx1 = TimeCtxFactory.forScrub(1.5, 0);
      const sample1 = signal(ctx1);

      const ctx2 = TimeCtxFactory.forScrub(1.5, 10);
      const sample2 = signal(ctx2);

      // Should produce identical samples
      expect(sample1.phase).toBe(sample2.phase);
      expect(sample1.u).toBeCloseTo(sample2.u, 10);
      expect(sample1.uRaw).toBeCloseTo(sample2.uRaw, 10);
      expect(sample1.tLocal).toBeCloseTo(sample2.tLocal, 10);
    });

    it('should work in scrub mode', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const ctx = TimeCtxFactory.forScrub(0.5, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('entrance');
      expect(sample.uRaw).toBeCloseTo(0.5, 5);
    });
  });

  describe('Duration edge cases', () => {
    it('should handle zero entrance duration', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const sample = signal(ctx);

      // Should be in hold phase immediately
      expect(sample.phase).toBe('hold');
    });

    it('should handle zero hold duration', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 0,
        exitDuration: 0.5,
      });

      const ctx1 = TimeCtxFactory.forPerformance(0.5, 0, 0);
      const sample1 = signal(ctx1);
      expect(sample1.phase).toBe('entrance');

      const ctx2 = TimeCtxFactory.forPerformance(1.0, 0, 0);
      const sample2 = signal(ctx2);
      expect(sample2.phase).toBe('exit');
    });

    it('should handle zero exit duration', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(2.0, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('exit');
      expect(sample.uRaw).toBeCloseTo(1, 5);
    });

    it('should handle all zero durations', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 0,
        holdDuration: 0,
        exitDuration: 0,
      });

      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const sample = signal(ctx);

      // Should complete immediately
      expect(sample.phase).toBe('exit');
      expect(sample.uRaw).toBeCloseTo(1, 5);
    });
  });

  describe('Time clamping', () => {
    it('should clamp negative time to 0', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const ctx = TimeCtxFactory.forPerformance(-0.5, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('entrance');
      expect(sample.uRaw).toBeCloseTo(0, 5);
    });

    it('should clamp time beyond total duration', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      const totalDuration = 2.5;
      const ctx = TimeCtxFactory.forPerformance(totalDuration + 1.0, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('exit');
      expect(sample.uRaw).toBeCloseTo(1, 5);
    });
  });

  describe('Default parameters', () => {
    it('should use default parameters when none provided', () => {
      const signal = createPhaseMachineSignal();

      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('entrance');
      expect(sample.uRaw).toBeCloseTo(0, 5);
    });

    it('should merge partial parameters with defaults', () => {
      const signal = createPhaseMachineSignal({
        entranceDuration: 0.5,
        // holdDuration, exitDuration use defaults
      });

      const ctx = TimeCtxFactory.forPerformance(0.25, 0, 0);
      const sample = signal(ctx);

      expect(sample.phase).toBe('entrance');
      expect(sample.uRaw).toBeCloseTo(0.5, 5);
    });
  });

  describe('calculatePhaseSample direct function', () => {
    it('should calculate sample without Signal wrapper', () => {
      const sample = calculatePhaseSample(1.5, {
        entranceDuration: 1.0,
        holdDuration: 1.0,
        exitDuration: 0.5,
      });

      expect(sample.phase).toBe('hold');
      expect(sample.uRaw).toBeCloseTo(0.5, 5);
    });
  });
});
