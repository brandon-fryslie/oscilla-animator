/**
 * Core Type System for Oscilla IR
 *
 * This module defines the foundational type descriptors and indexing types
 * used throughout the IR system.
 *
 * **Type System Migration (2025-12-31):**
 * - TypeDesc now imports from src/core/types.ts (unified contract)
 * - TypeWorld imports from core (no more 'special', use 'config' instead)
 * - Domain imports from core (replaces local TypeDomain)
 * - BundleKind/bundleArity deprecated in favor of lanes
 * - Migration helpers provided for backward compatibility
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §1-2
 * - design-docs/12-Compiler-Final/14-Compiled-IR-Program-Contract.md §3
 * - .agent_planning/type-contracts-ir-plumbing/DOD-2025-12-31-045033.md
 */

// ============================================================================
// Unified Type System (imported from core)
// ============================================================================

import type {
  TypeWorld,
  Domain,
  TypeCategory,
  TypeDesc,
} from '../../../core/types';

import { getTypeArity, inferBundleLanes, createTypeDesc } from '../../../core/types';

/**
 * TypeDomain is now an alias for Domain from core.
 * Kept for backward compatibility during migration.
 *
 * @deprecated Use Domain from core/types instead
 */
export type TypeDomain = Domain;

// Re-export for convenience
export type { TypeWorld, Domain, TypeCategory, TypeDesc };
export { getTypeArity, inferBundleLanes, createTypeDesc };

// ============================================================================
// Bundle Type System (DEPRECATED - use lanes in TypeDesc instead)
// ============================================================================
// ============================================================================
// Bundle Type System (Sprint 2)
// ============================================================================

/**
 * Bundle kind - represents multi-component signals as bundles of scalar slots.
 *
 * Key principle: Bundles are compile-time groupings, not runtime types.
 * At runtime, everything is scalar slots (f32/u32). A vec2 is just
 * "2 consecutive slots", not an object.
 *
 * Examples:
 * - Scalar: single value (arity=1)
 * - Vec2: 2 components (x, y) stored in 2 consecutive slots
 * - Vec3: 3 components (r, g, b) stored in 3 consecutive slots
 * - RGBA: 4 components (r, g, b, a) stored in 4 consecutive slots
 * - Mat4: 16 components stored in 16 consecutive slots
 */
export const BundleKind = {
  /** Single scalar value (arity=1) */
  Scalar: "scalar",

  /** 2D vector (x, y) - arity=2 */
  Vec2: "vec2",

  /** 3D vector (x, y, z) or RGB color - arity=3 */
  Vec3: "vec3",

  /** RGBA color (r, g, b, a) - arity=4 */
  RGBA: "rgba",

  /** Quaternion (x, y, z, w) - arity=4 */
  Quat: "quat",

  /** 4D vector - arity=4 */
  Vec4: "vec4",

  /** 4x4 transformation matrix - arity=16 */
  Mat4: "mat4",
} as const;

export type BundleKind = (typeof BundleKind)[keyof typeof BundleKind];

/**
 * Get the bundle arity (number of scalar slots) for a BundleKind.
 *
 * @param kind - The bundle kind
 * @returns Number of scalar slots required (1, 2, 3, 4, or 16)
 */
export function getBundleArity(kind: BundleKind): number {
  switch (kind) {
    case BundleKind.Scalar:
      return 1;
    case BundleKind.Vec2:
      return 2;
    case BundleKind.Vec3:
      return 3;
    case BundleKind.RGBA:
    case BundleKind.Quat:
    case BundleKind.Vec4:
      return 4;
    case BundleKind.Mat4:
      return 16;
  }
}

/**
 * Infer bundle kind from TypeDomain.
 *
 * Maps semantic type domains to their bundle representation.
 * Defaults to Scalar for non-bundle types.
 *
 * @param domain - The type domain
 * @returns The corresponding bundle kind
 */
export function inferBundleKind(domain: TypeDomain): BundleKind {
  switch (domain) {
    case "vec2":
      return BundleKind.Vec2;
    case "vec3":
      return BundleKind.Vec3;
    case "vec4":
      return BundleKind.Vec4;
    case "quat":
      return BundleKind.Quat;
    case "mat4":
      return BundleKind.Mat4;
    case "color":
      // Color defaults to RGBA (4 components)
      return BundleKind.RGBA;
    default:
      // All other types are scalar (single slot)
      return BundleKind.Scalar;
  }
}


