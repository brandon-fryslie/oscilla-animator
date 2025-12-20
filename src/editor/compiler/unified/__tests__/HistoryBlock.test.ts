/**
 * @file HistoryBlock.test.ts - Unit tests for HistoryBlock
 * @description Tests circular buffer state block behavior.
 */

import { describe, it, expect } from 'vitest';
import { HistoryBlock } from '../blocks/HistoryBlock';
import { TimeCtxFactory } from '../TimeCtx';

describe('HistoryBlock', () => {
  describe('Construction', () => {
    it('should create with default parameters', () => {
      const block = new HistoryBlock();

      expect(block.type).toBe('History');
      expect(block.scrubPolicy).toBe('hold');
    });

    it('should create with custom depth', () => {
      const block = new HistoryBlock({ depth: 20 });
      const shape = block.stateShape;

      expect(shape.fields.buffer.size).toBe(20);
    });

    it('should clamp depth to reasonable range', () => {
      const tooSmall = new HistoryBlock({ depth: 0 });
      expect(tooSmall.stateShape.fields.buffer.size).toBe(1);

      const tooLarge = new HistoryBlock({ depth: 200 });
      expect(tooLarge.stateShape.fields.buffer.size).toBe(100);
    });
  });

  describe('State shape', () => {
    it('should declare correct state shape', () => {
      const block = new HistoryBlock({ depth: 5 });
      const shape = block.stateShape;

      expect(shape.type).toBe('History');
      expect(shape.fields.buffer).toBeDefined();
      expect(shape.fields.buffer.type).toBe('buffer');
      expect(shape.fields.writeIndex).toBeDefined();
      expect(shape.fields.frameCounter).toBeDefined();
    });
  });

  describe('Basic recording', () => {
    it('should record input sequence correctly', () => {
      const block = new HistoryBlock({ depth: 10 });
      const state = block.initState(0);

      const dt = 0.016;
      const sequence = [1, 2, 3, 4, 5];

      // Record sequence
      for (let i = 0; i < sequence.length; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: sequence[i] };

        block.updateState(state, inputs, ctx);
      }

      // Get outputs
      const ctx = TimeCtxFactory.forPerformance(0, 0, 0);
      const outputs = block.computeOutputs(state, {}, ctx);

      const buffer = outputs.output as number[];
      const latest = outputs.latest as number;

      // Buffer should contain sequence in order
      expect(buffer).toEqual([1, 2, 3, 4, 5]);

      // Latest value should be 5
      expect(latest).toBe(5);
    });

    it('should return latest value correctly', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write several values
      for (let i = 0; i < 7; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i * 10 };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const latest = outputs.latest as number;

      // Latest should be 60 (last written value)
      expect(latest).toBe(60);
    });
  });

  describe('Buffer wrap', () => {
    it('should wrap circular buffer when full', () => {
      const block = new HistoryBlock({ depth: 3 });
      const state = block.initState(0);

      const dt = 0.016;
      const sequence = [1, 2, 3, 4, 5];

      // Record sequence (more than buffer depth)
      for (let i = 0; i < sequence.length; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: sequence[i] };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Buffer should contain last 3 values: [3, 4, 5]
      expect(buffer).toEqual([3, 4, 5]);
      expect(buffer).toHaveLength(3);
    });

    it('should maintain chronological order after wrap', () => {
      const block = new HistoryBlock({ depth: 4 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write 10 values
      for (let i = 0; i < 10; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Should contain values 6, 7, 8, 9 in order
      expect(buffer).toEqual([6, 7, 8, 9]);
    });
  });

  describe('Empty buffer behavior', () => {
    it('should return empty array before first write', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      expect(buffer).toEqual([]);
    });

    it('should return partial buffer before full', () => {
      const block = new HistoryBlock({ depth: 10 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write only 3 values
      for (let i = 0; i < 3; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i + 1 };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Should contain only written values
      expect(buffer).toEqual([1, 2, 3]);
      expect(buffer).toHaveLength(3);
    });
  });

  describe('Depth configuration', () => {
    it('should respect configured buffer size', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write 10 values
      for (let i = 0; i < 10; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      expect(buffer).toHaveLength(5);
      expect(buffer).toEqual([5, 6, 7, 8, 9]);
    });

    it('should handle depth of 1', () => {
      const block = new HistoryBlock({ depth: 1 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write several values
      for (let i = 0; i < 5; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i * 10 };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Should contain only most recent value
      expect(buffer).toEqual([40]);
    });

    it('should handle large depth', () => {
      const block = new HistoryBlock({ depth: 50 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write 30 values
      for (let i = 0; i < 30; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Should contain all 30 values (buffer not full)
      expect(buffer).toHaveLength(30);
      expect(buffer[0]).toBe(0);
      expect(buffer[29]).toBe(29);
    });
  });

  describe('Scrub mode behavior', () => {
    it('should freeze buffer in scrub mode', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const dt = 0.016;

      // Record in performance mode
      for (let i = 0; i < 3; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i + 1 };
        block.updateState(state, inputs, ctx);
      }

      const beforeScrub = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const bufferBefore = beforeScrub.output as number[];

      // Switch to scrub mode - buffer should freeze
      for (let i = 0; i < 3; i++) {
        const ctx = TimeCtxFactory.forScrub(i * dt, i);
        const inputs = { input: i + 100 }; // Different values
        block.updateState(state, inputs, ctx);
      }

      const duringScrub = block.computeOutputs(state, {}, TimeCtxFactory.forScrub(0, 0));
      const bufferDuring = duringScrub.output as number[];

      // Buffer should be unchanged
      expect(bufferDuring).toEqual(bufferBefore);
    });

    it('should not advance writeIndex in scrub mode', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write 2 values in performance mode
      for (let i = 0; i < 2; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i + 1 };
        block.updateState(state, inputs, ctx);
      }

      const historyState = state.values as { writeIndex: number; frameCounter: number };
      const writeIndexBefore = historyState.writeIndex;
      const frameCounterBefore = historyState.frameCounter;

      // Scrub mode
      for (let i = 0; i < 3; i++) {
        const ctx = TimeCtxFactory.forScrub(i * dt, i);
        const inputs = { input: i + 100 };
        block.updateState(state, inputs, ctx);
      }

      // Indices should not change
      expect(historyState.writeIndex).toBe(writeIndexBefore);
      expect(historyState.frameCounter).toBe(frameCounterBefore);
    });

    it('should resume recording after scrub mode', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const dt = 0.016;

      // Performance mode
      for (let i = 0; i < 2; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i + 1 };
        block.updateState(state, inputs, ctx);
      }

      // Scrub mode
      for (let i = 0; i < 2; i++) {
        const ctx = TimeCtxFactory.forScrub(i * dt, i);
        const inputs = { input: 999 };
        block.updateState(state, inputs, ctx);
      }

      // Back to performance mode
      for (let i = 0; i < 2; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i + 10 };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Should contain: [1, 2, 10, 11]
      expect(buffer).toEqual([1, 2, 10, 11]);
    });
  });

  describe('State persistence', () => {
    it('should maintain buffer across multiple frames', () => {
      const block = new HistoryBlock({ depth: 10 });
      const state = block.initState(0);

      const dt = 0.016;
      const snapshots: number[][] = [];

      // Record for 10 frames, taking snapshots
      for (let frame = 0; frame < 10; frame++) {
        const ctx = TimeCtxFactory.forPerformance(frame * dt, dt, frame);
        const inputs = { input: frame };

        block.updateState(state, inputs, ctx);

        const outputs = block.computeOutputs(state, inputs, ctx);
        snapshots.push([...(outputs.output as number[])]);
      }

      // Each snapshot should contain all previous values plus current
      for (let i = 0; i < snapshots.length; i++) {
        expect(snapshots[i]).toHaveLength(i + 1);
        expect(snapshots[i]![i]).toBe(i);
      }
    });

    it('should not have memory leaks (buffer size constant)', () => {
      const block = new HistoryBlock({ depth: 5 });
      const state = block.initState(0);

      const dt = 0.016;

      // Write many values
      for (let i = 0; i < 100; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: i };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      // Buffer should still be depth 5
      expect(buffer).toHaveLength(5);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing input (defaults to 0)', () => {
      const block = new HistoryBlock({ depth: 3 });
      const state = block.initState(0);

      const dt = 0.016;
      const inputs = {}; // No input

      for (let i = 0; i < 3; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      expect(buffer).toEqual([0, 0, 0]);
    });

    it('should handle floating point inputs', () => {
      const block = new HistoryBlock({ depth: 3 });
      const state = block.initState(0);

      const dt = 0.016;
      const values = [1.5, 2.7, 3.9];

      for (let i = 0; i < values.length; i++) {
        const ctx = TimeCtxFactory.forPerformance(i * dt, dt, i);
        const inputs = { input: values[i] };
        block.updateState(state, inputs, ctx);
      }

      const outputs = block.computeOutputs(state, {}, TimeCtxFactory.forPerformance(0, 0, 0));
      const buffer = outputs.output as number[];

      expect(buffer).toEqual([1.5, 2.7, 3.9]);
    });
  });
});
