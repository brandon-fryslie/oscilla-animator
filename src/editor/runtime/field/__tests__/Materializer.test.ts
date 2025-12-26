/**
 * @file Materializer Tests
 * @description Tests for field materialization (NOT just handle evaluation)
 */

import { describe, it, expect } from 'vitest';
import { materialize, FieldMaterializer, type MaterializerEnv, type ConstantsTable, type SourceFields } from '../Materializer';
import { createFieldHandleCache } from '../FieldHandle';
import { FieldBufferPool } from '../BufferPool';
import type {
  FieldExprIR,
  FieldEnv,
  SlotHandles,
  FieldHandle,
  InputSlot,
  MaterializationRequest,
} from '../types';
import { numberType } from '../types';

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

// =============================================================================
// Tests
// =============================================================================

describe('Materializer', () => {
  it('materializes const to uniform array', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
    ];

    const env = createTestMaterializerEnv({ constants: [42], domainCount: 5 });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(5);
    expect(buffer[0]).toBe(42);
    expect(buffer[1]).toBe(42);
    expect(buffer[2]).toBe(42);
    expect(buffer[3]).toBe(42);
    expect(buffer[4]).toBe(42);
  });

  it('caches materialized buffers', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
    ];

    const env = createTestMaterializerEnv({ constants: [42], domainCount: 5 });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer1 = materialize(request, env);
    const buffer2 = materialize(request, env);

    // Same request -> same buffer instance (cached)
    expect(buffer1).toBe(buffer2);
  });

  it('produces different buffers for different cache keys', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
    ];

    const env = createTestMaterializerEnv({ constants: [42], domainCount: 5 });
    env.fieldNodes = nodes;

    const request1: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test1',
    };

    const request2: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f64',  // Different format
      layout: 'scalar',
      usageTag: 'test2',
    };

    const buffer1 = materialize(request1, env);
    const buffer2 = materialize(request2, env);

    // Different format -> different buffer
    expect(buffer1).not.toBe(buffer2);
  });

  it('materializes source field correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
    ];

    const sourceData = new Float32Array([1, 2, 3, 4, 5]);
    const env = createTestMaterializerEnv({
      sources: { testSource: sourceData },
      domainCount: 5,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(5);
    expect(Array.from(buffer)).toEqual([1, 2, 3, 4, 5]);
  });

  it('throws when source field is missing', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'missing', domainId: 0 },
    ];

    const env = createTestMaterializerEnv({ domainCount: 5 });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    expect(() => materialize(request, env)).toThrow('Source field not found');
  });

  it('broadcasts signal value to all elements', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'sampleSignal', type: numberType, signalSlot: 0, domainId: 0 },
    ];

    const env = createTestMaterializerEnv({ domainCount: 5 });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    // All elements should have same value (broadcast)
    expect(buffer.length).toBe(5);
    expect(buffer[0]).toBe(buffer[1]);
    expect(buffer[1]).toBe(buffer[2]);
    expect(buffer[2]).toBe(buffer[3]);
    expect(buffer[3]).toBe(buffer[4]);
  });

  // P0-3 Tests: Op and Zip operations

  it('materializes Op (negate) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },  // [5, 5, 5]
      { kind: 'map', type: numberType, fn: { opcode: 'negate' }, src: 0 },  // [-5, -5, -5]
    ];

    const env = createTestMaterializerEnv({ constants: [5], domainCount: 3 });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 1,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([-5, -5, -5]);
  });

  it('materializes Op (abs) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      { kind: 'map', type: numberType, fn: { opcode: 'abs' }, src: 0 },
    ];

    const sourceData = new Float32Array([-1, -2, 3, -4, 5]);
    const env = createTestMaterializerEnv({
      sources: { testSource: sourceData },
      domainCount: 5,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 1,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(5);
    expect(Array.from(buffer)).toEqual([1, 2, 3, 4, 5]);
  });

  it('materializes Zip (Add) element-wise', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'zip', type: numberType, fn: { opcode: 'Add' }, a: 0, b: 1 },
    ];

    const sourceA = new Float32Array([1, 2, 3]);
    const sourceB = new Float32Array([10, 20, 30]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([11, 22, 33]);
  });

  it('materializes Zip (Mul) element-wise', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'zip', type: numberType, fn: { opcode: 'Mul' }, a: 0, b: 1 },
    ];

    const sourceA = new Float32Array([2, 3, 4]);
    const sourceB = new Float32Array([10, 10, 10]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([20, 30, 40]);
  });

  it('materializes Zip (Min) element-wise', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'zip', type: numberType, fn: { opcode: 'Min' }, a: 0, b: 1 },
    ];

    const sourceA = new Float32Array([1, 20, 3]);
    const sourceB = new Float32Array([10, 2, 30]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([1, 2, 3]);
  });

  // P0-5 Tests: Combine operations

  it('materializes Combine (sum) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testC', domainId: 0 },
      { kind: 'busCombine', type: numberType, combine: { mode: 'sum' }, terms: [0, 1, 2] },
    ];

    const sourceA = new Float32Array([1, 2, 3]);
    const sourceB = new Float32Array([10, 20, 30]);
    const sourceC = new Float32Array([100, 200, 300]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB, testC: sourceC },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 3,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([111, 222, 333]);
  });

  it('materializes Combine (average) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'busCombine', type: numberType, combine: { mode: 'average' }, terms: [0, 1] },
    ];

    const sourceA = new Float32Array([10, 20, 30]);
    const sourceB = new Float32Array([20, 40, 60]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([15, 30, 45]);
  });

  it('materializes Combine (min) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'busCombine', type: numberType, combine: { mode: 'min' }, terms: [0, 1] },
    ];

    const sourceA = new Float32Array([1, 20, 3]);
    const sourceB = new Float32Array([10, 2, 30]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([1, 2, 3]);
  });

  it('materializes Combine (max) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'busCombine', type: numberType, combine: { mode: 'max' }, terms: [0, 1] },
    ];

    const sourceA = new Float32Array([1, 20, 3]);
    const sourceB = new Float32Array([10, 2, 30]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([10, 20, 30]);
  });

  it('materializes Combine (last) correctly', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: numberType, sourceTag: 'testA', domainId: 0 },
      { kind: 'source', type: numberType, sourceTag: 'testB', domainId: 0 },
      { kind: 'busCombine', type: numberType, combine: { mode: 'last' }, terms: [0, 1] },
    ];

    const sourceA = new Float32Array([1, 2, 3]);
    const sourceB = new Float32Array([10, 20, 30]);
    const env = createTestMaterializerEnv({
      sources: { testA: sourceA, testB: sourceB },
      domainCount: 3,
    });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([10, 20, 30]);  // Last term (testB) wins
  });

  it('materializes Combine with empty terms to zeros', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'busCombine', type: numberType, combine: { mode: 'sum' }, terms: [] },
    ];

    const env = createTestMaterializerEnv({ domainCount: 3 });
    env.fieldNodes = nodes;

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    const buffer = materialize(request, env) as Float32Array;

    expect(buffer.length).toBe(3);
    expect(Array.from(buffer)).toEqual([0, 0, 0]);
  });
});

describe('FieldMaterializer', () => {
  it('releases buffers on releaseFrame', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
    ];

    const env = createTestMaterializerEnv({ constants: [42], domainCount: 5 });
    env.fieldNodes = nodes;

    const materializer = new FieldMaterializer(env);

    const request: MaterializationRequest = {
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test',
    };

    // Materialize
    const buffer1 = materializer.materialize(request);

    // Check pool stats
    expect(env.pool.getStats()).toEqual({ pooled: 0, inUse: 1 });

    // Release frame
    materializer.releaseFrame();

    // Buffer should be back in pool
    expect(env.pool.getStats()).toEqual({ pooled: 1, inUse: 0 });

    // Next materialization should reuse buffer
    const buffer2 = materializer.materialize(request);

    // Should get same buffer from pool
    expect(buffer1).toBe(buffer2);
  });
});
