/**
 * @file Extrude Geometry - Procedural mesh generation from 2D profiles
 * @description Generates 3D meshes by extruding 2D profiles
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md §3
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md §2
 */

import type { ExtrudeProfile2D, ExtrudeKind } from '../../compiler/ir/types3d';

// ============================================================================
// Profile Generation
// ============================================================================

/**
 * 2D profile point
 */
export interface ProfilePoint {
  x: number;
  y: number;
}

/**
 * Generate 2D profile points from profile specification
 *
 * @param profile - Profile specification
 * @returns Array of 2D points defining the profile
 */
export function generateProfile(profile: ExtrudeProfile2D): ProfilePoint[] {
  switch (profile.kind) {
    case 'circle':
      return generateCircleProfile(profile.radius, profile.segments);

    case 'ngon':
      return generateNgonProfile(profile.sides, profile.radius);

    case 'polyline':
      return profile.points;

    default: {
      const _exhaustive: never = profile;
      throw new Error(`Unknown profile kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Generate circle profile
 *
 * @param radius - Circle radius
 * @param segments - Number of segments (more = smoother)
 * @returns Array of points forming a circle
 */
function generateCircleProfile(radius: number, segments: number): ProfilePoint[] {
  const points: ProfilePoint[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  return points;
}

/**
 * Generate regular n-gon profile
 *
 * @param sides - Number of sides (3=triangle, 4=square, etc.)
 * @param radius - Circumradius (distance from center to vertex)
 * @returns Array of points forming a regular polygon
 */
function generateNgonProfile(sides: number, radius: number): ProfilePoint[] {
  if (sides < 3) {
    throw new Error(`N-gon must have at least 3 sides, got ${sides}`);
  }

  const points: ProfilePoint[] = [];

  // Start at top (angle 0 = straight up)
  const startAngle = -Math.PI / 2;

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i / sides) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  return points;
}

// ============================================================================
// Extrusion Result
// ============================================================================

/**
 * Result of extrusion operation
 */
export interface ExtrusionResult {
  /** Vertex positions (xyz packed) */
  positions: Float32Array;

  /** Vertex normals (xyz packed, optional) */
  normals?: Float32Array;

  /** UV coordinates (uv packed, optional) */
  uvs?: Float32Array;

  /** Triangle indices (CCW winding) */
  indices: Uint16Array | Uint32Array;
}

// ============================================================================
// Extrusion Options
// ============================================================================

/**
 * Options for extrusion
 */
export interface ExtrudeOptions {
  /** Generate normals */
  normals: boolean;

  /** Generate UVs */
  uvs: boolean;
}

// ============================================================================
// Main Extrusion Entry Point
// ============================================================================

/**
 * Extrude a 2D profile into 3D geometry
 *
 * @param profile - 2D profile points
 * @param extrude - Extrusion parameters
 * @param options - Attributes to generate (normals, uvs)
 * @returns Extruded geometry with positions, optional normals/uvs, and indices
 */
export function extrudeProfile(
  profile: ProfilePoint[],
  extrude: ExtrudeKind,
  options: ExtrudeOptions
): ExtrusionResult {
  switch (extrude.kind) {
    case 'linear':
      return extrudeLinear(
        profile,
        extrude.depth,
        extrude.cap,
        options.normals,
        options.uvs
      );

    case 'rounded':
      return extrudeRounded(
        profile,
        extrude.depth,
        extrude.roundSegments,
        extrude.radius,
        options.normals,
        options.uvs
      );

    default: {
      const _exhaustive: never = extrude;
      throw new Error(`Unknown extrude kind: ${String(_exhaustive)}`);
    }
  }
}

// ============================================================================
// Linear Extrusion
// ============================================================================

/**
 * Linear extrusion (simple prism)
 *
 * Creates side faces + optional caps
 *
 * @param profile - 2D profile points
 * @param depth - Extrusion depth (along Z axis)
 * @param cap - Which caps to generate
 * @param generateNormals - Whether to generate normals
 * @param generateUVs - Whether to generate UVs
 * @returns Extruded geometry
 */
function extrudeLinear(
  profile: ProfilePoint[],
  depth: number,
  cap: 'both' | 'front' | 'back' | 'none',
  generateNormals: boolean,
  generateUVs: boolean
): ExtrusionResult {
  const numProfilePoints = profile.length;

  // Calculate vertex/index counts
  const hasFrontCap = cap === 'both' || cap === 'front';
  const hasBackCap = cap === 'both' || cap === 'back';

  const numSideVerts = numProfilePoints * 2; // front + back ring
  const numCapVerts =
    (hasFrontCap ? numProfilePoints : 0) + (hasBackCap ? numProfilePoints : 0);
  const totalVerts = numSideVerts + numCapVerts;

  const numSideTris = numProfilePoints * 2; // 2 triangles per segment
  const numCapTris =
    (hasFrontCap ? numProfilePoints - 2 : 0) +
    (hasBackCap ? numProfilePoints - 2 : 0);
  const totalTris = numSideTris + numCapTris;
  const totalIndices = totalTris * 3;

  // Allocate buffers
  const positions = new Float32Array(totalVerts * 3);
  const normals = generateNormals ? new Float32Array(totalVerts * 3) : undefined;
  const uvs = generateUVs ? new Float32Array(totalVerts * 2) : undefined;

  // Choose index type based on vertex count
  const indices =
    totalVerts > 65535
      ? new Uint32Array(totalIndices)
      : new Uint16Array(totalIndices);

  // Build geometry
  let vertIdx = 0;
  let idxPtr = 0;

  // Side faces (front and back rings)
  const frontZ = depth / 2;
  const backZ = -depth / 2;

  for (let i = 0; i < numProfilePoints; i++) {
    const p = profile[i];

    // Front vertex
    positions[vertIdx * 3 + 0] = p.x;
    positions[vertIdx * 3 + 1] = p.y;
    positions[vertIdx * 3 + 2] = frontZ;

    if (generateNormals) {
      // Side face normal (pointing outward from center)
      const nx = p.x;
      const ny = p.y;
      const len = Math.sqrt(nx * nx + ny * ny);
      normals![vertIdx * 3 + 0] = len > 0 ? nx / len : 0;
      normals![vertIdx * 3 + 1] = len > 0 ? ny / len : 0;
      normals![vertIdx * 3 + 2] = 0;
    }

    if (generateUVs) {
      uvs![vertIdx * 2 + 0] = i / numProfilePoints;
      uvs![vertIdx * 2 + 1] = 0;
    }

    vertIdx++;

    // Back vertex
    positions[vertIdx * 3 + 0] = p.x;
    positions[vertIdx * 3 + 1] = p.y;
    positions[vertIdx * 3 + 2] = backZ;

    if (generateNormals) {
      // Same normal as front (outward facing)
      const nx = p.x;
      const ny = p.y;
      const len = Math.sqrt(nx * nx + ny * ny);
      normals![vertIdx * 3 + 0] = len > 0 ? nx / len : 0;
      normals![vertIdx * 3 + 1] = len > 0 ? ny / len : 0;
      normals![vertIdx * 3 + 2] = 0;
    }

    if (generateUVs) {
      uvs![vertIdx * 2 + 0] = i / numProfilePoints;
      uvs![vertIdx * 2 + 1] = 1;
    }

    vertIdx++;
  }

  // Side face indices (CCW winding when viewed from outside)
  for (let i = 0; i < numProfilePoints; i++) {
    const next = (i + 1) % numProfilePoints;

    const frontCurr = i * 2;
    const backCurr = i * 2 + 1;
    const frontNext = next * 2;
    const backNext = next * 2 + 1;

    // First triangle: frontCurr -> frontNext -> backCurr
    indices[idxPtr++] = frontCurr;
    indices[idxPtr++] = frontNext;
    indices[idxPtr++] = backCurr;

    // Second triangle: frontNext -> backNext -> backCurr
    indices[idxPtr++] = frontNext;
    indices[idxPtr++] = backNext;
    indices[idxPtr++] = backCurr;
  }

  // Front cap (if requested)
  if (hasFrontCap) {
    const capStartIdx = numSideVerts;

    // Add cap vertices
    for (let i = 0; i < numProfilePoints; i++) {
      const p = profile[i];
      positions[vertIdx * 3 + 0] = p.x;
      positions[vertIdx * 3 + 1] = p.y;
      positions[vertIdx * 3 + 2] = frontZ;

      if (generateNormals) {
        normals![vertIdx * 3 + 0] = 0;
        normals![vertIdx * 3 + 1] = 0;
        normals![vertIdx * 3 + 2] = 1; // facing +Z
      }

      if (generateUVs) {
        uvs![vertIdx * 2 + 0] = (p.x + 1) / 2;
        uvs![vertIdx * 2 + 1] = (p.y + 1) / 2;
      }

      vertIdx++;
    }

    // Triangulate cap (simple fan triangulation from first vertex)
    for (let i = 1; i < numProfilePoints - 1; i++) {
      indices[idxPtr++] = capStartIdx;
      indices[idxPtr++] = capStartIdx + i;
      indices[idxPtr++] = capStartIdx + i + 1;
    }
  }

  // Back cap (if requested)
  if (hasBackCap) {
    const capStartIdx = numSideVerts + (hasFrontCap ? numProfilePoints : 0);

    // Add cap vertices
    for (let i = 0; i < numProfilePoints; i++) {
      const p = profile[i];
      positions[vertIdx * 3 + 0] = p.x;
      positions[vertIdx * 3 + 1] = p.y;
      positions[vertIdx * 3 + 2] = backZ;

      if (generateNormals) {
        normals![vertIdx * 3 + 0] = 0;
        normals![vertIdx * 3 + 1] = 0;
        normals![vertIdx * 3 + 2] = -1; // facing -Z
      }

      if (generateUVs) {
        uvs![vertIdx * 2 + 0] = (p.x + 1) / 2;
        uvs![vertIdx * 2 + 1] = (p.y + 1) / 2;
      }

      vertIdx++;
    }

    // Triangulate cap (reverse winding for back face)
    for (let i = 1; i < numProfilePoints - 1; i++) {
      indices[idxPtr++] = capStartIdx;
      indices[idxPtr++] = capStartIdx + i + 1;
      indices[idxPtr++] = capStartIdx + i;
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices,
  };
}

// ============================================================================
// Rounded Extrusion (Placeholder)
// ============================================================================

/**
 * Rounded extrusion (adds curved profile at edges)
 *
 * For "pill" or "flattened sphere" shapes.
 * This is a more complex extrusion that can be deferred.
 *
 * @param profile - 2D profile points
 * @param depth - Extrusion depth
 * @param roundSegments - Number of segments for rounded edges
 * @param radius - Radius of rounded edge
 * @param generateNormals - Whether to generate normals
 * @param generateUVs - Whether to generate UVs
 * @returns Extruded geometry
 */
function extrudeRounded(
  profile: ProfilePoint[],
  depth: number,
  roundSegments: number,
  radius: number,
  generateNormals: boolean,
  generateUVs: boolean
): ExtrusionResult {
  // TODO: Implement rounded extrusion
  // For now, fall back to linear extrusion
  return extrudeLinear(profile, depth, 'both', generateNormals, generateUVs);
}
