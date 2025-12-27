/**
 * @file Camera Evaluation
 * @description Evaluate CameraIR to CameraEval (matrices)
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md (Camera evaluation contract)
 */

import type { CameraIR, CameraEval } from '../../compiler/ir/types3d';
import {
  buildViewMatrix,
  buildPerspectiveMatrix,
  buildOrthographicMatrix,
  multiplyMat4,
} from './cameraMatrix';

/**
 * Viewport information for camera evaluation
 */
export interface ViewportInfo {
  /** Viewport width in pixels */
  width: number;

  /** Viewport height in pixels */
  height: number;

  /** Device pixel ratio */
  dpr: number;
}

/**
 * Evaluate CameraIR to CameraEval (matrices)
 *
 * This function computes the view, projection, and view-projection matrices
 * for a given camera and viewport.
 *
 * Cache key: (cameraId, viewport.width, viewport.height, viewport.dpr, cameraIRHash)
 *
 * @param camera - Camera IR definition
 * @param viewport - Viewport dimensions and DPR
 * @returns Evaluated camera matrices
 *
 * CRITICAL:
 * - All math uses float32 (Math.fround) for determinism
 * - Quaternion must be normalized before this function is called
 * - Aspect ratio is computed from viewport dimensions
 */
export function evaluateCamera(
  camera: CameraIR,
  viewport: ViewportInfo
): CameraEval {
  // Validate camera convention (must match locked values)
  if (camera.handedness !== 'right') {
    throw new Error(
      `Camera handedness must be 'right', got '${camera.handedness}'`
    );
  }
  if (camera.forwardAxis !== '-Z') {
    throw new Error(
      `Camera forwardAxis must be '-Z', got '${camera.forwardAxis}'`
    );
  }
  if (camera.upAxis !== '+Y') {
    throw new Error(
      `Camera upAxis must be '+Y', got '${camera.upAxis}'`
    );
  }

  // Compute aspect ratio (float32)
  const aspect = Math.fround(viewport.width / viewport.height);

  // Build view matrix (world to camera space)
  const viewMat4 = buildViewMatrix(camera.pose.position, camera.pose.orientation);

  // Build projection matrix (camera to clip space)
  let projMat4: Float32Array;

  if (camera.projection.kind === 'perspective') {
    const fovYRad = camera.projection.fovYRad;
    if (fovYRad === undefined) {
      throw new Error(
        'Perspective camera must have fovYRad defined'
      );
    }
    if (fovYRad <= 0 || fovYRad >= Math.PI) {
      throw new Error(
        `Perspective fovYRad must be in (0, π), got ${fovYRad}`
      );
    }

    projMat4 = buildPerspectiveMatrix(
      fovYRad,
      aspect,
      camera.projection.near,
      camera.projection.far
    );
  } else if (camera.projection.kind === 'orthographic') {
    const orthoHeight = camera.projection.orthoHeight;
    if (orthoHeight === undefined) {
      throw new Error(
        'Orthographic camera must have orthoHeight defined'
      );
    }
    if (orthoHeight <= 0) {
      throw new Error(
        `Orthographic orthoHeight must be > 0, got ${orthoHeight}`
      );
    }

    projMat4 = buildOrthographicMatrix(
      orthoHeight,
      aspect,
      camera.projection.near,
      camera.projection.far
    );
  } else {
    throw new Error(
      `Unknown projection kind: ${(camera.projection as any).kind}`
    );
  }

  // Validate near/far planes
  if (camera.projection.near <= 0) {
    throw new Error(
      `Camera near plane must be > 0, got ${camera.projection.near}`
    );
  }
  if (camera.projection.far <= camera.projection.near) {
    throw new Error(
      `Camera far plane must be > near, got near=${camera.projection.near} far=${camera.projection.far}`
    );
  }

  // Build combined view-projection matrix
  const viewProjMat4 = multiplyMat4(projMat4, viewMat4);

  // Return evaluated camera
  return {
    viewMat4,
    projMat4,
    viewProjMat4,
    viewportKey: {
      w: viewport.width,
      h: viewport.height,
      dpr: viewport.dpr,
    },
  };
}
