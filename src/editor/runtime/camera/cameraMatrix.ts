/**
 * @file Camera Matrix Utilities
 * @description Pure float32 matrix math for camera evaluation
 *
 * Convention: Right-handed, -Z forward, +Y up, column-major matrices
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md
 */

// =============================================================================
// Quaternion to Matrix Conversion
// =============================================================================

/**
 * Build rotation matrix from unit quaternion
 * @param q - Unit quaternion {x, y, z, w}
 * @returns 4x4 rotation matrix (column-major, Float32)
 *
 * CRITICAL: Input quaternion MUST be normalized before calling this function.
 * No normalization is performed internally for performance.
 */
export function quatToMat4(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): Float32Array {
  const out = new Float32Array(16);

  // Convert to float32 explicitly
  const x = Math.fround(q.x);
  const y = Math.fround(q.y);
  const z = Math.fround(q.z);
  const w = Math.fround(q.w);

  // Pre-compute common terms (float32)
  const x2 = Math.fround(x + x);
  const y2 = Math.fround(y + y);
  const z2 = Math.fround(z + z);

  const xx = Math.fround(x * x2);
  const xy = Math.fround(x * y2);
  const xz = Math.fround(x * z2);
  const yy = Math.fround(y * y2);
  const yz = Math.fround(y * z2);
  const zz = Math.fround(z * z2);
  const wx = Math.fround(w * x2);
  const wy = Math.fround(w * y2);
  const wz = Math.fround(w * z2);

  // Column-major 4x4 matrix
  out[0] = Math.fround(1 - (yy + zz));
  out[1] = Math.fround(xy + wz);
  out[2] = Math.fround(xz - wy);
  out[3] = 0;

  out[4] = Math.fround(xy - wz);
  out[5] = Math.fround(1 - (xx + zz));
  out[6] = Math.fround(yz + wx);
  out[7] = 0;

  out[8] = Math.fround(xz + wy);
  out[9] = Math.fround(yz - wx);
  out[10] = Math.fround(1 - (xx + yy));
  out[11] = 0;

  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;

  return out;
}

// =============================================================================
// View Matrix Construction
// =============================================================================

/**
 * Build view matrix from camera pose
 * @param position - Camera position {x, y, z}
 * @param orientation - Camera orientation (unit quaternion {x, y, z, w})
 * @returns View matrix (world to camera space, column-major Float32)
 *
 * Convention: right-handed, -Z forward, +Y up
 * CRITICAL: Quaternion must be normalized before calling
 */
export function buildViewMatrix(
  position: { x: number; y: number; z: number },
  orientation: { x: number; y: number; z: number; w: number }
): Float32Array {
  // Build rotation matrix from quaternion
  const R = quatToMat4(orientation);

  // View matrix is inverse of camera transform
  // For orthogonal rotation R: R^-1 = R^T
  // For translation t: inverse translation is -R^T * t

  const px = Math.fround(position.x);
  const py = Math.fround(position.y);
  const pz = Math.fround(position.z);

  // Transpose rotation part (3x3)
  const out = new Float32Array(16);
  out[0] = R[0];
  out[1] = R[4];
  out[2] = R[8];
  out[3] = 0;

  out[4] = R[1];
  out[5] = R[5];
  out[6] = R[9];
  out[7] = 0;

  out[8] = R[2];
  out[9] = R[6];
  out[10] = R[10];
  out[11] = 0;

  // Translation: -R^T * position
  out[12] = Math.fround(
    -(out[0] * px + out[4] * py + out[8] * pz)
  );
  out[13] = Math.fround(
    -(out[1] * px + out[5] * py + out[9] * pz)
  );
  out[14] = Math.fround(
    -(out[2] * px + out[6] * py + out[10] * pz)
  );
  out[15] = 1;

  return out;
}

// =============================================================================
// Projection Matrix Construction
// =============================================================================

/**
 * Build perspective projection matrix
 * @param fovYRad - Vertical field of view in radians (must be in (0, π))
 * @param aspect - Width / height ratio (must be > 0)
 * @param near - Near plane distance (must be > 0)
 * @param far - Far plane distance (must be > near)
 * @returns Projection matrix (camera to clip space, column-major Float32)
 *
 * Convention: OpenGL/WebGL style (NDC Z in [-1, 1])
 */
export function buildPerspectiveMatrix(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  const out = new Float32Array(16);

  // Convert to float32
  const f = Math.fround(1 / Math.tan(fovYRad / 2));
  const nf = Math.fround(1 / (near - far));

  // Column-major perspective matrix
  out[0] = Math.fround(f / aspect);
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;

  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;

  out[8] = 0;
  out[9] = 0;
  out[10] = Math.fround((far + near) * nf);
  out[11] = -1;

  out[12] = 0;
  out[13] = 0;
  out[14] = Math.fround(2 * far * near * nf);
  out[15] = 0;

  return out;
}

/**
 * Build orthographic projection matrix
 * @param orthoHeight - World units visible vertically
 * @param aspect - Width / height ratio
 * @param near - Near plane distance
 * @param far - Far plane distance (must be > near)
 * @returns Projection matrix (camera to clip space, column-major Float32)
 *
 * Convention: OpenGL/WebGL style (NDC Z in [-1, 1])
 */
export function buildOrthographicMatrix(
  orthoHeight: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  const out = new Float32Array(16);

  // Convert to float32
  const h = Math.fround(orthoHeight / 2);
  const w = Math.fround(h * aspect);
  const nf = Math.fround(1 / (near - far));

  // Column-major orthographic matrix
  // Maps [-w, w] x [-h, h] x [near, far] to [-1, 1]^3
  out[0] = Math.fround(1 / w);
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;

  out[4] = 0;
  out[5] = Math.fround(1 / h);
  out[6] = 0;
  out[7] = 0;

  out[8] = 0;
  out[9] = 0;
  out[10] = Math.fround(2 * nf);
  out[11] = 0;

  out[12] = 0;
  out[13] = 0;
  out[14] = Math.fround((far + near) * nf);
  out[15] = 1;

  return out;
}

// =============================================================================
// Matrix Multiplication
// =============================================================================

/**
 * Multiply two 4x4 matrices (column-major)
 * @param a - First matrix (Float32Array, length 16)
 * @param b - Second matrix (Float32Array, length 16)
 * @returns Product a * b (Float32Array, length 16)
 *
 * All math is float32 for determinism.
 */
export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);

  // For each column in result
  for (let col = 0; col < 4; col++) {
    const bColOffset = col * 4;

    // For each row in result
    for (let row = 0; row < 4; row++) {
      let sum = 0;

      // Dot product of row from a with column from b
      for (let i = 0; i < 4; i++) {
        sum = Math.fround(
          sum + Math.fround(a[i * 4 + row] * b[bColOffset + i])
        );
      }

      out[bColOffset + row] = sum;
    }
  }

  return out;
}
