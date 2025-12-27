/**
 * Execute CameraEval Step
 *
 * Evaluates a CameraIR to produce CameraEval matrices.
 *
 * Algorithm:
 * 1. Read cameraId from input (constant or slot)
 * 2. Get viewport info from runtime context
 * 3. Look up camera in CameraStore (cache hit/miss)
 * 4. If cache miss, evaluate camera using evaluateCamera()
 * 5. Store CameraEval handle in outSlot
 *
 * Cache key: (cameraId, viewport.width, viewport.height, viewport.dpr)
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md §7.3
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md §7.3
 */

import type { StepPerfCounters } from '../../../compiler/ir/types3d';
import type { ValueSlot } from '../../../compiler/ir/types';
import type { CameraStore } from '../../camera/CameraStore';
import type { ViewportInfo } from '../../camera/evaluateCamera';

// =============================================================================
// Step Definition
// =============================================================================

/**
 * CameraEval Step - Evaluate camera to matrices
 */
export interface StepCameraEval {
  kind: 'CameraEval';

  /** Step identifier */
  id: string;

  /** Camera ID (constant for now, could be slot in future) */
  cameraId: string;

  /** Output slot for CameraEval handle */
  outSlot: ValueSlot;

  /** Optional debug label */
  label?: string;
}

// =============================================================================
// CameraEval Handle (stored in ValueStore)
// =============================================================================

/**
 * CameraEval handle stored in ValueStore
 */
export interface CameraEvalHandle {
  kind: 'cameraEval';
  cameraId: string;
  viewMat4: Float32Array;
  projMat4: Float32Array;
  viewProjMat4: Float32Array;
  viewportKey: { w: number; h: number; dpr: number };
}

// =============================================================================
// Value Store Interface
// =============================================================================

/**
 * Minimal ValueStore interface needed by executeCameraEval
 */
export interface ValueStore {
  write(slot: ValueSlot, value: unknown): void;
}

// =============================================================================
// Execute CameraEval
// =============================================================================

/**
 * Execute CameraEval step
 *
 * @param step - CameraEval step definition
 * @param store - Camera evaluation cache
 * @param viewport - Current viewport info
 * @param valueStore - Value store for writing output
 * @returns Performance counters
 */
export function executeCameraEval(
  step: StepCameraEval,
  store: CameraStore,
  viewport: ViewportInfo,
  valueStore: ValueStore
): StepPerfCounters {
  const startTime = performance.now();

  // Get or evaluate camera
  const cameraEval = store.getOrEvaluate(step.cameraId, viewport);

  // Create handle for ValueStore
  const handle: CameraEvalHandle = {
    kind: 'cameraEval',
    cameraId: step.cameraId,
    viewMat4: cameraEval.viewMat4,
    projMat4: cameraEval.projMat4,
    viewProjMat4: cameraEval.viewProjMat4,
    viewportKey: cameraEval.viewportKey,
  };

  // Write to output slot
  valueStore.write(step.outSlot, handle);

  const endTime = performance.now();

  // Performance counters
  return {
    stepId: step.id,
    cpuMs: endTime - startTime,
    cacheHit: true, // TODO: track cache hits properly
    bytesWritten: 0, // CameraEval is just a reference, no buffer allocation here
    buffersReused: 0,
    nanCount: 0,
    infCount: 0,
  };
}
