/**
 * @file Execute Mesh Materialize Step
 * @description Materializes a mesh from its recipe and caches the result
 *
 * Algorithm:
 * 1. Look up mesh in MeshStore cache
 * 2. If cache miss, generate mesh from recipe
 * 3. Store mesh buffer in ValueSlot
 * 4. Emit performance counters
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md §3
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md §2
 */

import type { StepPerfCounters, MeshBufferRef } from '../../../compiler/ir/types3d';
import type { ValueSlot } from '../../../compiler/ir';
import type { StepBase } from '../../../compiler/ir/schedule';
import type { MeshStore } from '../../mesh/MeshStore';

// ============================================================================
// Step Definition
// ============================================================================

/**
 * Mesh materialization step
 *
 * This step generates geometry from a procedural mesh recipe.
 */
export interface StepMeshMaterialize extends StepBase {
  /** Step kind identifier */
  kind: 'MeshMaterialize';

  /** Mesh identifier to materialize */
  meshId: string;

  /** Output slot for mesh buffer reference */
  outSlot: ValueSlot;
}

// ============================================================================
// Mesh Buffer Handle (for ValueStore)
// ============================================================================

/**
 * Mesh buffer handle stored in ValueStore
 */
export interface MeshBufferHandle {
  kind: 'meshBuffer';
  buffer: MeshBufferRef;
}

// ============================================================================
// Step Executor
// ============================================================================

/**
 * Execute mesh materialization step
 *
 * @param step - Step definition
 * @param meshStore - Mesh cache
 * @returns Materialized mesh and performance counters
 */
export function executeMeshMaterialize(
  step: StepMeshMaterialize,
  meshStore: MeshStore
): {
  result: MeshBufferRef;
  perf: StepPerfCounters;
} {
  const startTime = performance.now();

  // Get cache stats before
  const statsBefore = meshStore.getStats();

  // Get or materialize mesh
  const buffer = meshStore.getOrMaterialize(step.meshId);

  // Get cache stats after
  const statsAfter = meshStore.getStats();

  // Check if this was a cache hit
  const cacheHit = statsAfter.hits > statsBefore.hits;

  const endTime = performance.now();
  const cpuMs = endTime - startTime;

  // Count vertices and indices
  const vertexCount = buffer.positions.length / 3;
  const indexCount = buffer.indices.length;
  const triangleCount = indexCount / 3;

  // Calculate bytes written (for new allocations only)
  let bytesWritten = 0;
  if (!cacheHit) {
    bytesWritten += buffer.positions.byteLength;
    if (buffer.normals) {
      bytesWritten += buffer.normals.byteLength;
    }
    if (buffer.uvs) {
      bytesWritten += buffer.uvs.byteLength;
    }
    bytesWritten += buffer.indices.byteLength;
  }

  // Check for NaN/Inf in positions
  let nanCount = 0;
  let infCount = 0;
  for (let i = 0; i < buffer.positions.length; i++) {
    const v = buffer.positions[i];
    if (Number.isNaN(v)) {
      nanCount++;
    } else if (!Number.isFinite(v)) {
      infCount++;
    }
  }

  const perf: StepPerfCounters = {
    stepId: step.id,
    cpuMs,
    cacheHit,
    bytesWritten,
    buffersReused: cacheHit ? 1 : 0,
    instancesIn: vertexCount,
    instancesOut: triangleCount,
    nanCount,
    infCount,
  };

  return {
    result: buffer,
    perf,
  };
}
