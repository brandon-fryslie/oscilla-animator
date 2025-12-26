/**
 * @file FlowFieldOrigin.test.ts - Unit tests for FlowFieldOriginBlock
 * @description Tests flow field position generation.
 */

import { describe, it, expect } from 'vitest';
import { createFlowFieldOriginExpr, FlowFieldOriginBlock } from '../blocks/FlowFieldOriginBlock';
import { createSimpleDomain } from '../Domain';
import { batchEvaluateFieldExpr, createFieldExprCtx } from '../FieldExpr';
import { TimeCtxFactory } from '../TimeCtx';

describe('FlowFieldOriginBlock', () => {
  describe('Block metadata', () => {
    it('should have correct type', () => {
      expect(FlowFieldOriginBlock.type).toBe('FlowFieldOrigin');
    });

    it('should expose createExpr function', () => {
      expect(typeof FlowFieldOriginBlock.createExpr).toBe('function');
    });
  });

  describe('Basic flow field generation', () => {
    it('should generate positions with flow field distortion', () => {
      const domain = createSimpleDomain('elements', 10);
      const expr = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 100,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(10);

      // Positions should not all be identical (flow field creates variation)
      const uniqueX = new Set(positions.map(p => Math.round(p.x)));
      expect(uniqueX.size).toBeGreaterThan(1);
    });

    it('should produce positions different from base grid', () => {
      const domain = createSimpleDomain('elements', 10);
      const expr = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 50,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // Base grid would have positions at multiples of 50
      // Flow field should distort these
      const firstPos = positions[0];

      // Should be near (0, 0) but not exactly at it due to flow
      expect(Math.abs(firstPos.x)).toBeGreaterThan(0);
      expect(Math.abs(firstPos.y)).toBeGreaterThan(0);
    });
  });

  describe('Seed determinism', () => {
    it('should produce identical positions for same seed', () => {
      const domain = createSimpleDomain('elements', 20);
      const seed = 12345;

      const expr1 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.02,
        flowStrength: 100,
        seed,
      });

      const expr2 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.02,
        flowStrength: 100,
        seed,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr1, domain, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr2, domain, timeCtx, evalCtx2);

      // Should be identical
      for (let i = 0; i < 20; i++) {
        expect(positions1[i].x).toBeCloseTo(positions2[i].x, 10);
        expect(positions1[i].y).toBeCloseTo(positions2[i].y, 10);
      }
    });

    it('should produce different positions for different seeds', () => {
      const domain = createSimpleDomain('elements', 10);

      const expr1 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.02,
        flowStrength: 100,
        seed: 111,
      });

      const expr2 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.02,
        flowStrength: 100,
        seed: 222,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr1, domain, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr2, domain, timeCtx, evalCtx2);

      // Should be different
      let differenceCount = 0;
      for (let i = 0; i < 10; i++) {
        if (Math.abs(positions1[i].x - positions2[i].x) > 0.01) {
          differenceCount++;
        }
      }

      expect(differenceCount).toBeGreaterThan(0);
    });
  });

  describe('Flow field properties', () => {
    it('should respect flowStrength parameter', () => {
      const domain = createSimpleDomain('elements', 5);

      const expr1 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 10, // Weak flow
        seed: 42,
      });

      const expr2 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 200, // Strong flow
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr1, domain, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr2, domain, timeCtx, evalCtx2);

      // Base grid position for element 0
      const baseX = 0;
      const baseY = 0;

      // Strong flow should create larger distortion
      const dist1 = Math.sqrt(
        (positions1[0].x - baseX) ** 2 + (positions1[0].y - baseY) ** 2
      );
      const dist2 = Math.sqrt(
        (positions2[0].x - baseX) ** 2 + (positions2[0].y - baseY) ** 2
      );

      expect(dist2).toBeGreaterThan(dist1);
    });

    it('should respect noiseScale parameter', () => {
      const domain = createSimpleDomain('elements', 20);

      const expr1 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.001, // Fine noise (slow variation)
        flowStrength: 100,
        seed: 42,
      });

      const expr2 = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.1, // Coarse noise (fast variation)
        flowStrength: 100,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr1, domain, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr2, domain, timeCtx, evalCtx2);

      // Both should produce valid positions
      expect(positions1).toHaveLength(20);
      expect(positions2).toHaveLength(20);

      // Should produce different patterns
      let differenceCount = 0;
      for (let i = 0; i < 20; i++) {
        if (Math.abs(positions1[i].x - positions2[i].x) > 1) {
          differenceCount++;
        }
      }

      expect(differenceCount).toBeGreaterThan(0);
    });
  });

  describe('Domain awareness', () => {
    it('should handle different domain sizes', () => {
      const domain1 = createSimpleDomain('elements', 5);
      const domain2 = createSimpleDomain('elements', 50);

      const expr1 = createFlowFieldOriginExpr(domain1, {
        noiseScale: 0.01,
        flowStrength: 100,
        seed: 42,
      });

      const expr2 = createFlowFieldOriginExpr(domain2, {
        noiseScale: 0.01,
        flowStrength: 100,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr1, domain1, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr2, domain2, timeCtx, evalCtx2);

      expect(positions1).toHaveLength(5);
      expect(positions2).toHaveLength(50);
    });

    it('should produce stable positions for same element IDs', () => {
      const domain = createSimpleDomain('elements', 10);
      const expr = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 100,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx2);

      // Should produce identical positions
      for (let i = 0; i < 10; i++) {
        expect(positions1[i].x).toBeCloseTo(positions2[i].x, 10);
        expect(positions1[i].y).toBeCloseTo(positions2[i].y, 10);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle zero flowStrength', () => {
      const domain = createSimpleDomain('elements', 5);
      const expr = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 0,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // With zero flowStrength, positions should be close to base grid
      expect(positions[0].x).toBeCloseTo(0, 1);
      expect(positions[0].y).toBeCloseTo(0, 1);
    });

    it('should handle single element domain', () => {
      const domain = createSimpleDomain('elements', 1);
      const expr = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 100,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(1);
      expect(typeof positions[0].x).toBe('number');
      expect(typeof positions[0].y).toBe('number');
    });

    it('should handle large element count', () => {
      const domain = createSimpleDomain('elements', 200);
      const expr = createFlowFieldOriginExpr(domain, {
        noiseScale: 0.01,
        flowStrength: 100,
        seed: 42,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(200);

      // All positions should be valid numbers
      for (const pos of positions) {
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
      }
    });
  });

  describe('Default parameters', () => {
    it('should use default parameters when none provided', () => {
      const domain = createSimpleDomain('elements', 5);
      const expr = createFlowFieldOriginExpr(domain);

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(5);

      // Should produce valid positions with defaults
      for (const pos of positions) {
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
      }
    });

    it('should merge partial parameters with defaults', () => {
      const domain = createSimpleDomain('elements', 5);
      const expr = createFlowFieldOriginExpr(domain, {
        seed: 999,
        // noiseScale, flowStrength use defaults
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(5);
    });
  });
});
