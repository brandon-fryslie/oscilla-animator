/**
 * @file Camera Matrix Tests
 * @description Unit tests for camera matrix math utilities
 */

import { describe, it, expect } from 'vitest';
import {
  quatToMat4,
  buildViewMatrix,
  buildPerspectiveMatrix,
  buildOrthographicMatrix,
  multiplyMat4,
} from '../cameraMatrix';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Compare two Float32Arrays with tolerance for floating point errors
 */
function expectMatricesClose(
  actual: Float32Array,
  expected: Float32Array,
  tolerance = 0.0001
): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThan(tolerance);
  }
}

/**
 * Normalize a quaternion (for test setup)
 */
function normalizeQuat(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { x: number; y: number; z: number; w: number } {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return {
    x: q.x / len,
    y: q.y / len,
    z: q.z / len,
    w: q.w / len,
  };
}

// =============================================================================
// Quaternion to Matrix Tests
// =============================================================================

describe('quatToMat4', () => {
  it('identity quaternion produces identity matrix', () => {
    const q = { x: 0, y: 0, z: 0, w: 1 };
    const mat = quatToMat4(q);

    const expected = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    expectMatricesClose(mat, expected);
  });

  it('90-degree rotation around Z-axis', () => {
    // 90 degrees around Z: sin(45°) = cos(45°) ≈ 0.7071
    const q = normalizeQuat({ x: 0, y: 0, z: 0.7071, w: 0.7071 });
    const mat = quatToMat4(q);

    // Expected: rotate 90° CCW around Z
    // [ 0 -1  0  0 ]
    // [ 1  0  0  0 ]
    // [ 0  0  1  0 ]
    // [ 0  0  0  1 ]
    const expected = new Float32Array([
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    expectMatricesClose(mat, expected, 0.001);
  });

  it('180-degree rotation around Y-axis', () => {
    // 180 degrees around Y: quat = (0, 1, 0, 0)
    const q = { x: 0, y: 1, z: 0, w: 0 };
    const mat = quatToMat4(q);

    // Expected: rotate 180° around Y
    // [ -1  0  0  0 ]
    // [  0  1  0  0 ]
    // [  0  0 -1  0 ]
    // [  0  0  0  1 ]
    const expected = new Float32Array([
      -1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1,
    ]);

    expectMatricesClose(mat, expected, 0.001);
  });

  it('produces orthogonal matrix (R^T * R = I)', () => {
    const q = normalizeQuat({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 });
    const R = quatToMat4(q);

    // Extract 3x3 rotation part
    const R3x3 = [
      [R[0], R[4], R[8]],
      [R[1], R[5], R[9]],
      [R[2], R[6], R[10]],
    ];

    // Compute R^T * R (should be identity)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let dot = 0;
        for (let k = 0; k < 3; k++) {
          dot += R3x3[k][i] * R3x3[k][j];
        }
        const expectedValue = i === j ? 1 : 0;
        expect(Math.abs(dot - expectedValue)).toBeLessThan(0.001);
      }
    }
  });
});

// =============================================================================
// View Matrix Tests
// =============================================================================

describe('buildViewMatrix', () => {
  it('identity pose produces identity matrix', () => {
    const position = { x: 0, y: 0, z: 0 };
    const orientation = { x: 0, y: 0, z: 0, w: 1 };
    const view = buildViewMatrix(position, orientation);

    const expected = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    expectMatricesClose(view, expected);
  });

  it('translation only produces negated translation', () => {
    const position = { x: 10, y: 20, z: 30 };
    const orientation = { x: 0, y: 0, z: 0, w: 1 };
    const view = buildViewMatrix(position, orientation);

    // View matrix should have -position in translation column
    expect(Math.abs(view[12] - (-10))).toBeLessThan(0.001);
    expect(Math.abs(view[13] - (-20))).toBeLessThan(0.001);
    expect(Math.abs(view[14] - (-30))).toBeLessThan(0.001);
  });

  it('camera at (0, 0, 5) looking at origin', () => {
    const position = { x: 0, y: 0, z: 5 };
    const orientation = { x: 0, y: 0, z: 0, w: 1 }; // Identity rotation
    const view = buildViewMatrix(position, orientation);

    // Translation should be (0, 0, -5)
    expect(Math.abs(view[12] - 0)).toBeLessThan(0.001);
    expect(Math.abs(view[13] - 0)).toBeLessThan(0.001);
    expect(Math.abs(view[14] - (-5))).toBeLessThan(0.001);
  });
});

// =============================================================================
// Perspective Matrix Tests
// =============================================================================

describe('buildPerspectiveMatrix', () => {
  it('produces perspective matrix with correct structure', () => {
    const fovYRad = Math.PI / 4; // 45 degrees (not 90)
    const aspect = 16 / 9;
    const near = 0.1;
    const far = 100;

    const proj = buildPerspectiveMatrix(fovYRad, aspect, near, far);

    // Check matrix is not identity (45 degree FOV should give f > 1)
    expect(proj[0]).not.toBe(0);
    expect(proj[5]).not.toBe(0);

    // Check [3,2] is -1 (perspective division)
    expect(Math.abs(proj[11] - (-1))).toBeLessThan(0.001);

    // Check [3,3] is 0 (no w offset)
    expect(Math.abs(proj[15])).toBeLessThan(0.001);
  });

  it('field of view affects projection scale', () => {
    const aspect = 1.0;
    const near = 0.1;
    const far = 100;

    const proj45 = buildPerspectiveMatrix(Math.PI / 4, aspect, near, far);
    const proj90 = buildPerspectiveMatrix(Math.PI / 2, aspect, near, far);

    // Smaller FOV = larger scale (tighter view)
    expect(proj45[0]).toBeGreaterThan(proj90[0]);
    expect(proj45[5]).toBeGreaterThan(proj90[5]);
  });

  it('aspect ratio affects X scale', () => {
    const fovYRad = Math.PI / 2;
    const near = 0.1;
    const far = 100;

    const proj1x1 = buildPerspectiveMatrix(fovYRad, 1.0, near, far);
    const proj2x1 = buildPerspectiveMatrix(fovYRad, 2.0, near, far);

    // Wider aspect = smaller X scale
    expect(proj2x1[0]).toBeLessThan(proj1x1[0]);
    // Y scale unchanged
    expect(Math.abs(proj2x1[5] - proj1x1[5])).toBeLessThan(0.001);
  });
});

// =============================================================================
// Orthographic Matrix Tests
// =============================================================================

describe('buildOrthographicMatrix', () => {
  it('produces orthographic matrix with correct structure', () => {
    const orthoHeight = 10;
    const aspect = 16 / 9;
    const near = 0.1;
    const far = 100;

    const proj = buildOrthographicMatrix(orthoHeight, aspect, near, far);

    // Check matrix has no perspective (row 3 is [0, 0, ?, 1])
    expect(Math.abs(proj[3])).toBeLessThan(0.001);
    expect(Math.abs(proj[7])).toBeLessThan(0.001);
    expect(Math.abs(proj[15] - 1)).toBeLessThan(0.001);

    // Check [3,2] is 0 (no perspective division)
    expect(Math.abs(proj[11])).toBeLessThan(0.001);
  });

  it('ortho height affects Y scale', () => {
    const aspect = 1.0;
    const near = 0.1;
    const far = 100;

    const proj5 = buildOrthographicMatrix(5, aspect, near, far);
    const proj10 = buildOrthographicMatrix(10, aspect, near, far);

    // Smaller height = larger scale (more zoomed in)
    expect(proj5[5]).toBeGreaterThan(proj10[5]);
  });

  it('aspect ratio affects X scale', () => {
    const orthoHeight = 10;
    const near = 0.1;
    const far = 100;

    const proj1x1 = buildOrthographicMatrix(orthoHeight, 1.0, near, far);
    const proj2x1 = buildOrthographicMatrix(orthoHeight, 2.0, near, far);

    // Wider aspect = smaller X scale
    expect(proj2x1[0]).toBeLessThan(proj1x1[0]);
    // Y scale unchanged
    expect(Math.abs(proj2x1[5] - proj1x1[5])).toBeLessThan(0.001);
  });
});

// =============================================================================
// Matrix Multiplication Tests
// =============================================================================

describe('multiplyMat4', () => {
  it('identity * identity = identity', () => {
    const I = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    const result = multiplyMat4(I, I);

    expectMatricesClose(result, I);
  });

  it('matrix * identity = matrix', () => {
    const M = new Float32Array([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ]);

    const I = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    const result = multiplyMat4(M, I);

    expectMatricesClose(result, M);
  });

  it('two translation matrices compose correctly', () => {
    // Translate by (10, 0, 0)
    const T1 = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 0, 0, 1,
    ]);

    // Translate by (0, 20, 0)
    const T2 = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 20, 0, 1,
    ]);

    const result = multiplyMat4(T1, T2);

    // Expected: translate by (10, 20, 0)
    const expected = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 0, 1,
    ]);

    expectMatricesClose(result, expected);
  });

  it('view-projection composition', () => {
    // Simple view matrix (identity)
    const view = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    // Simple perspective matrix
    const proj = buildPerspectiveMatrix(Math.PI / 2, 1.0, 0.1, 100);

    // Should multiply without error
    const viewProj = multiplyMat4(proj, view);

    expect(viewProj.length).toBe(16);
    // Basic sanity check: not all zeros
    const sum = Array.from(viewProj).reduce((a, b) => a + Math.abs(b), 0);
    expect(sum).toBeGreaterThan(0);
  });
});

