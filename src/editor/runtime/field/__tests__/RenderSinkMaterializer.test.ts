/**
 * @file RenderSinkMaterializer Tests
 * @description Tests for render sink materialization
 */

import { describe, it, expect } from 'vitest';
import {
  executeRenderSink,
  createRenderSinkPlan,
  type RenderSinkIR,
  type RenderEnv,
} from '../RenderSinkMaterializer';
import { createFieldHandleCache } from '../FieldHandle';
import { FieldBufferPool } from '../BufferPool';
import type {
  FieldExprIR,
  FieldEnv,
  SlotHandles,
  FieldHandle,
  InputSlot,
} from '../types';
import { numberType, vec2Type } from '../types';
import type { MaterializerEnv, ConstantsTable, SourceFields } from '../Materializer';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test materializer environment
 */
function createTestMaterializerEnv(opts?: {
  constants?: number[];
  sources?: Record<string, ArrayBufferView>;
  domainCount?: number;
}): MaterializerEnv {
  const cache = createFieldHandleCache();

  const slotHandles: SlotHandles = {
    read(_slot: InputSlot): FieldHandle {
      return { kind: 'Const', constId: 0, type: numberType };
    },
  };

  const fieldEnv: FieldEnv = {
    slotHandles,
    cache,
    domainId: 0,
  };

  const constants: ConstantsTable = {
    get(constId: number): number {
      return opts?.constants?.[constId] ?? 0;
    },
  };

  const sources: SourceFields = {
    get(sourceTag: string): ArrayBufferView | undefined {
      return opts?.sources?.[sourceTag];
    },
  };

  return {
    pool: new FieldBufferPool(),
    cache: new Map(),
    fieldEnv,
    fieldNodes: [],
    sigEnv: { time: 0 },
    sigNodes: [],
    constants,
    sources,
    getDomainCount: (_domainId: number) => opts?.domainCount ?? 10,
  };
}

/**
 * Create a test render environment
 */
