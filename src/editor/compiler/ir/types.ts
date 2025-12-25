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
  | "number"
  | "boolean"
  | "string"
  | "vec2"
  | "vec3"
  | "vec4"
  | "color"
  | "bounds"
  | "timeMs"
  | "phase01"
  | "unit01"
  | "trigger" // discrete event-ish signal
  | "domain" // element identity handle
  | "renderTree"
  | "renderCmds"
  | "mesh"
  | "camera"
  | "mat4"
  | "path"
  | "strokeStyle"
  | "filterDef"
  | "unknown";

/**
 * Complete type descriptor for a value.
 *
 * TypeDesc is the unified type system across all Oscilla IR.
 * It combines world (signal/field/scalar), domain (number/vec2/color),
 * and optional semantic/unit annotations.
 */
export interface TypeDesc {
  /** Top-level world classification */
  world: TypeWorld;

  /** Domain-specific type */
  domain: TypeDomain;

  /** Optional semantic annotation (e.g., "point", "hsl", "linearRGB", "bpm") */
  semantics?: string;

  /** Optional unit annotation (e.g., "px", "deg", "ms") */
  unit?: string;
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
 */
export type ValueSlot = number;

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
