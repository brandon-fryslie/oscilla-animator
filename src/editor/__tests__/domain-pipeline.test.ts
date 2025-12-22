/**
 * @file Domain Pipeline End-to-End Tests
 *
 * Tests the full pipeline from Domain blocks through to RenderTree output.
 * Verifies that:
 * 1. DomainN creates proper element identities
 * 2. Position mappers produce correct Field<vec2> outputs
 * 3. Field constants and hash functions work
 * 4. RenderInstances2D materializes into a valid RenderTree
 * 5. The full pipeline compiles without errors
 */

import { describe, it, expect } from 'vitest';
import {
  DomainNBlock,
  PositionMapGridBlock,
  PositionMapCircleBlock,
  FieldConstNumberBlock,
  FieldConstColorBlock,
  FieldHash01ByIdBlock,
  FieldMapNumberBlock,
  FieldZipNumberBlock,
  RenderInstances2DBlock,
} from '../compiler/blocks/domain';
import type { Artifact, CompileCtx, RuntimeCtx } from '../compiler/types';

// Test compile context
const testCtx: CompileCtx = {
  env: {},
  geom: {
    get<K extends object, V>(_key: K, compute: () => V): V {
      return compute();
    },
    invalidate() {},
  },
};

// Test runtime context
const testRuntimeCtx: RuntimeCtx = {
  viewport: { w: 800, h: 600, dpr: 1 },
};

