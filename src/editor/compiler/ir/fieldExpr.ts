/**
 * FieldExpr Schema
 *
 * Field expressions as data - domain-varying values (functions over element domains).
 * Parallel structure to SignalExprIR but for per-element data.
 *
 * Philosophy: Fields as data, not closures - enables inspection and serialization.
 *
 * References:
 * - design-docs/12-Compiler-Final/12-SignalExpr.md
 * - HANDOFF.md Topic 1: SignalExpr Schema (field variant)
 */

import type { TypeDesc, ValueSlot, BusIndex, TransformChainId, FieldExprId, SigExprId } from "./types";
import type { CombineSpec } from "./schedule";
import type { PureFnRef } from "./transforms";

// Re-export FieldExprId for convenience
export type { FieldExprId } from "./types";

// =============================================================================
// Field Expression Table
// =============================================================================

/**
 * Field expression table - dense array of field nodes.
 * Index = FieldExprId for O(1) lookup.
 */
export interface FieldExprTable {
  /** Dense array of field expressions */
  nodes: FieldExprIR[];
}

// =============================================================================
// Field Expression Node Kinds
// =============================================================================

/**
 * Field expression IR - discriminated union of all node kinds.
 *
 * Key invariants:
 * - Every node has explicit type: TypeDesc
 * - Dense numeric indices for all references
 * - Parallel structure to SignalExprIR for per-element values
 */
export type FieldExprIR =
  // Constants
  | FieldExprConst

  // Reference to signal broadcast
  | FieldExprBroadcastSig

  // Pure combinators
  | FieldExprMap
  | FieldExprZip
  | FieldExprSelect

  // Indexed and signal-combining operations
  | FieldExprMapIndexed
  | FieldExprZipSig

  // Transforms
  | FieldExprTransform

  // Bus combine
  | FieldExprBusCombine;

// -----------------------------------------------------------------------------
// Individual Field Expression Kinds
// -----------------------------------------------------------------------------

/** Constant field value from const pool */
export interface FieldExprConst {
  kind: "const";
  type: TypeDesc;
  constId: number;
}

/** Broadcast a signal to a field (repeat signal value for each element) */
export interface FieldExprBroadcastSig {
  kind: "broadcastSig";
  type: TypeDesc;
  sig: SigExprId;
  domainSlot: ValueSlot;
}

/** Map operation - apply function to single field input */
export interface FieldExprMap {
  kind: "map";
  type: TypeDesc;
  src: FieldExprId;
  fn: PureFnRef;
  params?: Record<string, unknown>;
}

/** Zip operation - apply function to two field inputs */
export interface FieldExprZip {
  kind: "zip";
  type: TypeDesc;
  a: FieldExprId;
  b: FieldExprId;
  fn: PureFnRef;
  params?: Record<string, unknown>;
}

/** Select operation - conditional branching per element */
export interface FieldExprSelect {
  kind: "select";
  type: TypeDesc;
  cond: FieldExprId;
  t: FieldExprId;
  f: FieldExprId;
}

/**
 * Indexed map operation - generate field values from element index.
 *
 * Semantics: fn(i, n, ...sigValues) for each element index i in domain of size n.
 * The function receives element index and domain count, plus any signals evaluated once.
 *
 * Use cases:
 * - FieldHueGradient: hue = hueOffset + (i/n) * spread
 * - Linear interpolation fields
 * - Index-based patterns (waves, gradients)
 */
export interface FieldExprMapIndexed {
  kind: "mapIndexed";
  type: TypeDesc;
  /** Domain slot - provides element count n */
  domainSlot: ValueSlot;
  /** Pure function: fn(i, n, ...sigValues) → T */
  fn: PureFnRef;
  /** Optional signals to evaluate once and pass to function */
  signals?: SigExprId[];
}

/**
 * Zip field with signals - combine per-element field values with scalar signals.
 *
 * Semantics: fn(field[i], sig1, sig2, ...) for each element.
 * Signals are evaluated once; field is evaluated per-element.
 *
 * Use cases:
 * - JitterFieldVec2: jitter(pos, time, amplitude)
 * - FieldMapVec2: transform(pos, angle, scale, ...)
 * - Any field + animated signal combination
 */
export interface FieldExprZipSig {
  kind: "zipSig";
  type: TypeDesc;
  /** Field input - evaluated per-element */
  field: FieldExprId;
  /** Signals to evaluate once per frame */
  signals: SigExprId[];
  /** Pure function: fn(fieldValue, sig1, sig2, ...) → T */
  fn: PureFnRef;
}

/** Transform chain application */
export interface FieldExprTransform {
  kind: "transform";
  type: TypeDesc;
  src: FieldExprId;
  chain: TransformChainId;
}

/** Bus combine - aggregate multiple field publishers */
export interface FieldExprBusCombine {
  kind: "busCombine";
  type: TypeDesc;
  busIndex: BusIndex;
  /** Pre-sorted by compiler - runtime never re-sorts */
  terms: FieldExprId[];
  combine: CombineSpec;
}