function createTestRenderEnv(opts?: {
  constants?: number[];
  sources?: Record<string, ArrayBufferView>;
  domainCount?: number;
}): RenderEnv {
  return {
    materializerEnv: createTestMaterializerEnv(opts),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('RenderSinkMaterializer', () => {
  describe('createRenderSinkPlan', () => {
    it('creates plan with correct requests', () => {
      const sink: RenderSinkIR = {
        sinkType: 'instances2d',
        domainId: 0,
        fieldInputs: {
          pos: 0,
          size: 1,
          fill: 2,
        },
        signalUniforms: {},
      };

      const plan = createRenderSinkPlan(sink);

      expect(plan.requests).toHaveLength(3);

      // Check position request
      const posReq = plan.requests.find(req => req.usageTag === 'pos');
      expect(posReq).toBeDefined();
      expect(posReq?.fieldId).toBe(0);
      expect(posReq?.format).toBe('vec2f32');
      expect(posReq?.layout).toBe('vec2');

      // Check size request
      const sizeReq = plan.requests.find(req => req.usageTag === 'size');
      expect(sizeReq).toBeDefined();
      expect(sizeReq?.fieldId).toBe(1);
      expect(sizeReq?.format).toBe('f32');
      expect(sizeReq?.layout).toBe('scalar');

      // Check fill request
      const fillReq = plan.requests.find(req => req.usageTag === 'fill');
      expect(fillReq).toBeDefined();
      expect(fillReq?.fieldId).toBe(2);
      expect(fillReq?.format).toBe('rgba8');
      expect(fillReq?.layout).toBe('color');
    });

    it('handles empty field inputs', () => {
      const sink: RenderSinkIR = {
        sinkType: 'empty',
        domainId: 0,
        fieldInputs: {},
        signalUniforms: {},
      };

      const plan = createRenderSinkPlan(sink);

      expect(plan.requests).toHaveLength(0);
    });
  });

  describe('executeRenderSink', () => {
    it('materializes all field buffers', () => {
      // Setup: Create field nodes
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: vec2Type, sourceTag: 'positions', domainId: 0 },
        { kind: 'const', type: numberType, constId: 0 }, // size = 10
        { kind: 'source', type: numberType, sourceTag: 'colors', domainId: 0 },
      ];

      const positionsData = new Float32Array([
        0, 0,    // pos 0
        1, 1,    // pos 1
        2, 2,    // pos 2
      ]);

      const colorsData = new Float32Array([1.0, 0.5, 0.0]);

      const env = createTestRenderEnv({
        constants: [10],
        sources: { positions: positionsData, colors: colorsData },
        domainCount: 3,
      });
      env.materializerEnv.fieldNodes = nodes;

      // Create sink
      const sink: RenderSinkIR = {
        sinkType: 'instances2d',
        domainId: 0,
        fieldInputs: {
          pos: 0,
          size: 1,
          fill: 2,
        },
        signalUniforms: {},
      };

      const plan = createRenderSinkPlan(sink);

      // Execute
      const output = executeRenderSink(sink, plan, env);

      // Verify output structure
      expect(output.kind).toBe('instances2d');
      expect(output.instanceCount).toBe(3);
      expect(Object.keys(output.buffers)).toHaveLength(3);
      expect(output.buffers.pos).toBeDefined();
      expect(output.buffers.size).toBeDefined();
      expect(output.buffers.fill).toBeDefined();
    });

    it('evaluates signal uniforms', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'const', type: numberType, constId: 0 },
      ];

      const env = createTestRenderEnv({
        constants: [1.0],
        domainCount: 5,
      });
      env.materializerEnv.fieldNodes = nodes;

      const sink: RenderSinkIR = {
        sinkType: 'test',
        domainId: 0,
        fieldInputs: {
          data: 0,
        },
        signalUniforms: {
          opacity: 0,
          scale: 1,
        },
      };

      const plan = createRenderSinkPlan(sink);
      const output = executeRenderSink(sink, plan, env);

      // Verify uniforms are present
      expect(output.uniforms).toBeDefined();
      expect(output.uniforms.opacity).toBeDefined();
      expect(output.uniforms.scale).toBeDefined();
    });

    it('produces correct instance count', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'const', type: numberType, constId: 0 },
      ];

      const env = createTestRenderEnv({
        constants: [1.0],
        domainCount: 42,
      });
      env.materializerEnv.fieldNodes = nodes;

      const sink: RenderSinkIR = {
        sinkType: 'test',
        domainId: 0,
        fieldInputs: {
          data: 0,
        },
        signalUniforms: {},
      };

      const plan = createRenderSinkPlan(sink);
      const output = executeRenderSink(sink, plan, env);

      expect(output.instanceCount).toBe(42);
    });

    it('handles sink with no uniforms', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'const', type: numberType, constId: 0 },
      ];

      const env = createTestRenderEnv({
        constants: [1.0],
        domainCount: 5,
      });
      env.materializerEnv.fieldNodes = nodes;

      const sink: RenderSinkIR = {
        sinkType: 'test',
        domainId: 0,
        fieldInputs: {
          data: 0,
        },
        signalUniforms: {},
      };

      const plan = createRenderSinkPlan(sink);
      const output = executeRenderSink(sink, plan, env);

      expect(output.uniforms).toEqual({});
    });

    it('produces buffer with correct data', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testData', domainId: 0 },
      ];

      const testData = new Float32Array([1, 2, 3, 4, 5]);
      const env = createTestRenderEnv({
        sources: { testData },
        domainCount: 5,
      });
      env.materializerEnv.fieldNodes = nodes;

      const sink: RenderSinkIR = {
        sinkType: 'test',
        domainId: 0,
        fieldInputs: {
          myData: 0,
        },
        signalUniforms: {},
      };

      const plan = createRenderSinkPlan(sink);
      const output = executeRenderSink(sink, plan, env);

      // Verify buffer contents
      const buffer = output.buffers.myData as Float32Array;
      expect(Array.from(buffer)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('integration', () => {
    it('full pipeline: plan -> execute -> render output', () => {
      // Create a realistic scenario: grid of circles with varying sizes
      const nodes: FieldExprIR[] = [
        // Field 0: positions from source
        { kind: 'source', type: vec2Type, sourceTag: 'gridPositions', domainId: 0 },
        // Field 1: sizes from source
        { kind: 'source', type: numberType, sourceTag: 'circleSizes', domainId: 0 },
        // Field 2: constant color
        { kind: 'const', type: numberType, constId: 0 },
      ];

      const positions = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1,
      ]);

      const sizes = new Float32Array([10, 20, 15, 25]);

      const env = createTestRenderEnv({
        constants: [0.5], // color value
        sources: { gridPositions: positions, circleSizes: sizes },
        domainCount: 4,
      });
      env.materializerEnv.fieldNodes = nodes;

      // Define sink
      const sink: RenderSinkIR = {
        sinkType: 'circles',
        domainId: 0,
        fieldInputs: {
          position: 0,
          radius: 1,
          color: 2,
        },
        signalUniforms: {
          globalOpacity: 0,
        },
      };

      // Create plan
      const plan = createRenderSinkPlan(sink);

      // Execute
      const output = executeRenderSink(sink, plan, env);

      // Verify
      expect(output.kind).toBe('circles');
      expect(output.instanceCount).toBe(4);
      expect(Object.keys(output.buffers)).toHaveLength(3);

      // Check position buffer
      const posBuffer = output.buffers.position as Float32Array;
      expect(posBuffer.length).toBe(8); // 4 vec2s
      expect(Array.from(posBuffer)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);

      // Check radius buffer
      const radiusBuffer = output.buffers.radius as Float32Array;
      expect(radiusBuffer.length).toBe(4);
      expect(Array.from(radiusBuffer)).toEqual([10, 20, 15, 25]);

      // Check uniforms
      expect(output.uniforms.globalOpacity).toBeDefined();
    });
  });
});
