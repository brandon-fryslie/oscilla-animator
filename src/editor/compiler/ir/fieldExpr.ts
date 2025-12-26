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
}

/** Zip operation - apply function to two field inputs */
export interface FieldExprZip {
  kind: "zip";
  type: TypeDesc;
  a: FieldExprId;
  b: FieldExprId;
  fn: PureFnRef;
}

/** Select operation - conditional branching per element */
export interface FieldExprSelect {
  kind: "select";
  type: TypeDesc;
  cond: FieldExprId;
  t: FieldExprId;
  f: FieldExprId;
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
