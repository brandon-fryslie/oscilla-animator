/**
 * @file Camera Runtime - Public API
 * @description Camera evaluation and caching for 3D rendering
 */

// Matrix utilities (pure functions)
export {
  buildViewMatrix,
  buildPerspectiveMatrix,
  buildOrthographicMatrix,
  multiplyMat4,
  quatToMat4,
} from './cameraMatrix';

// Camera evaluation
export { evaluateCamera, type ViewportInfo } from './evaluateCamera';

// Camera store (runtime cache)
export { CameraStore } from './CameraStore';
