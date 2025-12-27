/**
 * @file CameraStore Tests
 * @description Unit tests for camera evaluation cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CameraStore } from '../CameraStore';
import type { CameraIR, CameraTable } from '../../../compiler/ir/types3d';
import type { ViewportInfo } from '../evaluateCamera';

// =============================================================================
// Test Fixtures
// =============================================================================

function createPerspectiveCamera(id: string): CameraIR {
  return {
    id,
    handedness: 'right',
    forwardAxis: '-Z',
    upAxis: '+Y',
    projection: {
      kind: 'perspective',
      near: 0.1,
      far: 100,
      fovYRad: Math.PI / 2, // 90 degrees
    },
    pose: {
      position: { x: 0, y: 0, z: 5 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    ndcToScreen: {
      origin: 'center',
      yAxis: 'down',
    },
  };
}

function createOrthographicCamera(id: string): CameraIR {
  return {
    id,
    handedness: 'right',
    forwardAxis: '-Z',
    upAxis: '+Y',
    projection: {
      kind: 'orthographic',
      near: 0.1,
      far: 100,
      orthoHeight: 10,
    },
    pose: {
      position: { x: 0, y: 0, z: 5 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    ndcToScreen: {
      origin: 'center',
      yAxis: 'down',
    },
  };
}

function createCameraTable(cameras: CameraIR[]): CameraTable {
  const cameraIdToIndex: Record<string, number> = {};
  cameras.forEach((camera, index) => {
    cameraIdToIndex[camera.id] = index;
  });

  return {
    cameras,
    cameraIdToIndex,
  };
}

const testViewport: ViewportInfo = {
  width: 1920,
  height: 1080,
  dpr: 1.0,
};

// =============================================================================
// CameraStore Tests
// =============================================================================

describe('CameraStore', () => {
  let store: CameraStore;

  beforeEach(() => {
    store = new CameraStore();
  });

  it('throws error if camera table not set', () => {
    expect(() => {
      store.getOrEvaluate('camera1', testViewport);
    }).toThrow('camera table not set');
  });

  it('throws error if camera not found', () => {
    const table = createCameraTable([createPerspectiveCamera('camera1')]);
    store.setCameraTable(table);

    expect(() => {
      store.getOrEvaluate('nonexistent', testViewport);
    }).toThrow('camera not found');
  });

  it('evaluates perspective camera on first access', () => {
    const camera = createPerspectiveCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);

    const result = store.getOrEvaluate('camera1', testViewport);

    expect(result.viewMat4).toBeInstanceOf(Float32Array);
    expect(result.projMat4).toBeInstanceOf(Float32Array);
    expect(result.viewProjMat4).toBeInstanceOf(Float32Array);
    expect(result.viewportKey).toEqual({
      w: 1920,
      h: 1080,
      dpr: 1.0,
    });
  });

  it('evaluates orthographic camera on first access', () => {
    const camera = createOrthographicCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);

    const result = store.getOrEvaluate('camera1', testViewport);

    expect(result.viewMat4).toBeInstanceOf(Float32Array);
    expect(result.projMat4).toBeInstanceOf(Float32Array);
    expect(result.viewProjMat4).toBeInstanceOf(Float32Array);
  });

  it('returns cached result on second access', () => {
    const camera = createPerspectiveCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);

    const result1 = store.getOrEvaluate('camera1', testViewport);
    const result2 = store.getOrEvaluate('camera1', testViewport);

    // Should return same object (cached)
    expect(result2.viewMat4).toBe(result1.viewMat4);
    expect(result2.projMat4).toBe(result1.projMat4);
    expect(result2.viewProjMat4).toBe(result1.viewProjMat4);
  });

  it('caches separately per viewport size', () => {
    const camera = createPerspectiveCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);

    const viewport1: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };
    const viewport2: ViewportInfo = { width: 1280, height: 720, dpr: 1.0 };

    const result1 = store.getOrEvaluate('camera1', viewport1);
    const result2 = store.getOrEvaluate('camera1', viewport2);

    // Should be different evaluations (different aspect ratios)
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
    expect(result2.viewportKey.w).toBe(1280);
    expect(result1.viewportKey.w).toBe(1920);
  });

  it('caches separately per DPR', () => {
    const camera = createPerspectiveCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);

    const viewport1: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };
    const viewport2: ViewportInfo = { width: 1920, height: 1080, dpr: 2.0 };

    const result1 = store.getOrEvaluate('camera1', viewport1);
    const result2 = store.getOrEvaluate('camera1', viewport2);

    // Should be different cache entries
    expect(result2.viewportKey.dpr).toBe(2.0);
    expect(result1.viewportKey.dpr).toBe(1.0);
  });

  it('handles multiple cameras independently', () => {
    const camera1 = createPerspectiveCamera('camera1');
    const camera2 = createOrthographicCamera('camera2');
    const table = createCameraTable([camera1, camera2]);
    store.setCameraTable(table);

    const result1 = store.getOrEvaluate('camera1', testViewport);
    const result2 = store.getOrEvaluate('camera2', testViewport);

    // Different cameras should produce different results
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
  });

  it('invalidateAll clears all cache entries', () => {
    const camera = createPerspectiveCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);

    const result1 = store.getOrEvaluate('camera1', testViewport);
    store.invalidateAll();
    const result2 = store.getOrEvaluate('camera1', testViewport);

    // Should be a fresh evaluation (different object)
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
  });

  it('invalidateCamera clears specific camera', () => {
    const camera1 = createPerspectiveCamera('camera1');
    const camera2 = createPerspectiveCamera('camera2');
    const table = createCameraTable([camera1, camera2]);
    store.setCameraTable(table);

    const result1a = store.getOrEvaluate('camera1', testViewport);
    const result2a = store.getOrEvaluate('camera2', testViewport);

    store.invalidateCamera('camera1');

    const result1b = store.getOrEvaluate('camera1', testViewport);
    const result2b = store.getOrEvaluate('camera2', testViewport);

    // camera1 should be re-evaluated
    expect(result1b.viewMat4).not.toBe(result1a.viewMat4);

    // camera2 should still be cached
    expect(result2b.viewMat4).toBe(result2a.viewMat4);
  });

  it('setCameraTable clears cache', () => {
    const camera1 = createPerspectiveCamera('camera1');
    const table1 = createCameraTable([camera1]);
    store.setCameraTable(table1);

    const result1 = store.getOrEvaluate('camera1', testViewport);

    // Set new table (even with same camera)
    const camera2 = createPerspectiveCamera('camera1');
    const table2 = createCameraTable([camera2]);
    store.setCameraTable(table2);

    const result2 = store.getOrEvaluate('camera1', testViewport);

    // Should be a fresh evaluation
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
  });

  it('getStats returns correct cache statistics', () => {
    const camera1 = createPerspectiveCamera('camera1');
    const camera2 = createPerspectiveCamera('camera2');
    const table = createCameraTable([camera1, camera2]);
    store.setCameraTable(table);

    // Initially empty
    let stats = store.getStats();
    expect(stats.totalCameras).toBe(0);
    expect(stats.totalEntries).toBe(0);

    // Evaluate camera1 with two viewports
    store.getOrEvaluate('camera1', { width: 1920, height: 1080, dpr: 1.0 });
    store.getOrEvaluate('camera1', { width: 1280, height: 720, dpr: 1.0 });

    // Evaluate camera2 with one viewport
    store.getOrEvaluate('camera2', { width: 1920, height: 1080, dpr: 1.0 });

    stats = store.getStats();
    expect(stats.totalCameras).toBe(2);
    expect(stats.totalEntries).toBe(3);
    expect(stats.entriesPerCamera['camera1']).toBe(2);
    expect(stats.entriesPerCamera['camera2']).toBe(1);
  });
});

// =============================================================================
// Cache Key Tests
// =============================================================================

describe('CameraStore - Cache Key Behavior', () => {
  let store: CameraStore;

  beforeEach(() => {
    store = new CameraStore();
    const camera = createPerspectiveCamera('camera1');
    const table = createCameraTable([camera]);
    store.setCameraTable(table);
  });

  it('same viewport dimensions hit cache', () => {
    const viewport1: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };
    const viewport2: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };

    const result1 = store.getOrEvaluate('camera1', viewport1);
    const result2 = store.getOrEvaluate('camera1', viewport2);

    // Should be same cached result
    expect(result2.viewMat4).toBe(result1.viewMat4);
  });

  it('different width misses cache', () => {
    const viewport1: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };
    const viewport2: ViewportInfo = { width: 1921, height: 1080, dpr: 1.0 };

    const result1 = store.getOrEvaluate('camera1', viewport1);
    const result2 = store.getOrEvaluate('camera1', viewport2);

    // Should be different results
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
  });

  it('different height misses cache', () => {
    const viewport1: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };
    const viewport2: ViewportInfo = { width: 1920, height: 1081, dpr: 1.0 };

    const result1 = store.getOrEvaluate('camera1', viewport1);
    const result2 = store.getOrEvaluate('camera1', viewport2);

    // Should be different results
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
  });

  it('different DPR misses cache', () => {
    const viewport1: ViewportInfo = { width: 1920, height: 1080, dpr: 1.0 };
    const viewport2: ViewportInfo = { width: 1920, height: 1080, dpr: 2.0 };

    const result1 = store.getOrEvaluate('camera1', viewport1);
    const result2 = store.getOrEvaluate('camera1', viewport2);

    // Should be different results
    expect(result2.viewMat4).not.toBe(result1.viewMat4);
  });
});
