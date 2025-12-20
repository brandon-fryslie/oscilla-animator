/**
 * @file FieldExpr.test.ts - Tests for FieldExpr system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateFieldExpr,
  batchEvaluateFieldExpr,
  mapFieldExpr,
  zipFieldExpr,
  constFieldExpr,
  sourceFieldExpr,
  getFieldExprDomain,
  functionRegistry,
  createFieldExprCtx,
  type FieldExpr,
  type FieldExprCtx,
} from '../FieldExpr';
import { createSimpleDomain, type Domain } from '../Domain';
import { TimeCtxFactory } from '../TimeCtx';

describe('FieldExpr', () => {
  let domain: Domain;
  let evalCtx: FieldExprCtx;

  beforeEach(() => {
    domain = createSimpleDomain('test', 3);
    evalCtx = createFieldExprCtx();
  });

  describe('constFieldExpr', () => {
    it('should return constant value for all elements', () => {
      const expr = constFieldExpr(42, domain);
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const result = evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      expect(result).toBe(42);

      const result2 = evaluateFieldExpr(expr, '1', timeCtx, evalCtx);
      expect(result2).toBe(42);
    });

    it('should work with object values', () => {
      const point = { x: 10, y: 20 };
      const expr = constFieldExpr(point, domain);
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const result = evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      expect(result).toEqual(point);
    });
  });

  describe('sourceFieldExpr', () => {
    it('should read from source artifact array', () => {
      const sourceData = [10, 20, 30];
      evalCtx.artifacts.set('source1', sourceData);

      const expr = sourceFieldExpr<number>('source1', domain);
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      expect(evaluateFieldExpr(expr, '0', timeCtx, evalCtx)).toBe(10);
      expect(evaluateFieldExpr(expr, '1', timeCtx, evalCtx)).toBe(20);
      expect(evaluateFieldExpr(expr, '2', timeCtx, evalCtx)).toBe(30);
    });

    it('should throw if source not found', () => {
      const expr = sourceFieldExpr<number>('missing', domain);
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      expect(() => {
        evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      }).toThrow('Source artifact not found');
    });
  });

  describe('mapFieldExpr', () => {
    beforeEach(() => {
      // Register test functions
      functionRegistry.register('double', (...args: unknown[]) => {
        return (args[0] as number) * 2;
      });
      functionRegistry.register('addParam', (...args: unknown[]) => {
        const x = args[0] as number;
        const params = args[1] as Record<string, unknown> | undefined;
        const offset = (params?.offset as number) ?? 0;
        return x + offset;
      });
    });

    it('should apply function to source values', () => {
      const source = constFieldExpr(5, domain);
      const expr = mapFieldExpr(source, 'double');
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const result = evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      expect(result).toBe(10);
    });

    it('should pass params to function', () => {
      const source = constFieldExpr(10, domain);
      const expr = mapFieldExpr(source, 'addParam', { offset: 5 });
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const result = evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      expect(result).toBe(15);
    });

    it('should compose multiple maps', () => {
      const source = constFieldExpr(3, domain);
      const doubled = mapFieldExpr(source, 'double');
      const offset = mapFieldExpr(doubled, 'addParam', { offset: 1 });
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const result = evaluateFieldExpr(offset, '0', timeCtx, evalCtx);
      expect(result).toBe(7); // (3 * 2) + 1
    });

    it('should throw if function not registered', () => {
      const source = constFieldExpr(5, domain);
      const expr = mapFieldExpr(source, 'unknownFn');
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      expect(() => {
        evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      }).toThrow('Function not found');
    });
  });

  describe('zipFieldExpr', () => {
    beforeEach(() => {
      functionRegistry.register('add', (...args: unknown[]) =>
        (args[0] as number) + (args[1] as number)
      );
      functionRegistry.register('makePoint', (...args: unknown[]) => ({
        x: args[0] as number,
        y: args[1] as number,
      }));
    });

    it('should combine two fields', () => {
      const a = constFieldExpr(10, domain);
      const b = constFieldExpr(5, domain);
      const expr = zipFieldExpr(a, b, 'add');
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const result = evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      expect(result).toBe(15);
    });

    it('should work with different source types', () => {
      evalCtx.artifacts.set('xValues', [1, 2, 3]);
      evalCtx.artifacts.set('yValues', [10, 20, 30]);

      const xField = sourceFieldExpr<number>('xValues', domain);
      const yField = sourceFieldExpr<number>('yValues', domain);
      const expr = zipFieldExpr(xField, yField, 'makePoint');
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      expect(evaluateFieldExpr(expr, '0', timeCtx, evalCtx)).toEqual({ x: 1, y: 10 });
      expect(evaluateFieldExpr(expr, '1', timeCtx, evalCtx)).toEqual({ x: 2, y: 20 });
      expect(evaluateFieldExpr(expr, '2', timeCtx, evalCtx)).toEqual({ x: 3, y: 30 });
    });
  });

  describe('batchEvaluateFieldExpr', () => {
    beforeEach(() => {
      functionRegistry.register('identity', (...args: unknown[]) => args[0]);
    });

    it('should evaluate for all elements in domain', () => {
      evalCtx.artifacts.set('data', [10, 20, 30]);
      const expr = sourceFieldExpr<number>('data', domain);
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const results = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(results).toEqual([10, 20, 30]);
    });

    it('should handle empty domain', () => {
      const emptyDomain = createSimpleDomain('empty', 0);
      const expr = constFieldExpr(42, emptyDomain);
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      const results = batchEvaluateFieldExpr(expr, emptyDomain, timeCtx, evalCtx);

      expect(results).toEqual([]);
    });

    it('should clear memo cache between frames', () => {
      let callCount = 0;
      functionRegistry.register('countCalls', (...args: unknown[]) => {
        callCount++;
        return args[0];
      });

      const expr = mapFieldExpr(constFieldExpr(1, domain), 'countCalls');

      // Frame 0 - should call function 3 times (once per element)
      const timeCtx0 = TimeCtxFactory.forPerformance(0, 0, 0);
      batchEvaluateFieldExpr(expr, domain, timeCtx0, evalCtx);
      expect(callCount).toBe(3);

      // Frame 1 - should call function again (cache cleared)
      callCount = 0;
      const timeCtx1 = TimeCtxFactory.forPerformance(0.016, 0.016, 1);
      batchEvaluateFieldExpr(expr, domain, timeCtx1, evalCtx);
      expect(callCount).toBe(3);
    });
  });

  describe('Memoization', () => {
    let callCount = 0;

    beforeEach(() => {
      callCount = 0;
      functionRegistry.register('expensive', (...args: unknown[]) => {
        callCount++;
        return (args[0] as number) * 2;
      });
      functionRegistry.register('getCallCount', () => callCount);
    });

    it('should cache results within same frame', () => {
      const expr = mapFieldExpr(constFieldExpr(5, domain), 'expensive');
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      // First evaluation
      evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      const callCountAfterFirst = functionRegistry.get('getCallCount')!() as number;

      // Second evaluation - should use cache
      evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      const callCountAfterSecond = functionRegistry.get('getCallCount')!() as number;

      expect(callCountAfterFirst).toBe(callCountAfterSecond);
    });

    it('should not cache across different elements', () => {
      evalCtx.artifacts.set('source', [1, 2, 3]);
      const expr = mapFieldExpr(sourceFieldExpr('source', domain), 'expensive');
      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);

      evaluateFieldExpr(expr, '0', timeCtx, evalCtx);
      const callCountAfterFirst = functionRegistry.get('getCallCount')!() as number;

      evaluateFieldExpr(expr, '1', timeCtx, evalCtx);
      const callCountAfterSecond = functionRegistry.get('getCallCount')!() as number;

      // Should have called function twice (different elements)
      expect(callCountAfterSecond).toBeGreaterThan(callCountAfterFirst);
    });
  });

  describe('getFieldExprDomain', () => {
    it('should return domain from const expr', () => {
      const expr = constFieldExpr(42, domain);
      expect(getFieldExprDomain(expr)).toBe(domain);
    });

    it('should return domain from source expr', () => {
      const expr = sourceFieldExpr('test', domain);
      expect(getFieldExprDomain(expr)).toBe(domain);
    });

    it('should return domain from map expr (via source)', () => {
      functionRegistry.register('fn', (...args: unknown[]) => args[0]);
      const source = sourceFieldExpr('test', domain);
      const expr = mapFieldExpr(source, 'fn');
      expect(getFieldExprDomain(expr)).toBe(domain);
    });

    it('should return domain from zip expr', () => {
      const a = constFieldExpr(1, domain);
      const b = constFieldExpr(2, domain);
      functionRegistry.register('zipFn', (...args: unknown[]) => [args[0], args[1]]);
      const expr = zipFieldExpr(a, b, 'zipFn');
      expect(getFieldExprDomain(expr)).toBe(domain);
    });
  });

  describe('Bus combine modes', () => {
    it('should combine with sum mode', () => {
      const pub1 = constFieldExpr(10, domain);
      const pub2 = constFieldExpr(5, domain);
      const pub3 = constFieldExpr(3, domain);

      const busExpr: FieldExpr<number> = {
        kind: 'bus',
        busId: 'testBus',
        publishers: [pub1, pub2, pub3],
        combineMode: 'sum',
        domain,
      };

      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);
      const result = evaluateFieldExpr(busExpr, '0', timeCtx, evalCtx);

      expect(result).toBe(18); // 10 + 5 + 3
    });

    it('should combine with average mode', () => {
      const pub1 = constFieldExpr(10, domain);
      const pub2 = constFieldExpr(20, domain);

      const busExpr: FieldExpr<number> = {
        kind: 'bus',
        busId: 'testBus',
        publishers: [pub1, pub2],
        combineMode: 'average',
        domain,
      };

      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);
      const result = evaluateFieldExpr(busExpr, '0', timeCtx, evalCtx);

      expect(result).toBe(15); // (10 + 20) / 2
    });

    it('should combine with last mode', () => {
      const pub1 = constFieldExpr(10, domain);
      const pub2 = constFieldExpr(20, domain);
      const pub3 = constFieldExpr(30, domain);

      const busExpr: FieldExpr<number> = {
        kind: 'bus',
        busId: 'testBus',
        publishers: [pub1, pub2, pub3],
        combineMode: 'last',
        domain,
      };

      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);
      const result = evaluateFieldExpr(busExpr, '0', timeCtx, evalCtx);

      expect(result).toBe(30); // Last publisher wins
    });

    it('should combine with max mode', () => {
      const pub1 = constFieldExpr(10, domain);
      const pub2 = constFieldExpr(25, domain);
      const pub3 = constFieldExpr(15, domain);

      const busExpr: FieldExpr<number> = {
        kind: 'bus',
        busId: 'testBus',
        publishers: [pub1, pub2, pub3],
        combineMode: 'max',
        domain,
      };

      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);
      const result = evaluateFieldExpr(busExpr, '0', timeCtx, evalCtx);

      expect(result).toBe(25);
    });

    it('should combine with min mode', () => {
      const pub1 = constFieldExpr(10, domain);
      const pub2 = constFieldExpr(25, domain);
      const pub3 = constFieldExpr(15, domain);

      const busExpr: FieldExpr<number> = {
        kind: 'bus',
        busId: 'testBus',
        publishers: [pub1, pub2, pub3],
        combineMode: 'min',
        domain,
      };

      const timeCtx = TimeCtxFactory.forPerformance(0, 0, 0);
      const result = evaluateFieldExpr(busExpr, '0', timeCtx, evalCtx);

      expect(result).toBe(10);
    });
  });
});