// =============================================================================
// Integration Tests: Full Camera Pipeline
// =============================================================================

describe('Camera Pipeline Integration', () => {
  it('full perspective camera evaluation', () => {
    const position = { x: 0, y: 0, z: 5 };
    const orientation = { x: 0, y: 0, z: 0, w: 1 };

    const view = buildViewMatrix(position, orientation);
    const proj = buildPerspectiveMatrix(Math.PI / 2, 16 / 9, 0.1, 100);
    const viewProj = multiplyMat4(proj, view);

    // Basic validation: matrices produced
    expect(view.length).toBe(16);
    expect(proj.length).toBe(16);
    expect(viewProj.length).toBe(16);

    // View matrix should have translation
    expect(view[14]).not.toBe(0);

    // Proj matrix should have perspective divide
    expect(proj[11]).toBe(-1);

    // ViewProj should combine both
    expect(viewProj[11]).toBe(-1);
  });

  it('full orthographic camera evaluation', () => {
    const position = { x: 0, y: 0, z: 5 };
    const orientation = { x: 0, y: 0, z: 0, w: 1 };

    const view = buildViewMatrix(position, orientation);
    const proj = buildOrthographicMatrix(10, 16 / 9, 0.1, 100);
    const viewProj = multiplyMat4(proj, view);

    // Basic validation: matrices produced
    expect(view.length).toBe(16);
    expect(proj.length).toBe(16);
    expect(viewProj.length).toBe(16);

    // Ortho has no perspective divide
    expect(proj[11]).toBe(0);
    expect(proj[15]).toBe(1);
  });
});