describe('Domain Pipeline', () => {
  describe('DomainN', () => {
    it('creates a domain with specified element count', () => {
      const result = DomainNBlock.compile({
        id: 'test-domain',
        params: { n: 5, seed: 0 },
        inputs: {},
        ctx: testCtx,
      });

      const domainArtifact = result.domain;
      expect(domainArtifact.kind).toBe('Domain');

      if (domainArtifact.kind === 'Domain') {
        const domain = domainArtifact.value;
        expect(domain.elements.length).toBe(5);
        expect(domain.elements).toEqual(['0', '1', '2', '3', '4']);
      }
    });

    it('accepts n from input port', () => {
      const nInput: Artifact = { kind: 'Scalar:number', value: 3 };

      const result = DomainNBlock.compile({
        id: 'test-domain-2',
        params: { n: 10, seed: 0 }, // param should be overridden
        inputs: { n: nInput },
        ctx: testCtx,
      });

      const domainArtifact = result.domain;
      expect(domainArtifact.kind).toBe('Domain');
      if (domainArtifact.kind === 'Domain') {
        expect(domainArtifact.value.elements.length).toBe(3);
      }
    });
  });

  describe('PositionMapGrid', () => {
    it('produces grid positions for domain elements', () => {
      // First create a domain
      const domainResult = DomainNBlock.compile({
        id: 'grid-domain',
        params: { n: 6 },
        inputs: {},
        ctx: testCtx,
      });

      // Then map to grid
      const gridResult = PositionMapGridBlock.compile({
        id: 'grid-positions',
        params: { cols: 3, spacing: 20, originX: 0, originY: 0, order: 'rowMajor' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const posArtifact = gridResult.pos;
      expect(posArtifact.kind).toBe('Field:vec2');

      if (posArtifact.kind === 'Field:vec2') {
        const positions = posArtifact.value(0, 6, testCtx);
        expect(positions.length).toBe(6);

        // Check grid layout: 2 rows x 3 cols
        expect(positions[0]).toEqual({ x: 0, y: 0 });
        expect(positions[1]).toEqual({ x: 20, y: 0 });
        expect(positions[2]).toEqual({ x: 40, y: 0 });
        expect(positions[3]).toEqual({ x: 0, y: 20 });
        expect(positions[4]).toEqual({ x: 20, y: 20 });
        expect(positions[5]).toEqual({ x: 40, y: 20 });
      }
    });

    it('supports serpentine order', () => {
      const domainResult = DomainNBlock.compile({
        id: 'serp-domain',
        params: { n: 6 },
        inputs: {},
        ctx: testCtx,
      });

      const gridResult = PositionMapGridBlock.compile({
        id: 'serp-positions',
        params: { cols: 3, spacing: 20, originX: 0, originY: 0, order: 'serpentine' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      if (gridResult.pos.kind === 'Field:vec2') {
        const positions = gridResult.pos.value(0, 6, testCtx);

        // Row 0: left to right
        expect(positions[0]).toEqual({ x: 0, y: 0 });
        expect(positions[1]).toEqual({ x: 20, y: 0 });
        expect(positions[2]).toEqual({ x: 40, y: 0 });

        // Row 1: right to left (serpentine)
        expect(positions[3]).toEqual({ x: 40, y: 20 });
        expect(positions[4]).toEqual({ x: 20, y: 20 });
        expect(positions[5]).toEqual({ x: 0, y: 20 });
      }
    });
  });

  describe('PositionMapCircle', () => {
    it('produces circular positions for domain elements', () => {
      const domainResult = DomainNBlock.compile({
        id: 'circle-domain',
        params: { n: 4 },
        inputs: {},
        ctx: testCtx,
      });

      const circleResult = PositionMapCircleBlock.compile({
        id: 'circle-positions',
        params: { centerX: 100, centerY: 100, radius: 50, startAngle: 0, distribution: 'even' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      if (circleResult.pos.kind === 'Field:vec2') {
        const positions = circleResult.pos.value(0, 4, testCtx);
        expect(positions.length).toBe(4);

        // At 0 degrees, point should be at (center + radius, center)
        expect(positions[0]!.x).toBeCloseTo(150, 1);
        expect(positions[0]!.y).toBeCloseTo(100, 1);
      }
    });
  });

  describe('FieldConstNumber', () => {
    it('produces uniform values for all elements', () => {
      const domainResult = DomainNBlock.compile({
        id: 'const-domain',
        params: { n: 3 },
        inputs: {},
        ctx: testCtx,
      });

      const constResult = FieldConstNumberBlock.compile({
        id: 'const-field',
        params: { value: 42 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      if (constResult.out.kind === 'Field:number') {
        const values = constResult.out.value(0, 3, testCtx);
        expect(values).toEqual([42, 42, 42]);
      }
    });
  });

  describe('FieldHash01ById', () => {
    it('produces deterministic random values per element', () => {
      const domainResult = DomainNBlock.compile({
        id: 'hash-domain',
        params: { n: 3 },
        inputs: {},
        ctx: testCtx,
      });

      const hashResult = FieldHash01ByIdBlock.compile({
        id: 'hash-field',
        params: { seed: 0 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      if (hashResult.u.kind === 'Field:number') {
        const values1 = hashResult.u.value(0, 3, testCtx);
        const values2 = hashResult.u.value(0, 3, testCtx); // Same seed

        // Values should be in [0, 1)
        values1.forEach((v) => {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        });

        // Same seed should produce same values
        expect(values1).toEqual(values2);

        // Different elements should have different values (with high probability)
        expect(values1[0]).not.toEqual(values1[1]);
        expect(values1[1]).not.toEqual(values1[2]);
      }
    });
  });

  describe('FieldMapNumber', () => {
    it('applies unary function to field values', () => {
      const domainResult = DomainNBlock.compile({
        id: 'map-domain',
        params: { n: 3 },
        inputs: {},
        ctx: testCtx,
      });

      const constResult = FieldConstNumberBlock.compile({
        id: 'const-for-map',
        params: { value: 2 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const mapResult = FieldMapNumberBlock.compile({
        id: 'map-field',
        params: { fn: 'scale', k: 3 },
        inputs: { x: constResult.out },
        ctx: testCtx,
      });

      if (mapResult.y.kind === 'Field:number') {
        const values = mapResult.y.value(0, 3, testCtx);
        expect(values).toEqual([6, 6, 6]); // 2 * 3 = 6
      }
    });
  });

  describe('FieldZipNumber', () => {
    it('combines two fields element-wise', () => {
      const domainResult = DomainNBlock.compile({
        id: 'zip-domain',
        params: { n: 3 },
        inputs: {},
        ctx: testCtx,
      });

      const fieldA = FieldConstNumberBlock.compile({
        id: 'const-a',
        params: { value: 10 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const fieldB = FieldConstNumberBlock.compile({
        id: 'const-b',
        params: { value: 3 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const zipResult = FieldZipNumberBlock.compile({
        id: 'zip-field',
        params: { op: 'add' },
        inputs: { a: fieldA.out, b: fieldB.out },
        ctx: testCtx,
      });

      if (zipResult.out.kind === 'Field:number') {
        const values = zipResult.out.value(0, 3, testCtx);
        expect(values).toEqual([13, 13, 13]); // 10 + 3 = 13
      }
    });

    it('supports mul operation', () => {
      const domainResult = DomainNBlock.compile({
        id: 'mul-domain',
        params: { n: 2 },
        inputs: {},
        ctx: testCtx,
      });

      const fieldA = FieldConstNumberBlock.compile({
        id: 'mul-a',
        params: { value: 4 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const fieldB = FieldConstNumberBlock.compile({
        id: 'mul-b',
        params: { value: 5 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const zipResult = FieldZipNumberBlock.compile({
        id: 'mul-zip',
        params: { op: 'mul' },
        inputs: { a: fieldA.out, b: fieldB.out },
        ctx: testCtx,
      });

      if (zipResult.out.kind === 'Field:number') {
        const values = zipResult.out.value(0, 2, testCtx);
        expect(values).toEqual([20, 20]); // 4 * 5 = 20
      }
    });
  });

  describe('RenderInstances2D', () => {
    it('produces a valid RenderTree from Domain + Fields', () => {
      // Create domain
      const domainResult = DomainNBlock.compile({
        id: 'render-domain',
        params: { n: 3 },
        inputs: {},
        ctx: testCtx,
      });

      // Create positions
      const gridResult = PositionMapGridBlock.compile({
        id: 'render-grid',
        params: { cols: 3, spacing: 50, originX: 100, originY: 100 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      // Create radius
      const radiusResult = FieldConstNumberBlock.compile({
        id: 'render-radius',
        params: { value: 10 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      // Create color
      const colorResult = FieldConstColorBlock.compile({
        id: 'render-color',
        params: { color: '#ff0000' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      // Materialize to RenderTree
      const renderResult = RenderInstances2DBlock.compile({
        id: 'render-instances',
        params: { opacity: 0.8 },
        inputs: {
          domain: domainResult.domain,
          positions: gridResult.pos,
          radius: radiusResult.out,
          color: colorResult.out,
        },
        ctx: testCtx,
      });

      expect(renderResult.render.kind).toBe('RenderTree');

      if (renderResult.render.kind === 'RenderTree') {
        const renderFn = renderResult.render.value;
        const tree = renderFn(0, testRuntimeCtx);

        expect(tree.kind).toBe('group');
        if (tree.kind === 'group') {
          expect(tree.children.length).toBe(3);

          // First circle should be at (100, 100)
          const first = tree.children[0];
          expect(first?.kind).toBe('shape');
          if (first?.kind === 'shape') {
            const geom = first.geom as { cx: number; cy: number; r: number };
            expect(geom.cx).toBe(100);
            expect(geom.cy).toBe(100);
            expect(geom.r).toBe(10);
          }
        }
      }
    });
  });

  describe('Full Pipeline Integration', () => {
    it('compiles DomainN → PositionMapGrid → RenderInstances2D without errors', () => {
      // This test verifies the complete data flow:
      // DomainN produces Domain
      // PositionMapGrid consumes Domain, produces Field<vec2>
      // FieldConstNumber consumes Domain, produces Field<number>
      // FieldConstColor consumes Domain, produces Field<color>
      // RenderInstances2D consumes all, produces RenderTree

      // Step 1: Create domain
      const domainResult = DomainNBlock.compile({
        id: 'e2e-domain',
        params: { n: 100 },
        inputs: {},
        ctx: testCtx,
      });
      expect(domainResult.domain.kind).toBe('Domain');

      // Step 2: Map to grid positions
      const posResult = PositionMapGridBlock.compile({
        id: 'e2e-pos',
        params: { cols: 10, spacing: 30, originX: 50, originY: 50 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });
      expect(posResult.pos.kind).toBe('Field:vec2');

      // Step 3: Create radius field
      const radiusResult = FieldConstNumberBlock.compile({
        id: 'e2e-radius',
        params: { value: 5 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });
      expect(radiusResult.out.kind).toBe('Field:number');

      // Step 4: Create color field
      const colorResult = FieldConstColorBlock.compile({
        id: 'e2e-color',
        params: { color: '#00ff00' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });
      expect(colorResult.out.kind).toBe('Field:color');

      // Step 5: Materialize to RenderTree
      const renderResult = RenderInstances2DBlock.compile({
        id: 'e2e-render',
        params: { opacity: 1, glow: false },
        inputs: {
          domain: domainResult.domain,
          positions: posResult.pos,
          radius: radiusResult.out,
          color: colorResult.out,
        },
        ctx: testCtx,
      });
      expect(renderResult.render.kind).toBe('RenderTree');

      // Verify we can invoke the render function
      if (renderResult.render.kind === 'RenderTree') {
        const tree = renderResult.render.value(0, testRuntimeCtx);
        expect(tree.kind).toBe('group');

        if (tree.kind === 'group') {
          expect(tree.children.length).toBe(100);
        }
      }
    });

    it('compiles DomainN → PositionMapCircle → RenderInstances2D (circle variant)', () => {
      // Create domain
      const domainResult = DomainNBlock.compile({
        id: 'circle-e2e-domain',
        params: { n: 12 },
        inputs: {},
        ctx: testCtx,
      });

      // Map to circle positions
      const posResult = PositionMapCircleBlock.compile({
        id: 'circle-e2e-pos',
        params: { centerX: 200, centerY: 200, radius: 100, distribution: 'even' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      // Use hash for per-element variation in radius
      const radiusBase = FieldConstNumberBlock.compile({
        id: 'circle-e2e-radius-base',
        params: { value: 5 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      const radiusVar = FieldHash01ByIdBlock.compile({
        id: 'circle-e2e-radius-var',
        params: { seed: 42 },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      // Scale the hash to get variation
      const radiusScaled = FieldMapNumberBlock.compile({
        id: 'circle-e2e-radius-scaled',
        params: { fn: 'scale', k: 5 },
        inputs: { x: radiusVar.u },
        ctx: testCtx,
      });

      // Combine base + variation
      const radiusFinal = FieldZipNumberBlock.compile({
        id: 'circle-e2e-radius-final',
        params: { op: 'add' },
        inputs: { a: radiusBase.out, b: radiusScaled.y },
        ctx: testCtx,
      });

      // Color
      const colorResult = FieldConstColorBlock.compile({
        id: 'circle-e2e-color',
        params: { color: '#00ccff' },
        inputs: { domain: domainResult.domain },
        ctx: testCtx,
      });

      // Render
      const renderResult = RenderInstances2DBlock.compile({
        id: 'circle-e2e-render',
        params: { opacity: 1, glow: true, glowIntensity: 2 },
        inputs: {
          domain: domainResult.domain,
          positions: posResult.pos,
          radius: radiusFinal.out,
          color: colorResult.out,
        },
        ctx: testCtx,
      });

      expect(renderResult.render.kind).toBe('RenderTree');

      if (renderResult.render.kind === 'RenderTree') {
        const tree = renderResult.render.value(1000, testRuntimeCtx);
        // With glow enabled, we expect an effect wrapper
        expect(tree.kind).toBe('effect');

        if (tree.kind === 'effect') {
          expect(tree.effect).toEqual({ kind: 'filter', filter: 'drop-shadow(0 0 20px currentColor)' });
          expect(tree.child.kind).toBe('group');

          if (tree.child.kind === 'group') {
            expect(tree.child.children.length).toBe(12);
          }
        }
      }
    });
  });
});
