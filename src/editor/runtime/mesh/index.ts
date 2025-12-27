/**
 * @file Mesh Runtime Module
 * @description Procedural mesh generation and caching
 */

export { MeshStore } from './MeshStore';
export { materializeMesh } from './materializeMesh';
export {
  generateProfile,
  extrudeProfile,
  type ProfilePoint,
  type ExtrusionResult,
  type ExtrudeOptions,
} from './extrudeGeometry';
