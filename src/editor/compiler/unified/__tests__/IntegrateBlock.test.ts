/**
 * @file IntegrateBlock.test.ts - Unit tests for IntegrateBlock
 * @description Tests accumulator state block behavior.
 */

import { describe, it, expect } from 'vitest';
import { IntegrateBlock } from '../blocks/IntegrateBlock';
import { TimeCtxFactory } from '../TimeCtx';

describe('IntegrateBlock', () => {
  describe('Construction', () => {
    it('should create with default parameters', () => {
      const block = new IntegrateBlock();

      expect(block.type).toBe('Integrate');
      expect(block.scrubPolicy).toBe('hold');
    });

    it('should create with custom initial value', () => {
      const block = new IntegrateBlock({ initialValue: 100 });
      const state = block.initState(0);

      const integrateState = state.values as { accumulator: number };
      expect(integrateState.accumulator).toBe(100);
    });
  });

  describe('State shape', () => {
    it('should declare correct state shape', () => {
      const block = new IntegrateBlock();
      const shape = block.stateShape;

      expect(shape.type).toBe('Integrate');
      expect(shape.fields.accumulator).toBeDefined();
      expect(shape.fields.accumulator.type).toBe('number');
    });
  });

  describe('Basic accumulation', () => {
    it('should accumulate constant input linearly', () => {
      const block = new IntegrateBlock();
      const state = block.initState(0);

      // Constant input of 1.0, dt = 0.016s (60fps)
      const dt = 16 / 1000; // 16ms in seconds
      const inputs = { input: 1.0 };

      const results: number[] = [];

      // Simulate 10 frames
      for (let frame = 0; frame < 10; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);

        block.updateState(state, inputs, ctx);
        const outputs = block.computeOutputs(state, inputs, ctx);

        results.push(outputs.output as number);
      }

      // Accumulator should grow linearly: 0 + 1*dt, 0 + 2*dt, ...
      // After first frame: 0.016
      // After second frame: 0.032
      // After 10 frames: 0.16
      expect(results[0]).toBeCloseTo(0.016, 3);
      expect(results[9]).toBeCloseTo(0.16, 3);

      // Verify linear growth
      for (let i = 1; i < results.length; i++) {
        const diff = results[i]! - results[i - 1]!;
        expect(diff).toBeCloseTo(dt, 5);
      }
    });

    it('should handle zero input (no accumulation)', () => {
      const block = new IntegrateBlock({ initialValue: 50 });
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: 0 };

      // Run for several frames
      for (let frame = 0; frame < 5; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, inputs, TimeCtxFactory.forPerformance(0, 0, 0));

      // Accumulator should stay at initial value
      expect(outputs.output).toBe(50);
    });

    it('should handle negative input (decreasing accumulator)', () => {
      const block = new IntegrateBlock({ initialValue: 100 });
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: -1.0 };

      const results: number[] = [];

      // Simulate 10 frames
      for (let frame = 0; frame < 10; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);

        block.updateState(state, inputs, ctx);
        const outputs = block.computeOutputs(state, inputs, ctx);

        results.push(outputs.output as number);
      }

      // Accumulator should decrease
      expect(results[0]).toBeCloseTo(100 - 0.016, 3);
      expect(results[9]).toBeCloseTo(100 - 0.16, 3);
    });
  });

  describe('Initial value configuration', () => {
    it('should start at configured initial value', () => {
      const block = new IntegrateBlock({ initialValue: 75.5 });
      const state = block.initState(0);

      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const outputs = block.computeOutputs(state, {}, ctx);

      expect(outputs.output).toBe(75.5);
    });

    it('should accumulate from initial value', () => {
      const block = new IntegrateBlock({ initialValue: 100 });
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: 1.0 };

      // One frame
      const ctx = TimeCtxFactory.forPerformance(dt, dt, 0);
      block.updateState(state, inputs, ctx);
      const outputs = block.computeOutputs(state, inputs, ctx);

      // Should be initial + input * dt
      expect(outputs.output).toBeCloseTo(100 + 0.016, 5);
    });
  });

  describe('Scrub mode behavior', () => {
    it('should freeze accumulator in scrub mode', () => {
      const block = new IntegrateBlock();
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: 1.0 };

      // Accumulate in performance mode for 5 frames
      for (let frame = 0; frame < 5; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);
        block.updateState(state, inputs, ctx);
      }

      const performanceOutput = block.computeOutputs(state, inputs, TimeCtxFactory.forPerformance(0, 0, 0));
      const beforeScrub = performanceOutput.output as number;

      // Switch to scrub mode - accumulator should freeze
      for (let frame = 0; frame < 3; frame++) {
        const ctx = TimeCtxFactory.forScrub(frame * dt, frame);
        block.updateState(state, inputs, ctx);
      }

      const scrubOutput = block.computeOutputs(state, inputs, TimeCtxFactory.forScrub(0, 0));
      const duringScrub = scrubOutput.output as number;

      // Accumulator should not change during scrub
      expect(duringScrub).toBeCloseTo(beforeScrub, 5);
    });

    it('should resume accumulation after scrub mode', () => {
      const block = new IntegrateBlock();
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: 1.0 };

      // Performance mode
      for (let frame = 0; frame < 5; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);
        block.updateState(state, inputs, ctx);
      }

      const beforeScrub = (block.computeOutputs(state, inputs, TimeCtxFactory.forPerformance(0, 0, 0)).output as number);

      // Scrub mode
      for (let frame = 0; frame < 3; frame++) {
        const ctx = TimeCtxFactory.forScrub(frame * dt, frame);
        block.updateState(state, inputs, ctx);
      }

      // Back to performance mode
      for (let frame = 0; frame < 2; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);
        block.updateState(state, inputs, ctx);
      }

      const afterResume = (block.computeOutputs(state, inputs, TimeCtxFactory.forPerformance(0, 0, 0)).output as number);

      // Should have accumulated for 2 more frames
      expect(afterResume).toBeCloseTo(beforeScrub + 2 * dt, 5);
    });
  });

  describe('State persistence', () => {
    it('should maintain state across multiple evaluations', () => {
      const block = new IntegrateBlock();
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: 1.0 };

      const snapshots: number[] = [];

      // Evaluate for 5 frames, taking snapshots
      for (let frame = 0; frame < 5; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);
        block.updateState(state, inputs, ctx);

        const outputs = block.computeOutputs(state, inputs, ctx);
        snapshots.push(outputs.output as number);
      }

      // Each snapshot should be larger than the previous
      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i]).toBeGreaterThan(snapshots[i - 1]!);
      }

      // State memory should contain accumulated value
      const integrateState = state.values as { accumulator: number };
      expect(integrateState.accumulator).toBeCloseTo(0.08, 3);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing input (defaults to 0)', () => {
      const block = new IntegrateBlock({ initialValue: 100 });
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = {}; // No input provided

      const ctx = TimeCtxFactory.forPerformance(dt, dt, 0);
      block.updateState(state, inputs, ctx);
      const outputs = block.computeOutputs(state, inputs, ctx);

      // Should stay at initial value (0 * dt = 0)
      expect(outputs.output).toBe(100);
    });

    it('should handle very small dt', () => {
      const block = new IntegrateBlock();
      const state = block.initState(0);

      const dt = 0.001; // 1ms
      const inputs = { input: 1.0 };

      const ctx = TimeCtxFactory.forPerformance(dt, dt, 0);
      block.updateState(state, inputs, ctx);
      const outputs = block.computeOutputs(state, inputs, ctx);

      expect(outputs.output).toBeCloseTo(0.001, 5);
    });

    it('should handle large input values', () => {
      const block = new IntegrateBlock();
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = { input: 1000.0 };

      const ctx = TimeCtxFactory.forPerformance(dt, dt, 0);
      block.updateState(state, inputs, ctx);
      const outputs = block.computeOutputs(state, inputs, ctx);

      expect(outputs.output).toBeCloseTo(16, 3);
    });
  });
});
