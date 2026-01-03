/**
 * Catalog functions for discovering available transforms.
 *
 * Provides unified access to adapter and lens registries for UI and validation.
 *
 * Sprint 4: Updated to use TRANSFORM_REGISTRY as the source of truth.
 * Old AdapterDef and LensDef types are maintained for backward compatibility.
 */

import type { TransformScope } from './types';
import type { TypeDesc, CoreDomain, AdapterPolicy, AdapterCost } from '../types';
import type { Artifact } from '../compiler/types';
import type { CompileCtx } from '../compiler/types';
import type { ValueRefPacked } from '../compiler/passes/pass6-block-lowering';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import { TRANSFORM_REGISTRY, isAdapterTransform, isLensTransform, type TransformDef, type LensParamSpec } from './TransformRegistry';

// =============================================================================
// Backward Compatibility Types
// =============================================================================

/**
 * Adapter definition (backward compatibility type).
 * @deprecated Use TransformDef with kind='adapter' instead
 */
export interface AdapterDef {
  id: string;
  label: string;
  policy: AdapterPolicy;
  cost: AdapterCost;
  from: TypeDesc;
  to: TypeDesc;
  apply?: (artifact: Artifact, params: Record<string, unknown>, ctx: CompileCtx) => Artifact;
  compileToIR?: (input: ValueRefPacked, ctx: { builder: IRBuilder }) => ValueRefPacked | null;
}

/**
 * Lens scope type (backward compatibility).
 */
export type LensScope = 'wire' | 'publisher' | 'listener' | 'lensParam';

/**
 * Lens definition (backward compatibility type).
 * @deprecated Use TransformDef with kind='lens' instead
 */
export interface LensDef {
  id: string;
  label: string;
  domain: CoreDomain;
  allowedScopes: LensScope[];
  params: Record<string, LensParamSpec>;
  costHint?: 'cheap' | 'medium' | 'heavy';
  stabilityHint?: 'scrubSafe' | 'transportOnly' | 'either';
  apply?: (value: Artifact, params: Record<string, Artifact>) => Artifact;
  compileToIR?: (input: ValueRefPacked, params: Record<string, ValueRefPacked>, ctx: { builder: IRBuilder }) => ValueRefPacked | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract domain from TypeDesc string.
 * TypeDesc format: "World:Domain" (e.g., "Signal:float", "Scalar:vec2")
 */
function extractDomain(typeDesc: TypeDesc): string {
  const parts = typeDesc.split(':');
  return parts.length > 1 ? parts[1] : typeDesc;
}

// =============================================================================
// Catalog Functions
// =============================================================================

/**
 * List all registered adapters.
 */
export function listAdapters(): AdapterDef[] {
  return TRANSFORM_REGISTRY.getAllAdapters().map(transformToAdapterDef);
}

/**
 * List all registered lenses.
 */
export function listLenses(): LensDef[] {
  return TRANSFORM_REGISTRY.getAllLenses().map(transformToLensDef);
}

/**
 * List lenses compatible with a specific scope and type.
 *
 * Filters by:
 * - Lens domain matches type domain
 * - Lens allowedScopes includes the requested scope
 *
 * @param scope - Where the lens will be applied
 * @param typeDesc - Type of the artifact being transformed
 * @returns Array of compatible lens definitions
 */
export function listLensesFor(scope: TransformScope, typeDesc: TypeDesc): LensDef[] {
  const allLenses = TRANSFORM_REGISTRY.getAllLenses();
  const domain = extractDomain(typeDesc);

  return allLenses
    .filter((lens) => {
      // Check domain compatibility
      if (lens.domain && lens.domain !== domain) {
        return false;
      }

      // Check scope compatibility (Sprint 2 complete)
      return lens.allowedScopes?.includes(scope) ?? true;
    })
    .map(transformToLensDef);
}

/**
 * Find adapters that convert from one type to another.
 */
export function findAdapters(from: TypeDesc, to: TypeDesc): AdapterDef[] {
  return TRANSFORM_REGISTRY.findAdapters(from, to).map(transformToAdapterDef);
}

/**
 * Get a specific adapter by ID.
 */
export function getAdapter(id: string): AdapterDef | undefined {
  const transform = TRANSFORM_REGISTRY.getTransform(id);
  if (transform && isAdapterTransform(transform)) {
    return transformToAdapterDef(transform);
  }
  return undefined;
}

/**
 * Get a specific lens by ID.
 */
export function getLens(id: string): LensDef | undefined {
  const transform = TRANSFORM_REGISTRY.getTransform(id);
  if (transform && isLensTransform(transform)) {
    return transformToLensDef(transform);
  }
  return undefined;
}

// =============================================================================
// Backward Compatibility Converters
// =============================================================================

/**
 * Convert TransformDef (adapter) to old AdapterDef format.
 */
function transformToAdapterDef(transform: TransformDef): AdapterDef {
  if (!isAdapterTransform(transform)) {
    throw new Error(`Transform ${transform.id} is not an adapter`);
  }

  if (transform.inputType === 'same' || transform.outputType === 'same') {
    throw new Error(`Adapter ${transform.id} has invalid 'same' type`);
  }

  return {
    id: transform.id,
    label: transform.label,
    policy: transform.policy ?? 'EXPLICIT',
    cost: transform.cost ?? 0,
    from: transform.inputType,
    to: transform.outputType,
    apply: transform.apply as AdapterDef['apply'],
    compileToIR: transform.compileToIR as AdapterDef['compileToIR'],
  };
}

/**
 * Convert TransformDef (lens) to old LensDef format.
 */
function transformToLensDef(transform: TransformDef): LensDef {
  if (!isLensTransform(transform)) {
    throw new Error(`Transform ${transform.id} is not a lens`);
  }

  return {
    id: transform.id,
    label: transform.label,
    domain: transform.domain ?? 'float', // Default to float if not specified
    allowedScopes: (transform.allowedScopes ?? ['wire', 'publisher', 'listener', 'lensParam']) as LensDef['allowedScopes'],
    params: transform.params ?? {},
    costHint: transform.costHint,
    stabilityHint: transform.stabilityHint,
    apply: transform.apply as LensDef['apply'],
    compileToIR: transform.compileToIR as LensDef['compileToIR'],
  };
}