// =============================================================================
// Float32 Determinism Tests
// =============================================================================

describe('Float32 Determinism', () => {
  it('quatToMat4 produces identical results on repeated calls', () => {
    const q = normalizeQuat({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 });

    const mat1 = quatToMat4(q);
    const mat2 = quatToMat4(q);

    // Should be bitwise identical
    for (let i = 0; i < 16; i++) {
      expect(mat1[i]).toBe(mat2[i]);
    }
  });

  it('buildViewMatrix produces identical results on repeated calls', () => {
    const position = { x: 1.5, y: 2.5, z: 3.5 };
    const orientation = normalizeQuat({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 });

    const view1 = buildViewMatrix(position, orientation);
    const view2 = buildViewMatrix(position, orientation);

    // Should be bitwise identical
    for (let i = 0; i < 16; i++) {
      expect(view1[i]).toBe(view2[i]);
    }
  });

  it('buildPerspectiveMatrix produces identical results on repeated calls', () => {
    const fovYRad = Math.PI / 3;
    const aspect = 16 / 9;
    const near = 0.1;
    const far = 100;

    const proj1 = buildPerspectiveMatrix(fovYRad, aspect, near, far);
    const proj2 = buildPerspectiveMatrix(fovYRad, aspect, near, far);

    // Should be bitwise identical
    for (let i = 0; i < 16; i++) {
      expect(proj1[i]).toBe(proj2[i]);
    }
  });
});
