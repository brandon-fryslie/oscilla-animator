/**
 * KERNEL_PRIMITIVES - The Authoritative Allowlist
 *
 * This is the single source of truth for which blocks may claim non-pure capabilities.
 * Only blocks listed here are allowed to have kernel-level authority.
 *
 * This list is FROZEN and LOCKED. Adding new kernel primitives requires:
 * 1. Explicit design review
 * 2. Update to this constant
 * 3. Corresponding block implementation
 *
 * @see design-docs/7-Primitives/3-Registry-Gating.md
 */

import type { KernelCapability, KernelId } from './types';

/**
 * Exhaustive mapping of kernel primitive IDs to their capabilities.
 * The type system ensures this satisfies the KernelId union.
 */
export const KERNEL_PRIMITIVES = {
  // ========================================================================
  // Time Authority (3)
  // ========================================================================
  // These blocks create and manage the time axis.
  // Only one TimeRoot may exist per patch.
  'FiniteTimeRoot': 'time',
  'InfiniteTimeRoot': 'time',

  // ========================================================================
  // Identity Authority (3)
  // ========================================================================
  // These blocks create domains (per-element identity spaces).
  'DomainN': 'identity',
  'SVGSampleDomain': 'identity',
  'GridDomain': 'identity',

  // ========================================================================
  // State Authority (5)
  // ========================================================================
  // These blocks allocate and manage mutable state.
  'IntegrateBlock': 'state',
  'HistoryBlock': 'state',
  'TriggerOnWrap': 'state',
  'PulseDivider': 'state',
  'EnvelopeAD': 'state',

  // ========================================================================
  // Render Authority (6)
  // ========================================================================
  // These blocks emit render trees (final visual output).
  'RenderInstances': 'render',
  'RenderStrokes': 'render',
  'RenderProgramStack': 'render',
  'RenderInstances2D': 'render',
  'RenderPaths2D': 'render',
  'Render2dCanvas': 'render',

  // ========================================================================
  // External IO Authority (3)
  // ========================================================================
  // These blocks load external resources or have side effects.
  'TextSource': 'io',
  'ImageSource': 'io',
  'DebugDisplay': 'io',
} as const satisfies Record<string, KernelCapability>;

/**
 * Type-safe accessor for checking if a block type is a kernel primitive.
 */
export function isKernelPrimitive(blockType: string): blockType is KernelId {
  return blockType in KERNEL_PRIMITIVES;
}

/**
 * Get the expected capability for a kernel primitive.
 * Returns undefined if the block type is not a kernel primitive.
 */
export function getKernelCapability(blockType: string): KernelCapability | undefined {
  if (!isKernelPrimitive(blockType)) {
    return undefined;
  }
  return KERNEL_PRIMITIVES[blockType as KernelId];
}

/**
 * Get all kernel primitive IDs for a given capability.
 * Useful for generating helpful error messages.
 */
export function getKernelPrimitivesForCapability(capability: KernelCapability): KernelId[] {
  return Object.entries(KERNEL_PRIMITIVES)
    .filter(([_, cap]) => cap === capability)
    .map(([id, _]) => id as KernelId);
}