// =============================================================================
// Migration Helper: BundleKind → lanes
// =============================================================================

/**
 * Convert legacy BundleKind to lanes array format.
 *
 * This helper supports migration from the old bundleKind/bundleArity system
 * to the new lanes-based system in unified TypeDesc.
 *
 * @param kind - Legacy bundle kind
 * @returns Lanes array (e.g., [3] for vec3, [4] for rgba)
 *
 * @deprecated Use inferBundleLanes() from core/types instead
 */
export function bundleKindToLanes(kind: BundleKind): number[] {
  switch (kind) {
    case BundleKind.Scalar:
      return [1];
    case BundleKind.Vec2:
      return [2];
    case BundleKind.Vec3:
      return [3];
    case BundleKind.RGBA:
    case BundleKind.Quat:
    case BundleKind.Vec4:
      return [4];
    case BundleKind.Mat4:
      return [16];
  }
}

/**
 * Convert legacy bundleKind/bundleArity to lanes array.
 * Handles edge cases where bundleArity might not match bundleKind.
 *
 * @param bundleKind - Legacy bundle kind
 * @param bundleArity - Legacy bundle arity (fallback if kind is undefined)
 * @returns Lanes array
 *
 * @deprecated Use inferBundleLanes() from core/types instead
 */
export function migrateBundleToLanes(
  bundleKind?: BundleKind,
  bundleArity?: number
): number[] | undefined {
  if (bundleKind !== undefined) {
    return bundleKindToLanes(bundleKind);
  }
  if (bundleArity !== undefined && bundleArity !== 1) {
    return [bundleArity];
  }
  // Scalar - no explicit lanes
  return undefined;
}
// ============================================================================
// Value Kinds (02-IR-Schema.md §1.2)
// ============================================================================

/**
 * Runtime value kind discriminated union.
 *
 * Runtime values are strongly tagged so the VM can branch efficiently.
 * This is the runtime representation of type information.
 */
export type ValueKind =
  | { kind: "scalar"; type: TypeDesc }
  | { kind: "signal"; type: TypeDesc } // signal value at time t
  | { kind: "field"; type: TypeDesc } // field expression handle
  | { kind: "event"; type: TypeDesc } // event stream / trigger-like
  | { kind: "special"; type: TypeDesc }; // domain, render, etc

// ============================================================================
// Stable IDs (02-IR-Schema.md §2.1)
// ============================================================================

/**
 * Stable identifiers for semantic objects.
 *
 * These IDs are stable across compiles whenever the "same semantic object" persists.
 * Used for hot-swap, debugging, and provenance tracking.
 */

/** Stable identifier for a node (block instance or internal compiler node) */
export type NodeId = string;

/** Stable identifier for a bus entity */
export type BusId = string;

/** Stable identifier for a scheduled step */
export type StepId = string;

/** Stable identifier for a FieldExpr node (hash-consed) */
export type ExprId = string;

/** Stable identifier for a state cell */
export type StateId = string;

// ============================================================================
// Dense Indices (02-IR-Schema.md §2.2)
// ============================================================================

/**
 * Runtime performance indices.
 *
 * The compiler assigns dense integer indices for runtime performance.
 * These are used for array indexing and slot addressing.
 * Names only exist in metadata/debug tables.
 */

/** Dense index for nodes (0..N-1) */
export type NodeIndex = number;

/** Dense index for ports within a node's inputs or outputs */
export type PortIndex = number;

/**
 * Dense index into ValueStore arrays.
 *
 * Every output port maps to exactly one ValueSlot.
 * Inputs reference a ValueSlot (after adapters are applied).
 *
 * Rule: Single writer per slot per frame (compile-time guarantee).
 *
 * Sprint 2: Bundle types allocate N consecutive slots.
 * A bundle at slot N uses slots [N, N+bundleArity).
 */
export type ValueSlot = number;

/**
 * Signal expression ID - dense array index for runtime performance.
 * Changes on recompile.
 */
export type SigExprId = number;

/**
 * Field expression ID - dense array index for runtime performance.
 * Changes on recompile.
 */
export type FieldExprId = number;

/**
 * Event expression ID - dense array index for runtime performance.
 * Changes on recompile.
 *
 * Event expressions represent discrete event streams (not continuous signals).
 * Used for pulse buses, triggers, and discrete occurrences.
 */
