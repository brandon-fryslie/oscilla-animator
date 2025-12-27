/**
 * @file MeshStore Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MeshStore } from '../MeshStore';
import type { MeshTable, MeshIR } from '../../../compiler/ir/types3d';

describe('MeshStore', () => {
  let store: MeshStore;
  let meshTable: MeshTable;

  beforeEach(() => {
    store = new MeshStore();

    // Create test mesh table
    const mesh1: MeshIR = {
      id: 'circle-1',
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

    const mesh2: MeshIR = {
      id: 'hexagon-1',
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

    meshTable = {
      meshes: [mesh1, mesh2],
      meshIdToIndex: {
        'circle-1': 0,
        'hexagon-1': 1,
      },
    };

    store.setMeshTable(meshTable);
  });

  it('should throw if mesh table not set', () => {
    const emptyStore = new MeshStore();
    expect(() => emptyStore.getOrMaterialize('circle-1')).toThrow(
      'mesh table not set'
    );
  });

  it('should throw if mesh not found', () => {
    expect(() => store.getOrMaterialize('nonexistent')).toThrow('mesh not found');
  });

  it('should materialize mesh on first access', () => {
    const result = store.getOrMaterialize('circle-1');

    expect(result.positions).toBeDefined();
    expect(result.indices).toBeDefined();
  });

  it('should cache materialized meshes', () => {
    const result1 = store.getOrMaterialize('circle-1');
    const result2 = store.getOrMaterialize('circle-1');

    // Should return same buffer reference (cached)
    expect(result1).toBe(result2);
  });

  it('should track cache hits', () => {
    store.resetStats();

    store.getOrMaterialize('circle-1'); // miss
    store.getOrMaterialize('circle-1'); // hit
    store.getOrMaterialize('circle-1'); // hit

    const stats = store.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });

  it('should invalidate specific mesh', () => {
    store.resetStats();

    store.getOrMaterialize('circle-1'); // miss
    store.invalidateMesh('circle-1');
    store.getOrMaterialize('circle-1'); // miss again

    const stats = store.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(2);
  });

  it('should invalidate all meshes', () => {
    store.resetStats();

    store.getOrMaterialize('circle-1'); // miss
    store.getOrMaterialize('hexagon-1'); // miss
    store.invalidateAll();
    store.getOrMaterialize('circle-1'); // miss
    store.getOrMaterialize('hexagon-1'); // miss

    const stats = store.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(4);
  });

  it('should track cache size', () => {
    store.getOrMaterialize('circle-1');
    store.getOrMaterialize('hexagon-1');

    const stats = store.getStats();
    expect(stats.size).toBe(2);
  });

  it('should calculate hit rate', () => {
    store.resetStats();

    store.getOrMaterialize('circle-1'); // miss
    store.getOrMaterialize('circle-1'); // hit
    store.getOrMaterialize('circle-1'); // hit
    store.getOrMaterialize('circle-1'); // hit

    const stats = store.getStats();
    expect(stats.hitRate).toBe(0.75); // 3 hits / 4 total
  });

  it('should handle empty stats', () => {
    store.resetStats();

    const stats = store.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('should materialize different meshes independently', () => {
    const result1 = store.getOrMaterialize('circle-1');
    const result2 = store.getOrMaterialize('hexagon-1');

    // Should be different buffers
    expect(result1).not.toBe(result2);

    // Should have different vertex counts
    expect(result1.positions.length).not.toBe(result2.positions.length);
  });

  it('should invalidate cache when mesh table changes', () => {
    store.resetStats();

    store.getOrMaterialize('circle-1'); // miss

    // Update mesh table with modified recipe
    const modifiedMesh: MeshIR = {
      id: 'circle-1',
      recipe: {
        profile: { kind: 'circle', radius: 2, segments: 16 }, // Different radius + segments
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

    const newTable: MeshTable = {
      meshes: [modifiedMesh],
      meshIdToIndex: {
        'circle-1': 0,
      },
    };

    store.setMeshTable(newTable);

    store.getOrMaterialize('circle-1'); // Should be miss due to recipe change

    const stats = store.getStats();
    expect(stats.misses).toBe(2); // Both accesses were misses
  });

  it('should detect recipe changes and invalidate cache', () => {
    store.resetStats();

    const result1 = store.getOrMaterialize('circle-1');

    // Modify the mesh recipe in the table
    meshTable.meshes[0] = {
      ...meshTable.meshes[0],
      recipe: {
        profile: { kind: 'circle', radius: 3, segments: 16 }, // Different
        extrude: { kind: 'linear', depth: 2, cap: 'both' },
      },
    };

    const result2 = store.getOrMaterialize('circle-1');

    // Should be different due to recipe change
    expect(result1.positions.length).not.toBe(result2.positions.length);

    const stats = store.getStats();
    expect(stats.misses).toBe(2); // Both were cache misses
  });

  it('should reset stats correctly', () => {
    store.getOrMaterialize('circle-1');
    store.getOrMaterialize('circle-1');
    store.getOrMaterialize('circle-1');

    expect(store.getStats().hits).toBeGreaterThan(0);

    store.resetStats();

    const stats = store.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});
