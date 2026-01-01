/**
 * Transform Migration Utilities
 *
 * Phase 0.5 Track A: Transform Storage Unification
 * Converts between legacy lensStack/adapterChain and unified transforms array.
 *
 * References:
 * - .agent_planning/phase0.5-compat-cleanup/PLAN-2026-01-01-000000.md (Track A)
 * - .agent_planning/phase0.5-compat-cleanup/DOD-2026-01-01-000000.md (Deliverable A.2)
 */

import type { LensInstance, AdapterStep, TransformStep } from '../types';

/**
 * Convert legacy lensStack and adapterChain to unified transforms array.
 *
 * Transform execution order:
 * 1. Adapters first (type conversions)
 * 2. Lenses second (value transformations)
 *
 * This preserves the semantics of the legacy system where adapters
 * were applied before lenses.
 *
 * @param lensStack - Optional lens stack from legacy Edge
 * @param adapterChain - Optional adapter chain from legacy Edge
 * @returns Unified transforms array in execution order
 *
 * @example
 * ```ts
 * const transforms = convertLegacyTransforms(
 *   [{ lensId: 'mul', params: { factor: { type: 'literal', value: 2 } }, enabled: true }],
 *   [{ adapterId: 'float-to-vec2', params: {} }]
 * );
 * // Result: [
 * //   { adapterId: 'float-to-vec2', params: {} },
 * //   { kind: 'lens', lens: { lensId: 'mul', ... } }
 * // ]
 * ```
 */
export function convertLegacyTransforms(
  lensStack?: LensInstance[],
  adapterChain?: AdapterStep[]
): TransformStep[] {
  const transforms: TransformStep[] = [];

  // Adapters first (type conversions happen before value transformations)
  if (adapterChain && adapterChain.length > 0) {
    for (const adapter of adapterChain) {
      transforms.push(adapter);
    }
  }

  // Then lenses (value transformations happen after type conversions)
  if (lensStack && lensStack.length > 0) {
    for (const lens of lensStack) {
      transforms.push({
        kind: 'lens' as const,
        lens,
      });
    }
  }

  return transforms;
}

/**
 * Convert unified transforms array back to legacy lensStack/adapterChain.
 *
 * This is used during the migration period where both representations
 * need to be maintained for backward compatibility.
 *
 * @param transforms - Unified transforms array
 * @returns Object with lensStack and adapterChain arrays
 *
 * @example
 * ```ts
 * const legacy = convertToLegacyTransforms([
 *   { adapterId: 'float-to-vec2', params: {} },
 *   { kind: 'lens', lens: { lensId: 'mul', params: {...}, enabled: true } }
 * ]);
 * // Result: {
 * //   adapterChain: [{ adapterId: 'float-to-vec2', params: {} }],
 * //   lensStack: [{ lensId: 'mul', params: {...}, enabled: true }]
 * // }
 * ```
 */
export function convertToLegacyTransforms(transforms: TransformStep[]): {
  lensStack: LensInstance[];
  adapterChain: AdapterStep[];
} {
  const lensStack: LensInstance[] = [];
  const adapterChain: AdapterStep[] = [];

  for (const transform of transforms) {
    if ('kind' in transform && transform.kind === 'lens') {
      // Lens transform
      lensStack.push(transform.lens);
    } else {
      // Adapter transform (AdapterStep)
      adapterChain.push(transform as AdapterStep);
    }
  }

  return { lensStack, adapterChain };
}

/**
 * Get transforms from an edge, preferring the new unified field and falling back to legacy fields.
 *
 * This helper is used during the migration period to support both representations.
 * It will be removed once all edges use the transforms field.
 *
 * @param edge - Edge with either transforms or legacy fields
 * @returns Unified transforms array (may be empty)
 *
 * @example
 * ```ts
 * // New format (preferred)
 * const transforms1 = getEdgeTransforms({
 *   ...edge,
 *   transforms: [{ adapterId: 'foo', params: {} }]
 * });
 *
 * // Legacy format (fallback)
 * const transforms2 = getEdgeTransforms({
 *   ...edge,
 *   lensStack: [...],
 *   adapterChain: [...]
 * });
 * ```
 */
export function getEdgeTransforms(edge: {
  transforms?: TransformStep[];
  lensStack?: LensInstance[];
  adapterChain?: AdapterStep[];
}): TransformStep[] {
  // Prefer new format
  if (edge.transforms && edge.transforms.length > 0) {
    return edge.transforms;
  }

  // Fall back to legacy format
  return convertLegacyTransforms(edge.lensStack, edge.adapterChain);
}
