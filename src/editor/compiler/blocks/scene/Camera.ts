/**
 * Camera Block Compiler
 *
 * Compiles Camera blocks to IR by:
 * 1. Extracting lookAt vectors (position, target, up) from inputs
 * 2. Converting lookAt → quaternion orientation
 * 3. Registering CameraIR in the camera table
 * 4. Returning a Special<camera> reference
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md (Camera conventions)
 * - src/editor/blocks/scene/camera.ts (Block definition)
 */

import { registerBlockType, type BlockLowerFn, type ValueRefPacked } from '../../ir/lowerTypes';
import type { CameraIR, ProjectionKind } from '../../ir/types3d';

// =============================================================================
// LookAt → Quaternion Conversion
// =============================================================================

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Subtract two vectors: a - b
 */
function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Compute vector length
 */
function vec3Len(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Normalize a vector (returns zero vector if input is zero-length)
 */
function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Len(v);
  if (len < 1e-10) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Cross product: a × b
 */
function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Negate a vector
 */
function vec3Negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

/**
 * Convert lookAt vectors to quaternion orientation.
 *
 * Convention: Camera looks down -Z, Y is up.
 * This means the camera's local -Z axis should point at the target.
 *
 * @param position - Camera position
 * @param target - Point the camera looks at
 * @param up - World up vector (typically {0, 1, 0})
 * @returns Unit quaternion representing camera orientation
 */
export function lookAtToQuaternion(position: Vec3, target: Vec3, up: Vec3): Quat {
  // Compute the direction from camera to target
  const lookDir = vec3Normalize(vec3Sub(target, position));

  // Camera convention: camera looks down -Z
  // So the camera's local -Z should align with lookDir
  // This means the camera's local +Z = -lookDir
  const forward = vec3Negate(lookDir); // Camera's +Z axis (opposite of look direction)

  // Compute right vector (camera's +X axis)
  let right = vec3Cross(up, forward);
  const rightLen = vec3Len(right);

  // Handle degenerate case: looking straight up or down
  if (rightLen < 1e-6) {
    // Use a fallback perpendicular vector
    const fallbackUp = Math.abs(up.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    right = vec3Normalize(vec3Cross(fallbackUp, forward));
  } else {
    right = { x: right.x / rightLen, y: right.y / rightLen, z: right.z / rightLen };
  }

  // Compute corrected up vector (camera's +Y axis)
  const correctedUp = vec3Cross(forward, right);

  // Build rotation matrix from column vectors: [right, correctedUp, forward]
  // Note: These are the columns of the rotation matrix
  // m00=right.x,  m01=up.x,   m02=forward.x
  // m10=right.y,  m11=up.y,   m12=forward.y
  // m20=right.z,  m21=up.z,   m22=forward.z
  const m00 = right.x, m01 = correctedUp.x, m02 = forward.x;
  const m10 = right.y, m11 = correctedUp.y, m12 = forward.y;
  const m20 = right.z, m21 = correctedUp.z, m22 = forward.z;

  // Convert rotation matrix to quaternion
  // Using the Shepperd method for numerical stability
  const trace = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  // Normalize quaternion (should already be close to unit, but ensure it)
  const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  return {
    x: qx / len,
    y: qy / len,
    z: qz / len,
    w: qw / len,
  };
}

// =============================================================================
// Helper: Extract constant value from input
// =============================================================================

/**
 * Extract a constant value from a ValueRefPacked.
 *
 * For now, Camera only supports compile-time constant inputs.
 * Future: support signal inputs for animated cameras.
 */
function extractConstValue<T>(
  input: ValueRefPacked,
  constPool: readonly unknown[],
  inputName: string,
): T {
  if (input.k !== 'scalarConst') {
    throw new Error(
      `Camera.${inputName}: expected scalarConst, got ${input.k}. ` +
        'Dynamic (signal) cameras are not yet supported.',
    );
  }
  return constPool[input.constId] as T;
}

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower Camera block to IR.
 *
 * Inputs (from block definition):
 * 0. position: Signal<vec3> (currently resolved to scalarConst from defaultSource)
 * 1. target: Signal<vec3>
 * 2. up: Signal<vec3>
 * 3. projectionKind: Scalar<string>
 * 4. fovYDeg: Signal<float>
 * 5. orthoHeight: Signal<float>
 * 6. near: Signal<float>
 * 7. far: Signal<float>
 *
 * Output:
 * 0. camera: Special<cameraRef>
 */
const lowerCamera: BlockLowerFn = ({ ctx, inputs }) => {
  const [
    positionInput,
    targetInput,
    upInput,
    projectionKindInput,
    fovYDegInput,
    orthoHeightInput,
    nearInput,
    farInput,
  ] = inputs;

  // Get constant pool for extracting values
  const constPool = ctx.b.getConstPool();

  // Extract position, target, up vectors
  const position = extractConstValue<Vec3>(positionInput, constPool, 'position');
  const target = extractConstValue<Vec3>(targetInput, constPool, 'target');
  const up = extractConstValue<Vec3>(upInput, constPool, 'up');

  // Extract projection parameters
  const projectionKind = extractConstValue<string>(
    projectionKindInput,
    constPool,
    'projectionKind',
  ) as ProjectionKind;
  const fovYDeg = extractConstValue<number>(fovYDegInput, constPool, 'fovYDeg');
  const orthoHeight = extractConstValue<number>(orthoHeightInput, constPool, 'orthoHeight');
  const near = extractConstValue<number>(nearInput, constPool, 'near');
  const far = extractConstValue<number>(farInput, constPool, 'far');

  // Convert lookAt → quaternion
  const orientation = lookAtToQuaternion(position, target, up);

  // Convert fovY from degrees to radians
  const fovYRad = (fovYDeg * Math.PI) / 180;

  // Validate projection parameters (epsilon validation will be P1-2)
  if (near <= 0) {
    throw new Error(`Camera near plane must be > 0, got ${near}`);
  }
  if (far <= near) {
    throw new Error(`Camera far plane must be > near, got near=${near} far=${far}`);
  }
  if (projectionKind === 'perspective') {
    if (fovYRad <= 0 || fovYRad >= Math.PI) {
      throw new Error(`Camera fovYRad must be in (0, π), got ${fovYRad} (${fovYDeg}°)`);
    }
  } else if (projectionKind === 'orthographic') {
    if (orthoHeight <= 0) {
      throw new Error(`Camera orthoHeight must be > 0, got ${orthoHeight}`);
    }
  }

  // Build CameraIR
  const cameraIR: CameraIR = {
    id: ctx.instanceId, // Use block's instance ID for uniqueness
    handedness: 'right',
    forwardAxis: '-Z',
    upAxis: '+Y',
    projection: {
      kind: projectionKind,
      near,
      far,
      fovYRad: projectionKind === 'perspective' ? fovYRad : undefined,
      orthoHeight: projectionKind === 'orthographic' ? orthoHeight : undefined,
    },
    pose: {
      position: { x: position.x, y: position.y, z: position.z },
      orientation,
    },
    ndcToScreen: {
      origin: 'center',
      yAxis: 'down',
    },
  };

  // Register camera in the camera table
  const cameraIdx = ctx.b.addCamera(cameraIR);

  // Return Special<camera> reference
  // For special types, the id IS the slot (camera index in the table)
  const cameraRef: ValueRefPacked = {
    k: 'special',
    tag: 'camera',
    id: cameraIdx,
  };

  return {
    outputs: [cameraRef],
  };
};

// =============================================================================
// Block Registration
// =============================================================================

registerBlockType({
  type: 'Camera',
  capability: 'pure', // Pure computation - produces a static camera definition
  inputs: [
    {
      portId: 'position',
      label: 'Position',
      dir: 'in',
      type: { world: "signal", domain: "vec3", category: "core", busEligible: true },
      defaultSource: { value: { x: 0, y: 0, z: 100 } },
    },
    {
      portId: 'target',
      label: 'Target',
      dir: 'in',
      type: { world: "signal", domain: "vec3", category: "core", busEligible: true },
      defaultSource: { value: { x: 0, y: 0, z: 0 } },
    },
    {
      portId: 'up',
      label: 'Up',
      dir: 'in',
      type: { world: "signal", domain: "vec3", category: "core", busEligible: true },
      defaultSource: { value: { x: 0, y: 1, z: 0 } },
    },
    {
      portId: 'projectionKind',
      label: 'Projection',
      dir: 'in',
      type: { world: "scalar", domain: "string", category: "internal", busEligible: false },
      defaultSource: { value: 'perspective' },
    },
    {
      portId: 'fovYDeg',
      label: 'FOV (deg)',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 60 },
    },
    {
      portId: 'orthoHeight',
      label: 'Ortho Height',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 10 },
    },
    {
      portId: 'near',
      label: 'Near',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0.1 },
    },
    {
      portId: 'far',
      label: 'Far',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 1000 },
    },
  ],
  outputs: [
    {
      portId: 'camera',
      label: 'Camera',
      dir: 'out',
      type: { world: "config", domain: "camera", category: "internal", busEligible: false },
    },
  ],
  lower: lowerCamera,
});