export type EventExprId = number;

/**
 * Transform chain ID - dense array index.
 */
export type TransformChainId = number;

// ============================================================================
// Constant Pool (ADR-001)
// ============================================================================

/**
 * Constant pool for the compiled program.
 *
 * Allows efficient storage and deduplication of constants.
 *
 * References:
 * - ADR-001: Unified IR Schema
 */
export interface ConstPool {
  /**
   * JSON-serializable constants.
   * Includes numbers, strings, booleans, and objects.
   * Referenced by index in this array.
   */
  readonly json: readonly unknown[];

  /**
   * Optional: Typed arrays for faster access in Rust/WASM.
   * Not strictly required for JS runtime but part of the spec.
   */
  readonly f64?: Float64Array;
  readonly f32?: Float32Array;
  readonly i32?: Int32Array;
}

// ============================================================================
// Type Table (02-IR-Schema.md §5)
// ============================================================================

/**
 * Type interning table.
 *
 * The TypeTable optionally interns TypeDesc instances to small integers.
 * This is not required in TypeScript but is useful for Rust/WASM.
 */
export interface TypeTable {
  /** Array of interned TypeDesc instances */
  typeIds: TypeDesc[];
}

// ============================================================================
// Backward Compatibility Helpers
// ============================================================================

/**
 * Create a TypeDesc with defaults for category and busEligible.
 *
 * This helper provides backward compatibility for code that doesn't yet
 * specify category/busEligible. New code should use createTypeDesc from
 * core/types with explicit values.
 *
 * Defaults:
 * - category: 'internal' (conservative - assumes internal until proven core)
 * - busEligible: false (conservative - most types shouldn't use buses)
 *
 * @param world - Type world
 * @param domain - Type domain
 * @param options - Optional fields
 * @returns TypeDesc with defaults applied
 *
 * @deprecated Specify category and busEligible explicitly
 */
export function createTypeDescCompat(
  world: TypeWorld,
  domain: Domain,
  options?: {
    category?: TypeCategory;
    busEligible?: boolean;
    lanes?: number[];
    semantics?: string;
    unit?: string;
  }
): TypeDesc {
  const category = options?.category ?? 'internal';
  const busEligible = options?.busEligible ?? false;
  const lanes = options?.lanes ?? inferBundleLanes(domain);

  return {
    world,
    domain,
    category,
    busEligible,
    lanes,
    semantics: options?.semantics,
    unit: options?.unit,
  };
}

/**
 * Helper to quickly create TypeDesc from partial objects in tests.
 * Fills in required fields with sensible defaults.
 *
 * @param partial - Partial TypeDesc
 * @returns Complete TypeDesc
 *
 * @deprecated Use createTypeDesc with explicit values
 */
export function completeTypeDesc(partial: {
  world: TypeWorld;
  domain: Domain;
  category?: TypeCategory;
  busEligible?: boolean;
  lanes?: number[];
  semantics?: string;
  unit?: string;
}): TypeDesc {
  return createTypeDescCompat(
    partial.world,
    partial.domain,
    {
      category: partial.category,
      busEligible: partial.busEligible,
      lanes: partial.lanes,
      semantics: partial.semantics,
      unit: partial.unit,
    }
  );
}

/**
 * Type assertion helper for partial TypeDesc literals in tests.
 * Satisfies TypeScript that a partial object is a complete TypeDesc
 * by filling in missing required fields with defaults.
 *
 * @example
 * const t = asTypeDesc({ world: 'signal', domain: 'float' });
 * // Equivalent to: { world: 'signal', domain: 'float', category: 'internal', busEligible: false }
 *
 * @deprecated Use createTypeDescCompat or specify all fields explicitly
 */
export function asTypeDesc(partial: {
  world: TypeWorld;
  domain: Domain;
  category?: TypeCategory;
  busEligible?: boolean;
  lanes?: number[];
  semantics?: string;
  unit?: string;
}): TypeDesc {
  return {
    world: partial.world,
    domain: partial.domain,
    category: partial.category ?? 'internal',
    busEligible: partial.busEligible ?? false,
    lanes: partial.lanes ?? inferBundleLanes(partial.domain),
    semantics: partial.semantics,
    unit: partial.unit,
  };
}