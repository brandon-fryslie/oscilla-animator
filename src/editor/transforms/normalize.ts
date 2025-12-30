/**
 * Normalization functions for transform stacks.
 *
 * Converts between storage representation (optional arrays, optional enabled)
 * and normalized representation (non-optional arrays, explicit enabled).
 */

import type { TransformStack, TransformStep, TransformStorage } from './types';
import type { AdapterStep, LensInstance } from '../types';

/**
 * Normalize transform storage into a unified stack.
 *
 * Handles:
 * - undefined → []
 * - missing 'enabled' field → true
 * - interleaving of adapters and lenses in application order
 *
 * Application order: adapters first, then lenses (as per current compiler behavior).
 */
export function normalizeTransformStack(input: TransformStorage): TransformStack {
  const steps: TransformStep[] = [];

  // Add adapter chain (applied first)
  if (input.adapterChain) {
    for (const step of input.adapterChain) {
      steps.push({
        kind: 'adapter',
        // AdapterStep doesn't have 'enabled' field yet - always true
        enabled: true,
        step,
      });
    }
  }

  // Add lens stack (applied after adapters)
  if (input.lensStack) {
    for (const lens of input.lensStack) {
      steps.push({
        kind: 'lens',
        enabled: lens.enabled ?? true,
        lens,
      });
    }
  }

  return steps;
}

/**
 * Split a normalized transform stack back into storage representation.
 *
 * This is the inverse of normalizeTransformStack, used when persisting
 * changes back to the patch.
 */
export function splitTransformStack(stack: TransformStack): TransformStorage {
  const adapterChain: AdapterStep[] = [];
  const lensStack: LensInstance[] = [];

  for (const step of stack) {
    if (step.kind === 'adapter') {
      adapterChain.push(step.step);
    } else {
      lensStack.push(step.lens);
    }
  }

  // Return undefined for empty arrays to match storage convention
  return {
    adapterChain: adapterChain.length > 0 ? adapterChain : undefined,
    lensStack: lensStack.length > 0 ? lensStack : undefined,
  };
}

/**
 * Check if a transform stack is empty.
 */
export function isEmptyStack(stack: TransformStack): boolean {
  return stack.length === 0;
}

/**
 * Count enabled transforms in a stack.
 */
export function countEnabledTransforms(stack: TransformStack): number {
  return stack.filter((step) => step.enabled).length;
}

/**
 * Filter a stack to only enabled transforms.
 */
export function filterEnabledTransforms(stack: TransformStack): TransformStack {
  return stack.filter((step) => step.enabled);
}
