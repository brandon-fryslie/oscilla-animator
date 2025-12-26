/**
 * @file Broadcast/Reduce Bridge
 * @description Bridges between Field and Signal worlds.
 *
 * Key Operations:
 * - Broadcast: Signal → Field (one value becomes N values)
 * - Reduce: Field → Signal (N values becomes one value)
 *
 * These are EXPLICIT operations in the IR - never implicit!
 */

import { materialize, type MaterializerEnv } from './Materializer';
import type {
  FieldExprId,
  MaterializationRequest,
} from './types';

// =============================================================================
// Reduce Functions
// =============================================================================

/**
 * ReduceNode: IR node for reducing a field to a signal
 */
export interface ReduceNode {
  kind: 'reduce';
  fieldId: FieldExprId;
  domainId: number;
  reduceFn: 'sum' | 'average' | 'min' | 'max';
}

/**
 * Signal environment (stub for now - will be extended by signal system)
 */
export interface SigEnv {
  // Placeholder - signal system will populate this
}

/**
 * Signal expression IR node (stub for now)
 */
export type SignalExprIR = unknown;

/**
 * Evaluate a reduce operation: Field → Signal
 *
 * This materializes the field, then applies a reduction function
 * to produce a single scalar value.
 *
 * @param node - The reduce node from IR
 * @param env - Materializer environment (contains everything needed)
 * @returns The reduced scalar value
 */
export function evalReduceFieldToSig(
  node: ReduceNode,
  env: MaterializerEnv
): number {
  // Materialize the field first
  const request: MaterializationRequest = {
    fieldId: node.fieldId,
    domainId: node.domainId,
    format: 'f32',
    layout: 'scalar',
    usageTag: 'reduce',
  };

  const fieldBuffer = materialize(request, env);
  const arr = fieldBuffer as Float32Array;
  const N = arr.length;

  // Apply reduction function
  switch (node.reduceFn) {
    case 'sum': {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += arr[i];
      return sum;
    }
    case 'average': {
      if (N === 0) return 0;
      let sum = 0;
      for (let i = 0; i < N; i++) sum += arr[i];
      return sum / N;
    }
    case 'min': {
      let min = Infinity;
      for (let i = 0; i < N; i++) if (arr[i] < min) min = arr[i];
      return min;
    }
    case 'max': {
      let max = -Infinity;
      for (let i = 0; i < N; i++) if (arr[i] > max) max = arr[i];
      return max;
    }
  }
}

/**
 * Compute sum of all field elements
 */
export function reduceSum(
  fieldId: FieldExprId,
  domainId: number,
  env: MaterializerEnv
): number {
  return evalReduceFieldToSig(
    { kind: 'reduce', fieldId, domainId, reduceFn: 'sum' },
    env
  );
}

/**
 * Compute average of all field elements
 */
export function reduceAverage(
  fieldId: FieldExprId,
  domainId: number,
  env: MaterializerEnv
): number {
  return evalReduceFieldToSig(
    { kind: 'reduce', fieldId, domainId, reduceFn: 'average' },
    env
  );
}

/**
 * Compute minimum of all field elements
 */
export function reduceMin(
  fieldId: FieldExprId,
  domainId: number,
  env: MaterializerEnv
): number {
  return evalReduceFieldToSig(
    { kind: 'reduce', fieldId, domainId, reduceFn: 'min' },
    env
  );
}

/**
 * Compute maximum of all field elements
 */
export function reduceMax(
  fieldId: FieldExprId,
  domainId: number,
  env: MaterializerEnv
): number {
  return evalReduceFieldToSig(
    { kind: 'reduce', fieldId, domainId, reduceFn: 'max' },
    env
  );
}
