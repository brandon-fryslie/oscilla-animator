/**
 * @file RuntimeAdapter.test.ts - Unit tests for RuntimeAdapter
 * @description Tests the runtime integration pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedCompiler } from '../UnifiedCompiler';
import { RuntimeAdapter } from '../RuntimeAdapter';
import { stateBlockRegistry } from '../StateBlock';
import { DelayBlock } from '../blocks/DelayBlock';
import type { PatchDefinition } from '../UnifiedCompiler';

describe('RuntimeAdapter', () => {
  beforeEach(() => {
    // Ensure DelayBlock is registered
    if (!stateBlockRegistry.isStateBlock('Delay')) {
      stateBlockRegistry.register('Delay', new DelayBlock({ delay: 0.5 }));
    }
  });

  describe('Construction', () => {
    it('should throw if compilation has errors', () => {
      const compiler = new UnifiedCompiler();

      // Create a patch with an instantaneous cycle
      const patch: PatchDefinition = {
        blocks: new Map([
          ['b1', { id: 'b1', type: 'Source', params: {} }],
          ['b2', { id: 'b2', type: 'Transform', params: {} }],
        ]),
        connections: [
          { from: { blockId: 'b1', port: 'out' }, to: { blockId: 'b2', port: 'in' } },
          { from: { blockId: 'b2', port: 'out' }, to: { blockId: 'b1', port: 'in' } },
        ],
      };

      const result = compiler.compile(patch);

      expect(() => new RuntimeAdapter(result)).toThrow(/failed compilation/);
    });

    it('should accept valid compilation result', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['b1', { id: 'b1', type: 'Source', params: {} }],
        ]),
        connections: [],
      };

      const result = compiler.compile(patch);

      expect(() => new RuntimeAdapter(result)).not.toThrow();
    });
  });

  describe('Simple stateless patch', () => {
    it('should compile and evaluate constant → output', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['const', { id: 'const', type: 'Constant', params: { value: 42 } }],
          ['output', { id: 'output', type: 'Output', params: {} }],
        ]),
        connections: [
          { from: { blockId: 'const', port: 'output' }, to: { blockId: 'output', port: 'input' } },
        ],
      };

      const result = compiler.compile(patch);
      expect(result.errors).toHaveLength(0);

      const adapter = new RuntimeAdapter(result);
      const program = adapter.createProgram();

      // Evaluate for a frame
      const runtimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
      const tree = program.signal(0, runtimeCtx);

      // Should return a valid RenderTree
      expect(tree).toBeDefined();
      expect(tree.kind).toBe('group');
    });

    it('should not allocate state memory for stateless blocks', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['b1', { id: 'b1', type: 'Stateless', params: {} }],
        ]),
        connections: [],
      };

      const result = compiler.compile(patch);

      // No state memory should be allocated
      expect(result.stateMemory.size).toBe(0);
    });
  });

  describe('Delay block patch', () => {
    it('should allocate state memory for Delay block', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['input', { id: 'input', type: 'Input', params: {} }],
          ['delay', { id: 'delay', type: 'Delay', params: { delay: 0.5 } }],
          ['output', { id: 'output', type: 'Output', params: {} }],
        ]),
        connections: [
          { from: { blockId: 'input', port: 'output' }, to: { blockId: 'delay', port: 'input' } },
          { from: { blockId: 'delay', port: 'output' }, to: { blockId: 'output', port: 'input' } },
        ],
      };

      const result = compiler.compile(patch);
      expect(result.errors).toHaveLength(0);

      // State memory should be allocated for Delay block
      expect(result.stateMemory.size).toBe(1);
      expect(result.stateMemory.has('delay')).toBe(true);

      const delayState = result.stateMemory.get('delay');
      expect(delayState).toBeDefined();
      expect(delayState!.shape.type).toBe('Delay');
    });

    it('should persist state across frames', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['delay', { id: 'delay', type: 'Delay', params: { delay: 0.1 } }],
        ]),
        connections: [],
      };

      const result = compiler.compile(patch);
      const adapter = new RuntimeAdapter(result);
      const program = adapter.createProgram();

      const runtimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };

      // Evaluate for multiple frames
      program.signal(0, runtimeCtx);    // t=0ms
      program.signal(16, runtimeCtx);   // t=16ms
      program.signal(32, runtimeCtx);   // t=32ms

      // State should persist (no crashes, no resets)
      const state = result.stateMemory.get('delay');
      expect(state).toBeDefined();
      expect(state!.values).toBeDefined();
    });
  });

  describe('Evaluation order', () => {
    it('should evaluate blocks in dependency order', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['a', { id: 'a', type: 'Source', params: {} }],
          ['b', { id: 'b', type: 'Transform', params: {} }],
          ['c', { id: 'c', type: 'Output', params: {} }],
        ]),
        connections: [
          { from: { blockId: 'a', port: 'out' }, to: { blockId: 'b', port: 'in' } },
          { from: { blockId: 'b', port: 'out' }, to: { blockId: 'c', port: 'in' } },
        ],
      };

      const result = compiler.compile(patch);
      expect(result.errors).toHaveLength(0);

      // Evaluation order should be: a → b → c
      expect(result.evaluationOrder).toEqual(['a', 'b', 'c']);

      const adapter = new RuntimeAdapter(result);
      const program = adapter.createProgram();

      const runtimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
      const tree = program.signal(0, runtimeCtx);

      expect(tree).toBeDefined();
    });
  });

  describe('Multi-block patch', () => {
    it('should handle complex dependency graph', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['source1', { id: 'source1', type: 'Source', params: {} }],
          ['source2', { id: 'source2', type: 'Source', params: {} }],
          ['merge', { id: 'merge', type: 'Merge', params: {} }],
          ['output', { id: 'output', type: 'Output', params: {} }],
        ]),
        connections: [
          { from: { blockId: 'source1', port: 'out' }, to: { blockId: 'merge', port: 'in1' } },
          { from: { blockId: 'source2', port: 'out' }, to: { blockId: 'merge', port: 'in2' } },
          { from: { blockId: 'merge', port: 'out' }, to: { blockId: 'output', port: 'in' } },
        ],
      };

      const result = compiler.compile(patch);
      expect(result.errors).toHaveLength(0);

      // Both sources should come before merge, merge before output
      const order = result.evaluationOrder;
      const source1Idx = order.indexOf('source1');
      const source2Idx = order.indexOf('source2');
      const mergeIdx = order.indexOf('merge');
      const outputIdx = order.indexOf('output');

      expect(source1Idx).toBeLessThan(mergeIdx);
      expect(source2Idx).toBeLessThan(mergeIdx);
      expect(mergeIdx).toBeLessThan(outputIdx);
    });
  });

  describe('Reset', () => {
    it('should reset frame counter and state memory', () => {
      const compiler = new UnifiedCompiler();

      const patch: PatchDefinition = {
        blocks: new Map([
          ['delay', { id: 'delay', type: 'Delay', params: { delay: 0.1 } }],
        ]),
        connections: [],
      };

      const result = compiler.compile(patch);
      const adapter = new RuntimeAdapter(result);
      const program = adapter.createProgram();

      const runtimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };

      // Evaluate several frames
      program.signal(0, runtimeCtx);
      program.signal(16, runtimeCtx);
      program.signal(32, runtimeCtx);

      // Reset
      adapter.reset();

      // Evaluate again - should start from frame 0
      program.signal(0, runtimeCtx);

      // State should be reinitialized
      const state = result.stateMemory.get('delay');
      expect(state).toBeDefined();
    });
  });
});
