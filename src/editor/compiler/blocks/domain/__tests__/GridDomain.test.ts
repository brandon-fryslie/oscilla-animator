/**
 * @file GridDomain and StableIdHash Tests
 *
 * Tests the per-element identity system blocks.
 */

import { describe, it, expect } from 'vitest';
import { GridDomainBlock, StableIdHashBlock } from '../index';
import type { CompileCtx } from '../../../types';

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

describe('GridDomain', () => {
  it('creates a grid domain with stable row/col IDs', () => {
    const result = GridDomainBlock.compile({
      id: 'test-grid',
      params: { rows: 2, cols: 3, spacing: 20, originX: 0, originY: 0 },
      inputs: {},
      ctx: testCtx,
    });

    const domainArtifact = result.domain;
    expect(domainArtifact.kind).toBe('Domain');

    if (domainArtifact.kind === 'Domain') {
      const domain = domainArtifact.value;
      expect(domain.elements.length).toBe(6);
      
      // Check stable element IDs
      expect(domain.elements[0]).toBe('row-0-col-0');
      expect(domain.elements[1]).toBe('row-0-col-1');
      expect(domain.elements[2]).toBe('row-0-col-2');
      expect(domain.elements[3]).toBe('row-1-col-0');
      expect(domain.elements[4]).toBe('row-1-col-1');
      expect(domain.elements[5]).toBe('row-1-col-2');
    }
  });

  it('produces base positions in grid layout', () => {
    const result = GridDomainBlock.compile({
      id: 'test-grid-pos',
      params: { rows: 2, cols: 3, spacing: 20, originX: 100, originY: 50 },
      inputs: {},
      ctx: testCtx,
    });

    const posArtifact = result.pos0;
    expect(posArtifact.kind).toBe('Field:vec2');

    if (posArtifact.kind === 'Field:vec2') {
      const positions = posArtifact.value(0, 6, testCtx);
      expect(positions.length).toBe(6);

      // Check grid layout: 2 rows x 3 cols
      expect(positions[0]).toEqual({ x: 100, y: 50 });  // row 0, col 0
      expect(positions[1]).toEqual({ x: 120, y: 50 });  // row 0, col 1
      expect(positions[2]).toEqual({ x: 140, y: 50 });  // row 0, col 2
      expect(positions[3]).toEqual({ x: 100, y: 70 });  // row 1, col 0
      expect(positions[4]).toEqual({ x: 120, y: 70 });  // row 1, col 1
      expect(positions[5]).toEqual({ x: 140, y: 70 });  // row 1, col 2
    }
  });
});

describe('StableIdHash', () => {
  it('produces stable hash values from element IDs', () => {
    // First create a domain
    const gridResult = GridDomainBlock.compile({
      id: 'hash-grid',
      params: { rows: 2, cols: 2 },
      inputs: {},
      ctx: testCtx,
    });

    // Then hash the element IDs
    const hashResult = StableIdHashBlock.compile({
      id: 'hash',
      params: { salt: 0 },
      inputs: { domain: gridResult.domain },
      ctx: testCtx,
    });

    expect(hashResult.u01.kind).toBe('Field:float');

    if (hashResult.u01.kind === 'Field:float') {
      const values1 = hashResult.u01.value(0, 4, testCtx);
      const values2 = hashResult.u01.value(0, 4, testCtx); // Same seed

      // Values should be in [0, 1)
      values1.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      });

      // Same input should produce same output (deterministic)
      expect(values1).toEqual(values2);

      // Different element IDs should produce different values
      expect(values1[0]).not.toEqual(values1[1]);
      expect(values1[1]).not.toEqual(values1[2]);
    }
  });

  it('produces different values with different salt', () => {
    const gridResult = GridDomainBlock.compile({
      id: 'hash-grid-2',
      params: { rows: 1, cols: 3 },
      inputs: {},
      ctx: testCtx,
    });

    const hash1 = StableIdHashBlock.compile({
      id: 'hash-1',
      params: { salt: 0 },
      inputs: { domain: gridResult.domain },
      ctx: testCtx,
    });

    const hash2 = StableIdHashBlock.compile({
      id: 'hash-2',
      params: { salt: 42 },
      inputs: { domain: gridResult.domain },
      ctx: testCtx,
    });

    if (hash1.u01.kind === 'Field:float' && hash2.u01.kind === 'Field:float') {
      const values1 = hash1.u01.value(0, 3, testCtx);
      const values2 = hash2.u01.value(0, 3, testCtx);

      // Different salt should produce different values
      expect(values1).not.toEqual(values2);
    }
  });
});
