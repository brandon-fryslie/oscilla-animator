/**
 * @file RadialOrigin.test.ts - Unit tests for RadialOriginBlock
 * @description Tests radial position field generation.
 */

import { describe, it, expect } from 'vitest';
import { createRadialOriginExpr, RadialOriginBlock } from '../blocks/RadialOriginBlock';
import { createSimpleDomain } from '../Domain';
import { batchEvaluateFieldExpr, createFieldExprCtx } from '../FieldExpr';
import { TimeCtxFactory } from '../TimeCtx';

describe('RadialOriginBlock', () => {
  describe('Block metadata', () => {
    it('should have correct type', () => {
      expect(RadialOriginBlock.type).toBe('RadialOrigin');
    });

    it('should expose createExpr function', () => {
      expect(typeof RadialOriginBlock.createExpr).toBe('function');
    });
  });

  describe('Basic radial positioning', () => {
    it('should generate positions in a circle', () => {
      const domain = createSimpleDomain('elements', 8);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // Should have 8 positions
      expect(positions).toHaveLength(8);

      // All positions should be at radius 100 from center
      for (const pos of positions) {
        const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        expect(dist).toBeCloseTo(100, 5);
      }
    });

    it('should distribute positions evenly around circle', () => {
      const domain = createSimpleDomain('elements', 4);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // 4 points should be at 0°, 90°, 180°, 270°
      expect(positions[0]!.x).toBeCloseTo(100, 5);
      expect(positions[0]!.y).toBeCloseTo(0, 5);

      expect(positions[1]!.x).toBeCloseTo(0, 5);
      expect(positions[1]!.y).toBeCloseTo(100, 5);

      expect(positions[2]!.x).toBeCloseTo(-100, 5);
      expect(positions[2]!.y).toBeCloseTo(0, 5);

      expect(positions[3]!.x).toBeCloseTo(0, 5);
      expect(positions[3]!.y).toBeCloseTo(-100, 5);
    });
  });

  describe('Parameter variation', () => {
    it('should respect centerX and centerY', () => {
      const domain = createSimpleDomain('elements', 4);
      const expr = createRadialOriginExpr(domain, {
        centerX: 100,
        centerY: 50,
        radius: 50,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // First position should be at (100 + 50, 50)
      expect(positions[0]!.x).toBeCloseTo(150, 5);
      expect(positions[0]!.y).toBeCloseTo(50, 5);
    });

    it('should respect radius parameter', () => {
      const domain = createSimpleDomain('elements', 1);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 200,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // Should be at radius 200
      expect(positions[0]!.x).toBeCloseTo(200, 5);
      expect(positions[0]!.y).toBeCloseTo(0, 5);
    });

    it('should respect angleOffset parameter', () => {
      const domain = createSimpleDomain('elements', 1);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: Math.PI / 2, // 90 degrees
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // Should be rotated 90 degrees (at top of circle)
      expect(positions[0]!.x).toBeCloseTo(0, 5);
      expect(positions[0]!.y).toBeCloseTo(100, 5);
    });
  });

  describe('Domain awareness', () => {
    it('should handle different domain sizes', () => {
      const domain1 = createSimpleDomain('elements', 3);
      const domain2 = createSimpleDomain('elements', 10);

      const expr1 = createRadialOriginExpr(domain1, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const expr2 = createRadialOriginExpr(domain2, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr1, domain1, timeCtx, evalCtx);
      const positions2 = batchEvaluateFieldExpr(expr2, domain2, timeCtx, evalCtx);

      expect(positions1).toHaveLength(3);
      expect(positions2).toHaveLength(10);
    });

    it('should produce stable positions for same element IDs', () => {
      const domain = createSimpleDomain('elements', 5);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx1 = createFieldExprCtx();
      const evalCtx2 = createFieldExprCtx();

      const positions1 = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx1);
      const positions2 = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx2);

      // Should produce identical positions
      for (let i = 0; i < 5; i++) {
        expect(positions1[i]!.x).toBeCloseTo(positions2[i]!.x, 10);
        expect(positions1[i]!.y).toBeCloseTo(positions2[i]!.y, 10);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle zero radius', () => {
      const domain = createSimpleDomain('elements', 3);
      const expr = createRadialOriginExpr(domain, {
        centerX: 100,
        centerY: 50,
        radius: 0,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // All positions should be at center
      for (const pos of positions) {
        expect(pos.x).toBeCloseTo(100, 5);
        expect(pos.y).toBeCloseTo(50, 5);
      }
    });

    it('should handle single element domain', () => {
      const domain = createSimpleDomain('elements', 1);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(1);
      expect(positions[0]!.x).toBeCloseTo(100, 5);
      expect(positions[0]!.y).toBeCloseTo(0, 5);
    });

    it('should handle large element count', () => {
      const domain = createSimpleDomain('elements', 100);
      const expr = createRadialOriginExpr(domain, {
        centerX: 0,
        centerY: 0,
        radius: 100,
        angleOffset: 0,
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions).toHaveLength(100);

      // All should be at correct radius
      for (const pos of positions) {
        const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        expect(dist).toBeCloseTo(100, 5);
      }
    });
  });

  describe('Default parameters', () => {
    it('should use default parameters when none provided', () => {
      const domain = createSimpleDomain('elements', 1);
      const expr = createRadialOriginExpr(domain);

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      // Should use defaults: centerX=0, centerY=0, radius=100, angleOffset=0
      expect(positions[0]!.x).toBeCloseTo(100, 5);
      expect(positions[0]!.y).toBeCloseTo(0, 5);
    });

    it('should merge partial parameters with defaults', () => {
      const domain = createSimpleDomain('elements', 1);
      const expr = createRadialOriginExpr(domain, {
        radius: 50,
        // centerX, centerY, angleOffset use defaults
      });

      const timeCtx = TimeCtxFactory.initial();
      const evalCtx = createFieldExprCtx();

      const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);

      expect(positions[0]!.x).toBeCloseTo(50, 5);
      expect(positions[0]!.y).toBeCloseTo(0, 5);
    });
  });
});
