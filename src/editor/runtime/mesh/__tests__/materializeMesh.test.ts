/**
 * @file Mesh Materialization Tests
 */

import { describe, it, expect } from 'vitest';
import { materializeMesh } from '../materializeMesh';
import type { MeshIR } from '../../../compiler/ir/types3d';

describe('materializeMesh', () => {
  it('should materialize circle extrusion', () => {
    const mesh: MeshIR = {
      id: 'test-circle',
      recipe: {
        profile: { kind: 'circle', radius: 1, segments: 8 },
        extrude: { kind: 'linear', depth: 2, cap: 'both' },
      },
      attributes: {
        normals: true,
        uvs: true,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    expect(result.positions).toBeDefined();
    expect(result.normals).toBeDefined();
    expect(result.uvs).toBeDefined();
    expect(result.indices).toBeDefined();
    expect(result.bounds).toBeDefined();

    // Check bounds are reasonable
    expect(result.bounds.min.x).toBeLessThan(0);
    expect(result.bounds.max.x).toBeGreaterThan(0);
    expect(result.bounds.min.y).toBeLessThan(0);
    expect(result.bounds.max.y).toBeGreaterThan(0);
  });

  it('should materialize ngon extrusion', () => {
    const mesh: MeshIR = {
      id: 'test-hexagon',
      recipe: {
        profile: { kind: 'ngon', sides: 6, radius: 2 },
        extrude: { kind: 'linear', depth: 3, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    expect(result.positions).toBeDefined();
    expect(result.normals).toBeUndefined();
    expect(result.uvs).toBeUndefined();
    expect(result.indices).toBeDefined();
  });

  it('should compute correct bounds', () => {
    const mesh: MeshIR = {
      id: 'test-bounds',
      recipe: {
        profile: { kind: 'circle', radius: 5, segments: 16 },
        extrude: { kind: 'linear', depth: 10, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    // Bounds should contain circle of radius 5
    expect(result.bounds.min.x).toBeLessThanOrEqual(-5);
    expect(result.bounds.max.x).toBeGreaterThanOrEqual(5);
    expect(result.bounds.min.y).toBeLessThanOrEqual(-5);
    expect(result.bounds.max.y).toBeGreaterThanOrEqual(5);

    // Bounds should extend to depth/2 in Z
    expect(result.bounds.min.z).toBeCloseTo(-5, 1);
    expect(result.bounds.max.z).toBeCloseTo(5, 1);
  });

  it('should use Uint16Array for u16 index type', () => {
    const mesh: MeshIR = {
      id: 'test-u16',
      recipe: {
        profile: { kind: 'circle', radius: 1, segments: 8 },
        extrude: { kind: 'linear', depth: 2, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    expect(result.indices).toBeInstanceOf(Uint16Array);
  });

  it('should use Uint32Array for u32 index type', () => {
    const mesh: MeshIR = {
      id: 'test-u32',
      recipe: {
        profile: { kind: 'circle', radius: 1, segments: 8 },
        extrude: { kind: 'linear', depth: 2, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u32',
    };

    const result = materializeMesh(mesh);

    expect(result.indices).toBeInstanceOf(Uint32Array);
  });

  it('should throw if u16 index type used with >65535 vertices', () => {
    const mesh: MeshIR = {
      id: 'test-too-many-verts',
      recipe: {
        profile: { kind: 'circle', radius: 1, segments: 40000 },
        extrude: { kind: 'linear', depth: 2, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    expect(() => materializeMesh(mesh)).toThrow();
  });

  it('should handle mesh without caps', () => {
    const mesh: MeshIR = {
      id: 'test-no-caps',
      recipe: {
        profile: { kind: 'ngon', sides: 4, radius: 1 },
        extrude: { kind: 'linear', depth: 2, cap: 'none' },
      },
      attributes: {
        normals: true,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    expect(result.positions).toBeDefined();
    expect(result.indices).toBeDefined();
  });

  it('should handle polyline profile', () => {
    const mesh: MeshIR = {
      id: 'test-polyline',
      recipe: {
        profile: {
          kind: 'polyline',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          closed: true,
        },
        extrude: { kind: 'linear', depth: 1, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    expect(result.positions).toBeDefined();
    expect(result.indices).toBeDefined();
    expect(result.bounds).toBeDefined();
  });

  it('should generate valid index buffer', () => {
    const mesh: MeshIR = {
      id: 'test-indices',
      recipe: {
        profile: { kind: 'ngon', sides: 5, radius: 1 },
        extrude: { kind: 'linear', depth: 2, cap: 'both' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    const result = materializeMesh(mesh);

    const vertCount = result.positions.length / 3;

    // All indices should be valid
    for (let i = 0; i < result.indices.length; i++) {
      expect(result.indices[i]).toBeGreaterThanOrEqual(0);
      expect(result.indices[i]).toBeLessThan(vertCount);
    }

    // Should be multiple of 3 (triangles)
    expect(result.indices.length % 3).toBe(0);
  });
});
