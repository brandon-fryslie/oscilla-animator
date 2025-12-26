/**
 * @file BroadcastReduce Tests
 * @description Tests for Field ↔ Signal bridge operations
 */

import { describe, it, expect } from 'vitest';
import {
  evalReduceFieldToSig,
  reduceSum,
  reduceAverage,
  reduceMin,
  reduceMax,
  type ReduceNode,
} from '../BroadcastReduce';
import { createFieldHandleCache } from '../FieldHandle';
import { FieldBufferPool } from '../BufferPool';
import type {
  FieldExprIR,
  FieldEnv,
  SlotHandles,
  FieldHandle,
  InputSlot,
} from '../types';
import { numberType } from '../types';
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
    sigEnv: {},
    sigNodes: [],
    constants,
    sources,
    getDomainCount: (_domainId: number) => opts?.domainCount ?? 10,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('BroadcastReduce - Reduce Operations', () => {
  describe('sum', () => {
    it('computes sum of all field elements', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([1, 2, 3, 4, 5]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 5,
      });
      env.fieldNodes = nodes;

      const node: ReduceNode = {
        kind: 'reduce',
        fieldId: 0,
        domainId: 0,
        reduceFn: 'sum',
      };

      const result = evalReduceFieldToSig(node, env);

      expect(result).toBe(15); // 1 + 2 + 3 + 4 + 5 = 15
    });

    it('handles empty domain (sum = 0)', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 0,
      });
      env.fieldNodes = nodes;

      const node: ReduceNode = {
        kind: 'reduce',
        fieldId: 0,
        domainId: 0,
        reduceFn: 'sum',
      };

      const result = evalReduceFieldToSig(node, env);

      expect(result).toBe(0);
    });

    it('helper function reduceSum works correctly', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([10, 20, 30]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 3,
      });
      env.fieldNodes = nodes;

      const result = reduceSum(0, 0, env);

      expect(result).toBe(60);
    });
  });

  describe('average', () => {
    it('computes average of all field elements', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([10, 20, 30]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 3,
      });
      env.fieldNodes = nodes;

      const node: ReduceNode = {
        kind: 'reduce',
        fieldId: 0,
        domainId: 0,
        reduceFn: 'average',
      };

      const result = evalReduceFieldToSig(node, env);

      expect(result).toBe(20); // (10 + 20 + 30) / 3 = 20
    });

    it('handles empty domain (average = 0)', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 0,
      });
      env.fieldNodes = nodes;

      const node: ReduceNode = {
        kind: 'reduce',
        fieldId: 0,
        domainId: 0,
        reduceFn: 'average',
      };

      const result = evalReduceFieldToSig(node, env);

      expect(result).toBe(0);
    });

    it('handles single element', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([42]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 1,
      });
      env.fieldNodes = nodes;

      const result = reduceAverage(0, 0, env);

      expect(result).toBe(42);
    });

    it('helper function reduceAverage works correctly', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([5, 10, 15, 20]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 4,
      });
      env.fieldNodes = nodes;

      const result = reduceAverage(0, 0, env);

      expect(result).toBe(12.5); // (5 + 10 + 15 + 20) / 4 = 12.5
    });
  });

  describe('min', () => {
    it('computes minimum of all field elements', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([10, -5, 30, 2, 100]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 5,
      });
      env.fieldNodes = nodes;

      const node: ReduceNode = {
        kind: 'reduce',
        fieldId: 0,
        domainId: 0,
        reduceFn: 'min',
      };

      const result = evalReduceFieldToSig(node, env);

      expect(result).toBe(-5);
    });

    it('handles all same values', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([7, 7, 7, 7]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 4,
      });
      env.fieldNodes = nodes;

      const result = reduceMin(0, 0, env);

      expect(result).toBe(7);
    });

    it('handles empty domain (min = Infinity)', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 0,
      });
      env.fieldNodes = nodes;

      const result = reduceMin(0, 0, env);

      expect(result).toBe(Infinity);
    });

    it('helper function reduceMin works correctly', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([3, 1, 4, 1, 5, 9]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 6,
      });
      env.fieldNodes = nodes;

      const result = reduceMin(0, 0, env);

      expect(result).toBe(1);
    });
  });

  describe('max', () => {
    it('computes maximum of all field elements', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([10, -5, 30, 2, 100]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 5,
      });
      env.fieldNodes = nodes;

      const node: ReduceNode = {
        kind: 'reduce',
        fieldId: 0,
        domainId: 0,
        reduceFn: 'max',
      };

      const result = evalReduceFieldToSig(node, env);

      expect(result).toBe(100);
    });

    it('handles all same values', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([7, 7, 7, 7]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 4,
      });
      env.fieldNodes = nodes;

      const result = reduceMax(0, 0, env);

      expect(result).toBe(7);
    });

    it('handles empty domain (max = -Infinity)', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 0,
      });
      env.fieldNodes = nodes;

      const result = reduceMax(0, 0, env);

      expect(result).toBe(-Infinity);
    });

    it('helper function reduceMax works correctly', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'source', type: numberType, sourceTag: 'testSource', domainId: 0 },
      ];

      const sourceData = new Float32Array([3, 1, 4, 1, 5, 9]);
      const env = createTestMaterializerEnv({
        sources: { testSource: sourceData },
        domainCount: 6,
      });
      env.fieldNodes = nodes;

      const result = reduceMax(0, 0, env);

      expect(result).toBe(9);
    });
  });

  describe('integration', () => {
    it('reduces const field correctly', () => {
      const nodes: FieldExprIR[] = [
        { kind: 'const', type: numberType, constId: 0 },
      ];

      const env = createTestMaterializerEnv({
        constants: [42],
        domainCount: 100,
      });
      env.fieldNodes = nodes;

      const sum = reduceSum(0, 0, env);
      const avg = reduceAverage(0, 0, env);
      const min = reduceMin(0, 0, env);
      const max = reduceMax(0, 0, env);

      expect(sum).toBe(4200); // 42 * 100
      expect(avg).toBe(42);
      expect(min).toBe(42);
      expect(max).toBe(42);
    });

    it('reduces computed field (zip) correctly', () => {
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

      // Reduce the sum field [11, 22, 33]
      const sum = reduceSum(2, 0, env);

      expect(sum).toBe(66); // 11 + 22 + 33 = 66
    });
  });
});
