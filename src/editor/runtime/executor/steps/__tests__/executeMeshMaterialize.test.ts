/**
 * @file Execute Mesh Materialize Step Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeMeshMaterialize,
  type StepMeshMaterialize,
} from '../executeMeshMaterialize';
import { MeshStore } from '../../../mesh/MeshStore';
import type { MeshTable, MeshIR } from '../../../../compiler/ir/types3d';

describe('executeMeshMaterialize', () => {
  let meshStore: MeshStore;
  let meshTable: MeshTable;

  beforeEach(() => {
    meshStore = new MeshStore();

    const mesh: MeshIR = {
      id: 'test-mesh',
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

    meshTable = {
      meshes: [mesh],
      meshIdToIndex: {
        'test-mesh': 0,
      },
    };

    meshStore.setMeshTable(meshTable);
  });

  it('should execute mesh materialization', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { result, perf } = executeMeshMaterialize(step, meshStore);

    expect(result).toBeDefined();
    expect(result.positions).toBeDefined();
    expect(result.indices).toBeDefined();
    expect(perf).toBeDefined();
  });

  it('should emit performance counters', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { perf } = executeMeshMaterialize(step, meshStore);

    expect(perf.stepId).toBe('meshMaterialize:test-mesh');
    expect(perf.cpuMs).toBeGreaterThanOrEqual(0);
    expect(perf.cacheHit).toBe(false); // First access is miss
    expect(perf.bytesWritten).toBeGreaterThan(0);
    expect(perf.instancesIn).toBeGreaterThan(0); // Vertex count
    expect(perf.instancesOut).toBeGreaterThan(0); // Triangle count
    expect(perf.nanCount).toBe(0);
    expect(perf.infCount).toBe(0);
  });

  it('should report cache hit on second access', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    // First access (miss)
    const { perf: perf1 } = executeMeshMaterialize(step, meshStore);
    expect(perf1.cacheHit).toBe(false);
    expect(perf1.bytesWritten).toBeGreaterThan(0);

    // Second access (hit)
    const { perf: perf2 } = executeMeshMaterialize(step, meshStore);
    expect(perf2.cacheHit).toBe(true);
    expect(perf2.bytesWritten).toBe(0); // No new allocation
    expect(perf2.buffersReused).toBe(1);
  });

  it('should return same buffer on cache hit', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { result: result1 } = executeMeshMaterialize(step, meshStore);
    const { result: result2 } = executeMeshMaterialize(step, meshStore);

    expect(result1).toBe(result2);
  });

  it('should count vertices correctly', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { result, perf } = executeMeshMaterialize(step, meshStore);

    const expectedVertCount = result.positions.length / 3;
    expect(perf.instancesIn).toBe(expectedVertCount);
  });

  it('should count triangles correctly', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { result, perf } = executeMeshMaterialize(step, meshStore);

    const expectedTriCount = result.indices.length / 3;
    expect(perf.instancesOut).toBe(expectedTriCount);
  });

  it('should calculate bytes written correctly', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { result, perf } = executeMeshMaterialize(step, meshStore);

    const expectedBytes =
      result.positions.byteLength +
      (result.normals?.byteLength ?? 0) +
      (result.uvs?.byteLength ?? 0) +
      result.indices.byteLength;

    expect(perf.bytesWritten).toBe(expectedBytes);
  });

  it('should detect NaN in positions', () => {
    // Create mesh with NaN positions (by mocking materializeMesh)
    const meshWithNaN: MeshIR = {
      id: 'nan-mesh',
      recipe: {
        profile: { kind: 'circle', radius: NaN, segments: 8 },
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

    meshTable.meshes.push(meshWithNaN);
    meshTable.meshIdToIndex['nan-mesh'] = 1;
    meshStore.setMeshTable(meshTable);

    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'nan-mesh',
      outSlot: 43,
    };

    const { perf } = executeMeshMaterialize(step, meshStore);

    // Should detect NaN values
    expect(perf.nanCount).toBeGreaterThan(0);
  });

  it('should measure CPU time', () => {
    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'test-mesh',
      outSlot: 42,
    };

    const { perf } = executeMeshMaterialize(step, meshStore);

    expect(perf.cpuMs).toBeGreaterThanOrEqual(0);
    expect(perf.cpuMs).toBeLessThan(1000); // Should be fast
  });

  it('should handle mesh without normals', () => {
    const meshNoNormals: MeshIR = {
      id: 'no-normals',
      recipe: {
        profile: { kind: 'ngon', sides: 4, radius: 1 },
        extrude: { kind: 'linear', depth: 1, cap: 'none' },
      },
      attributes: {
        normals: false,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    meshTable.meshes.push(meshNoNormals);
    meshTable.meshIdToIndex['no-normals'] = 1;
    meshStore.setMeshTable(meshTable);

    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'no-normals',
      outSlot: 43,
    };

    const { result, perf } = executeMeshMaterialize(step, meshStore);

    expect(result.normals).toBeUndefined();
    expect(perf.bytesWritten).toBe(
      result.positions.byteLength + result.indices.byteLength
    );
  });

  it('should handle mesh without UVs', () => {
    const meshNoUVs: MeshIR = {
      id: 'no-uvs',
      recipe: {
        profile: { kind: 'ngon', sides: 3, radius: 1 },
        extrude: { kind: 'linear', depth: 1, cap: 'both' },
      },
      attributes: {
        normals: true,
        uvs: false,
      },
      winding: 'CCW',
      indexed: true,
      indexType: 'u16',
    };

    meshTable.meshes.push(meshNoUVs);
    meshTable.meshIdToIndex['no-uvs'] = 1;
    meshStore.setMeshTable(meshTable);

    const step: StepMeshMaterialize = {
      kind: 'MeshMaterialize',
      meshId: 'no-uvs',
      outSlot: 43,
    };

    const { result } = executeMeshMaterialize(step, meshStore);

    expect(result.uvs).toBeUndefined();
  });
});
