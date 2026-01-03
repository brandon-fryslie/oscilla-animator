/**
 * Normalization functions for transform stacks.
 *
 * Converts between storage representation (optional arrays, optional enabled)
 * and normalized representation (non-optional arrays, explicit enabled).
 */

import type { TransformStack, TransformStep, TransformStorage } from './types';
import type { AdapterStep, LensInstance, TransformStep as EdgeTransformStep } from '../types';

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
 * Convert legacy lensStack + adapterChain fields to unified transforms array.
 * This is used when migrating old patches to the new format.
 *
 * @param lensStack - Legacy lens stack (optional)
 * @param adapterChain - Legacy adapter chain (optional)
 * @returns Unified transforms array in Edge format
 */
export function convertLegacyTransforms(
  lensStack?: LensInstance[],
  adapterChain?: AdapterStep[]
): EdgeTransformStep[] {
  const transforms: EdgeTransformStep[] = [];

  // Add adapters first (applied before lenses)
  if (adapterChain) {
    for (const adapter of adapterChain) {
      transforms.push(adapter);
    }
  }

  // Add lenses second (applied after adapters)
  if (lensStack) {
    for (const lens of lensStack) {
      transforms.push({ kind: 'lens', lens });
    }
  }

  return transforms;
}

/**
 * Get unified transforms from an edge.
 *
 * Phase 0.5 Track A.5: Legacy fields removed from Edge interface.
 * This function now only returns the transforms field (no fallback).
 *
 * @param edge - Edge object with transforms field
 * @returns Unified transforms array (empty if no transforms)
 */
export function getEdgeTransforms(edge: {
  transforms?: EdgeTransformStep[];
}): EdgeTransformStep[] {
  return edge.transforms ?? [];
}

/**
 * Extract lens instances from a transforms array.
 * Useful for lens management operations that only care about lenses.
 *
 * @param transforms - Unified transforms array
 * @returns Array of lens instances (in order)
 */
export function extractLenses(transforms: EdgeTransformStep[]): LensInstance[] {
  const lenses: LensInstance[] = [];
  for (const transform of transforms) {
    if ('kind' in transform && transform.kind === 'lens') {
      lenses.push(transform.lens);
    }
  }
  return lenses;
}

/**
 * Extract adapter steps from a transforms array.
 * Useful for adapter management operations that only care about adapters.
 *
 * @param transforms - Unified transforms array
 * @returns Array of adapter steps (in order)
 */
export function extractAdapters(transforms: EdgeTransformStep[]): AdapterStep[] {
  const adapters: AdapterStep[] = [];
  for (const transform of transforms) {
    if ('adapterId' in transform) {
      adapters.push(transform);
    }
  }
  return adapters;
}

/**
 * Build a transforms array from separate adapter and lens arrays.
 * Adapters are placed first, lenses second.
 *
 * @param adapters - Array of adapters (will be applied first)
 * @param lenses - Array of lenses (will be applied after adapters)
 * @returns Unified transforms array
 */
export function buildTransforms(
  adapters: AdapterStep[],
  lenses: LensInstance[]
): EdgeTransformStep[] {
  const transforms: EdgeTransformStep[] = [];

  // Add adapters first
  for (const adapter of adapters) {
    transforms.push(adapter);
  }

  // Add lenses second
  for (const lens of lenses) {
    transforms.push({ kind: 'lens', lens });
  }

  return transforms;
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
