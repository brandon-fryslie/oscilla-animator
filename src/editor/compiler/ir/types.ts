/**
 * Core Type System for Oscilla IR
 *
 * This module defines the foundational type descriptors and indexing types
 * used throughout the IR system.
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §1-2
 * - design-docs/12-Compiler-Final/14-Compiled-IR-Program-Contract.md §3
 */

// ============================================================================
// Core Type System (02-IR-Schema.md §1.1)
// ============================================================================

/**
 * Top-level categorization of values in the Oscilla system.
 *
 * - `signal`: Time-varying values (functions of time)
 * - `field`: Domain-varying values (functions over element domains)
 * - `scalar`: Simple immediate values
 * - `event`: Discrete event streams
 * - `special`: Domain handles, render trees, etc.
 */
export type TypeWorld = "signal" | "field" | "scalar" | "event" | "special";

/**
 * Domain-specific type classifications.
 *
 * Describes the semantic domain of a value (e.g., number, color, vec2).
 */
export type TypeDomain =
  | "float"
  | "int"
  | "boolean"
  | "string"
  | "expression"
  | "waveform"
  | "vec2"
  | "vec3"
  | "vec4"
  | "quat" // Quaternion for 3D rotations (x, y, z, w)
  | "color"
  | "bounds"
  | "timeMs"
  | "trigger" // discrete event-ish signal
  | "domain" // element identity handle
  | "renderTree"
  | "renderNode"
  | "renderCmds"
  | "canvasRender"
  | "mesh"
  | "camera"
  | "mat4"
  | "path"
  | "strokeStyle"
  | "filterDef"
  | "phaseSample"
  | "phaseMachine"
  | "scene"
  | "sceneTargets"
  | "sceneStrokes"
  | "program"
  | "unknown";

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

/**
 * Complete type descriptor for a value.
 *
 * TypeDesc is the unified type system across all Oscilla IR.
 * It combines world (signal/field/scalar), domain (number/vec2/color),
 * and optional semantic/unit annotations.
 *
 * Sprint 2 extension: Added bundle type system support.
 */
export interface TypeDesc {
  /** Top-level world classification */
  world: TypeWorld;

  /** Domain-specific type */
  domain: TypeDomain;

  /**
   * Bundle kind - how many scalar slots this type occupies.
   * Defaults to Scalar (arity=1) if not specified.
   *
   * Sprint 2: Bundle type system
   */
  bundleKind?: BundleKind;

  /**
   * Bundle arity - number of consecutive scalar slots.
   * Derived from bundleKind.
   *
   * Examples:
   * - Scalar: arity=1 (single slot)
   * - Vec2: arity=2 (slots [N, N+1])
   * - Vec3: arity=3 (slots [N, N+1, N+2])
   * - RGBA: arity=4 (slots [N, N+1, N+2, N+3])
   * - Mat4: arity=16 (slots [N..N+15])
   *
   * Sprint 2: Bundle type system
   */
  bundleArity?: number;

  /** Optional semantic annotation (e.g., "point", "hsl", "linearRGB", "bpm") */
  semantics?: string;

  /** Optional unit annotation (e.g., "px", "deg", "ms") */
  unit?: string;
}

/**
 * Create a TypeDesc with automatic bundle inference.
 *
 * Convenience function that infers bundleKind and bundleArity from domain.
 *
 * @param world - Type world
 * @param domain - Type domain
 * @param options - Optional semantic/unit annotations
 * @returns Complete TypeDesc with bundle information
 */
export function createTypeDesc(
  world: TypeWorld,
  domain: TypeDomain,
  options?: {
    semantics?: string;
    unit?: string;
    bundleKind?: BundleKind; // Override auto-inference if needed
  }
): TypeDesc {
  const bundleKind = options?.bundleKind ?? inferBundleKind(domain);
  const bundleArity = getBundleArity(bundleKind);

  return {
    world,
    domain,
    bundleKind,
    bundleArity,
    semantics: options?.semantics,
    unit: options?.unit,
  };
}

/**
 * Get the bundle arity for a TypeDesc.
 *
 * Returns 1 for scalar types, N for bundle types.
 * Safe accessor that handles missing bundleArity field.
 *
 * @param type - Type descriptor
 * @returns Number of scalar slots (defaults to 1)
 */
export function getTypeArity(type: TypeDesc): number {
  return type.bundleArity ?? 1;
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

/** Dense index for buses (0..B-1) */
export type BusIndex = number;

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
