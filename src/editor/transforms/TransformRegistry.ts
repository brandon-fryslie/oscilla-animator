/**
 * Unified Transform Registry
 *
 * Sprint 4: Phase 0 - Unify Lenses and Adapters
 * Merges separate LensRegistry and AdapterRegistry into single registry.
 *
 * References:
 * - .agent_planning/phase0-architecture-refactoring/PLAN-2025-12-31-170000-sprint4-transforms.md
 * - .agent_planning/phase0-architecture-refactoring/DOD-2025-12-31-170000-sprint4-transforms.md
 */

import type { TypeDesc, CoreDomain, AdapterPolicy, AdapterCost } from '../types';
import type { Artifact, RuntimeCtx, CompileCtx } from '../compiler/types';
import type { ValueRefPacked } from '../compiler/passes/pass6-block-lowering';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { UIControlHint } from '../types';

// =============================================================================
// Unified Transform Types (Deliverable 1)
// =============================================================================

/**
 * Parameter specification for lens transforms.
 */
export interface LensParamSpec {
  type: TypeDesc;
  default: unknown;
  uiHint: UIControlHint;
  rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
}

/**
 * Context for IR compilation of transforms.
 */
export interface TransformIRCtx {
  builder: IRBuilder;
  transformId: string;
  params?: Record<string, unknown>;
}

/**
 * Lens apply function signature.
 * Lenses take params as Artifacts and use RuntimeCtx.
 */
export type LensApplyFn = (
  value: Artifact,
  params: Record<string, Artifact>,
  ctx: RuntimeCtx
) => Artifact;

/**
 * Adapter apply function signature.
 * Adapters take params as unknown values and use CompileCtx.
 */
export type AdapterApplyFn = (
  artifact: Artifact,
  params: Record<string, unknown>,
  ctx: CompileCtx
) => Artifact;

/**
 * Unified transform definition - represents both lenses and adapters.
 *
 * - Lenses: Type-preserving, parameterized transformations (e.g., gain, clamp)
 * - Adapters: Type-converting, automatic transformations (e.g., scalar→signal)
 */
export interface TransformDef {
  /** Unique identifier */
  readonly id: string;

  /** Human-readable label */
  readonly label: string;

  /** Kind: 'lens' or 'adapter' */
  readonly kind: 'lens' | 'adapter';

  // ---- Type information ----

  /** Input type. 'same' means type-preserving (lenses only) */
  readonly inputType: TypeDesc | 'same';

  /** Output type. 'same' means type-preserving (lenses only) */
  readonly outputType: TypeDesc | 'same';

  // ---- Lens-specific fields ----

  /** Domain for domain-specific lenses (e.g., 'float', 'vec2') */
  readonly domain?: CoreDomain;

  /** Allowed scopes for lens application */
  readonly allowedScopes?: Array<'wire' | 'publisher' | 'listener' | 'lensParam'>;

  /** Parameter specifications for lens */
  readonly params?: Record<string, LensParamSpec>;

  /** Cost hint for lens (UI guidance) */
  readonly costHint?: 'cheap' | 'medium' | 'heavy';

  /** Stability hint for lens */
  readonly stabilityHint?: 'scrubSafe' | 'transportOnly' | 'either';

  // ---- Adapter-specific fields ----

  /** Adapter policy (when to auto-insert) */
  readonly policy?: AdapterPolicy;

  /** Adapter cost (for pathfinding, lower is better) */
  readonly cost?: AdapterCost;

  // ---- Shared implementation ----

  /**
   * Runtime execution function.
   * For lenses: uses LensApplyFn signature
   * For adapters: uses AdapterApplyFn signature
   */
  readonly apply?: LensApplyFn | AdapterApplyFn;

  /** IR compilation function */
  readonly compileToIR?: (
    input: ValueRefPacked,
    params: Record<string, ValueRefPacked>,
    ctx: TransformIRCtx
  ) => ValueRefPacked | null;
}

/**
 * Type guard: check if transform is a lens.
 */
export function isLensTransform(def: TransformDef): def is TransformDef & { kind: 'lens' } {
  return def.kind === 'lens';
}

/**
 * Type guard: check if transform is an adapter.
 */
export function isAdapterTransform(def: TransformDef): def is TransformDef & { kind: 'adapter' } {
  return def.kind === 'adapter';
}

// =============================================================================
// TransformRegistry Class (Deliverable 2)
// =============================================================================

/**
 * Unified registry for both lenses and adapters.
 *
 * Replaces separate LensRegistry and AdapterRegistry with a single
 * registry that can handle both types of transforms.
 */
export class TransformRegistry {
  private transforms = new Map<string, TransformDef>();
  private aliases = new Map<string, string>();

