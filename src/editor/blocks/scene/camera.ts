/**
 * @file Camera block - 3D camera configuration
 *
 * Defines a 3D camera with lookAt pose (position, target, up) and projection parameters.
 * Output is a CameraRef (resource reference, not signal/field) that can be wired to render sinks.
 *
 * Architecture:
 * - Block inputs: lookAt vectors (position/target/up) for intuitive UI
 * - Lowering: Converts lookAt → quaternion during compilation
 * - CameraIR: Stores quaternion (matches existing types3d.ts)
 * - Runtime: Uses evaluateCamera() which expects quaternion
 */
import { createBlock } from '../factory';
import { input, output } from '../utils';

/**
 * Camera - 3D camera with lookAt pose and projection parameters.
 *
 * Inputs use lookAt pattern (position, target, up) for intuitive editing.
 * During compilation, these are converted to quaternion orientation for the IR.
 *
 * Output is Special:CameraRef - a resource reference (not signal/field).
 * This reference can be wired to 3D render sinks.
 */
export const Camera = createBlock({
  type: 'Camera',
  label: 'Camera',
  description: '3D camera with lookAt pose and projection parameters',

  inputs: [
    // Pose inputs (lookAt pattern - converted to quat during lowering)
    input('position', 'Position', 'Signal<vec3>', {
      tier: 'primary',
      defaultSource: {
        value: { x: 0, y: 0, z: 100 },
        world: 'signal',
        uiHint: { kind: 'vec3' },
      },
    }),

    input('target', 'Target', 'Signal<vec3>', {
      tier: 'primary',
      defaultSource: {
        value: { x: 0, y: 0, z: 0 },
        world: 'signal',
        uiHint: { kind: 'vec3' },
      },
    }),

    input('up', 'Up', 'Signal<vec3>', {
      tier: 'secondary',
      defaultSource: {
        value: { x: 0, y: 1, z: 0 },
        world: 'signal',
        uiHint: { kind: 'vec3' },
      },
    }),

    // Projection parameters
    input('projectionKind', 'Projection', 'Scalar:string', {
      tier: 'primary',
      defaultSource: {
        value: 'perspective',
        world: 'scalar',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'perspective', label: 'Perspective' },
            { value: 'orthographic', label: 'Orthographic' },
          ],
        },
      },
    }),

    input('fovYDeg', 'FOV (deg)', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 60,
        world: 'signal',
        uiHint: { kind: 'slider', min: 10, max: 120, step: 1 },
      },
    }),

    input('orthoHeight', 'Ortho Height', 'Signal<number>', {
      tier: 'secondary',
      defaultSource: {
        value: 10,
        world: 'signal',
        uiHint: { kind: 'number', min: 0.1, max: 1000, step: 0.1 },
      },
    }),

    input('near', 'Near Plane', 'Signal<number>', {
      tier: 'secondary',
      defaultSource: {
        value: 0.1,
        world: 'signal',
        uiHint: { kind: 'number', min: 0.001, max: 100, step: 0.001 },
      },
    }),

    input('far', 'Far Plane', 'Signal<number>', {
      tier: 'secondary',
      defaultSource: {
        value: 1000,
        world: 'signal',
        uiHint: { kind: 'number', min: 1, max: 100000, step: 1 },
      },
    }),
  ],

  outputs: [
    // CameraRef output - resource reference (not signal/field)
    // This is a typed ID that routes which camera to use
    output('camera', 'Camera', 'Special:cameraRef'),
  ],

  color: '#6366F1', // Indigo for 3D scene blocks
  laneKind: 'Scene',
  priority: 10, // High priority - cameras should appear early in scene
});
