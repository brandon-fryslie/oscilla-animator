/**
 * @file Mesh Materialization - Execute mesh recipes to produce buffers
 * @description Main entry point for procedural mesh generation
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md §3
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md §2
 */

import type { MeshIR, MeshBufferRef } from '../../compiler/ir/types3d';
import { generateProfile, extrudeProfile } from './extrudeGeometry';

// ============================================================================
// Mesh Materialization Entry Point
// ============================================================================

/**
 * Materialize a mesh from its recipe
 *
 * This is the main entry point for mesh generation.
 * Converts a procedural MeshIR recipe into concrete geometry buffers.
 *
 * @param mesh - Mesh IR recipe
 * @returns Materialized mesh with positions, normals, uvs, and indices
 */
export function materializeMesh(mesh: MeshIR): MeshBufferRef {
  // 1. Generate 2D profile
  const profile = generateProfile(mesh.recipe.profile);

  // 2. Extrude profile to 3D
  const extruded = extrudeProfile(profile, mesh.recipe.extrude, {
    normals: mesh.attributes.normals,
    uvs: mesh.attributes.uvs,
  });

  // 3. Compute bounding box
  const bounds = computeBounds(extruded.positions);

  // 4. Validate index type
  const vertCount = extruded.positions.length / 3;
  if (mesh.indexType === 'u16' && vertCount > 65535) {
    throw new Error(
      `Mesh ${mesh.id} has ${vertCount} vertices but uses u16 indices (max 65535)`
    );
  }

  // 5. Ensure index buffer matches requested type
  let indices: Uint16Array | Uint32Array;
  if (mesh.indexType === 'u32') {
    if (extruded.indices instanceof Uint32Array) {
      indices = extruded.indices;
    } else {
      // Promote u16 to u32
      indices = new Uint32Array(extruded.indices);
    }
  } else {
    if (extruded.indices instanceof Uint16Array) {
      indices = extruded.indices;
    } else {
      throw new Error(
        `Mesh ${mesh.id} has ${vertCount} vertices and requires u32 indices, but indexType is u16`
      );
    }
  }

  return {
    positions: extruded.positions,
    normals: extruded.normals,
    uvs: extruded.uvs,
    indices,
    bounds,
  };
}

// ============================================================================
// Bounding Box Computation
// ============================================================================

/**
 * Compute axis-aligned bounding box from vertex positions
 *
 * @param positions - Vertex positions (xyz packed)
 * @returns Bounding box with min and max corners
 */
function computeBounds(positions: Float32Array): {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
} {
  if (positions.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);

    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}