  /**
   * Register a lens transform.
   */
  registerLens(def: Omit<TransformDef, 'kind'> & { kind?: 'lens' }): void {
    const lensTransform: TransformDef = { ...def, kind: 'lens' };
    this.validateAndRegister(lensTransform);
  }

  /**
   * Register an adapter transform.
   */
  registerAdapter(def: Omit<TransformDef, 'kind'> & { kind?: 'adapter' }): void {
    const adapterTransform: TransformDef = { ...def, kind: 'adapter' };
    this.validateAndRegister(adapterTransform);
  }

  /**
   * Register a transform alias (for backward compatibility).
   */
  registerAlias(aliasId: string, canonicalId: string): void {
    this.aliases.set(aliasId, canonicalId);
  }

  /**
   * Get a transform by ID (resolves aliases).
   */
  getTransform(id: string): TransformDef | undefined {
    const canonicalId = this.aliases.get(id) ?? id;
    return this.transforms.get(canonicalId);
  }

  /**
   * Get all transforms.
   */
  getAllTransforms(): TransformDef[] {
    return Array.from(this.transforms.values());
  }

  /**
   * Find adapters that convert from one type to another.
   * Returns adapters sorted by cost (cheapest first).
   */
  findAdapters(from: TypeDesc, to: TypeDesc): TransformDef[] {
    const adapters = Array.from(this.transforms.values())
      .filter(isAdapterTransform)
      .filter((adapter) => this.matchesAdapterTypes(adapter, from, to));

    // Sort by cost (lower is better)
    return adapters.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
  }

  /**
   * Get lenses for a specific domain.
   */
  getLensesForDomain(domain: CoreDomain): TransformDef[] {
    return Array.from(this.transforms.values())
      .filter(isLensTransform)
      .filter((lens) => lens.domain === domain || lens.domain === undefined);
  }

  /**
   * Get all lenses.
   */
  getAllLenses(): TransformDef[] {
    return Array.from(this.transforms.values()).filter(isLensTransform);
  }

  /**
   * Get all adapters.
   */
  getAllAdapters(): TransformDef[] {
    return Array.from(this.transforms.values()).filter(isAdapterTransform);
  }

  /**
   * Check if a lens is allowed in a given scope.
   */
  isLensAllowedInScope(
    lensId: string,
    scope: 'wire' | 'publisher' | 'listener' | 'lensParam'
  ): boolean {
    const def = this.getTransform(lensId);
    if (!def || !isLensTransform(def)) return false;
    if (!def.allowedScopes) return true; // No restrictions
    return def.allowedScopes.includes(scope);
  }

  /**
   * Clear all transforms (for testing).
   */
  clear(): void {
    this.transforms.clear();
    this.aliases.clear();
  }

  // ---- Private methods ----

  private validateAndRegister(def: TransformDef): void {
    // Check for ID conflicts
    if (this.transforms.has(def.id)) {
      throw new Error(`Transform ID already registered: ${def.id}`);
    }

    // Validate lens-specific constraints
    if (isLensTransform(def)) {
      if (def.inputType !== 'same' && def.outputType !== 'same') {
        // Lenses should be type-preserving
        console.warn(
          `Lens ${def.id} has explicit input/output types instead of 'same'. This may indicate it should be an adapter.`
        );
      }
    }

    // Validate adapter-specific constraints
    if (isAdapterTransform(def)) {
      if (def.inputType === 'same' || def.outputType === 'same') {
        throw new Error(
          `Adapter ${def.id} has 'same' type. Adapters must specify explicit input/output types.`
        );
      }
      if (!def.policy) {
        console.warn(`Adapter ${def.id} has no policy. Defaulting to 'EXPLICIT'.`);
      }
      if (def.cost === undefined) {
        console.warn(`Adapter ${def.id} has no cost. Defaulting to 0.`);
      }
    }

    this.transforms.set(def.id, def);
  }

  private matchesAdapterTypes(adapter: TransformDef, from: TypeDesc, to: TypeDesc): boolean {
    if (adapter.inputType === 'same' || adapter.outputType === 'same') {
      return false; // Adapters cannot be type-preserving
    }

    // TypeDesc is now a simple string, so use string equality
    return this.typeEquals(adapter.inputType, from) && this.typeEquals(adapter.outputType, to);
  }

  private typeEquals(a: TypeDesc, b: TypeDesc): boolean {
    // TypeDesc is now a simple string (e.g., 'Signal:float', 'Scalar:int')
    return a === b;
  }
}

// =============================================================================
// Global Registry Instance
// =============================================================================

/**
 * Global transform registry instance.
 * Use this for all transform registration and lookup.
 */
export const TRANSFORM_REGISTRY = new TransformRegistry();
