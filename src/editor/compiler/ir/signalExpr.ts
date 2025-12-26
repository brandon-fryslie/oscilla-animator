/**
 * SignalExpr Schema
 *
 * Signal expressions as data - the canonical representation of time-varying values.
 * NO closures, NO hidden state - everything is explicit and inspectable.
 *
 * Philosophy: Signals as data, not closures - enables inspection and serialization.
 *
 * References:
 * - design-docs/12-Compiler-Final/12-SignalExpr.md
 * - HANDOFF.md Topic 1: SignalExpr Schema
 */

import type { TypeDesc, ValueSlot, BusIndex, StateId, TransformChainId, SigExprId } from "./types";
import type { CombineSpec } from "./schedule";
import type { PureFnRef } from "./transforms";

// Re-export SigExprId for convenience
export type { SigExprId } from "./types";

// =============================================================================
// Signal Expression Table
// =============================================================================

/**
 * Signal expression table - dense array of signal nodes.
 * Index = SigExprId for O(1) lookup.
 */
export interface SignalExprTable {
  /** Dense array of signal expressions */
  nodes: SignalExprIR[];
}

// =============================================================================
// Signal Expression Node Kinds
// =============================================================================

/**
 * Signal expression IR - discriminated union of all node kinds.
 *
 * Key invariants:
 * - Every node has explicit type: TypeDesc
 * - Stateful ops reference explicit stateId (no closure memory)
 * - Bus combine terms are pre-sorted (runtime never re-sorts)
 * - Dense numeric indices for all references
 */
export type SignalExprIR =
  // Constants
  | SignalExprConst

  // Canonical time signals (derived by timeDerive step)
  | SignalExprTimeAbsMs
  | SignalExprTimeModelMs
  | SignalExprPhase01
  | SignalExprWrapEvent

  // Reference another node's output slot
  | SignalExprInputSlot

  // Pure combinators
  | SignalExprMap
  | SignalExprZip
  | SignalExprSelect

  // Transforms (adapters + lenses)
  | SignalExprTransform

  // Bus combine
  | SignalExprBusCombine

  // Stateful operations (explicit state, NO closure memory)
  | SignalExprStateful;

// -----------------------------------------------------------------------------
// Individual Signal Expression Kinds
// -----------------------------------------------------------------------------

/** Constant value from const pool */
export interface SignalExprConst {
  kind: "const";
  type: TypeDesc;
  constId: number;
}

/** Absolute time in milliseconds */
export interface SignalExprTimeAbsMs {
  kind: "timeAbsMs";
  type: TypeDesc;
}

/** Model time in milliseconds (after time model transformation) */
export interface SignalExprTimeModelMs {
  kind: "timeModelMs";
  type: TypeDesc;
}

/** Phase 0..1 for cyclic time models */
export interface SignalExprPhase01 {
  kind: "phase01";
  type: TypeDesc;
}

/** Wrap event trigger for cyclic time models */
export interface SignalExprWrapEvent {
  kind: "wrapEvent";
  type: TypeDesc;
}

/** Reference to a value slot (node output) */
export interface SignalExprInputSlot {
  kind: "inputSlot";
  type: TypeDesc;
  slot: ValueSlot;
}

/** Map operation - apply function to single input */
export interface SignalExprMap {
  kind: "map";
  type: TypeDesc;
  src: SigExprId;
  fn: PureFnRef;
}

/** Zip operation - apply function to two inputs */
export interface SignalExprZip {
  kind: "zip";
  type: TypeDesc;
  a: SigExprId;
  b: SigExprId;
  fn: PureFnRef;
}

/** Select operation - conditional branching */
export interface SignalExprSelect {
  kind: "select";
  type: TypeDesc;
  cond: SigExprId;
  t: SigExprId;
  f: SigExprId;
}

/** Transform chain application */
export interface SignalExprTransform {
  kind: "transform";
  type: TypeDesc;
  src: SigExprId;
  chain: TransformChainId;
}

/** Bus combine - aggregate multiple publishers */
export interface SignalExprBusCombine {
  kind: "busCombine";
  type: TypeDesc;
  busIndex: BusIndex;
  /** Pre-sorted by compiler - runtime never re-sorts */
  terms: SigExprId[];
  combine: CombineSpec;
}

/** Stateful operation with explicit state reference */
export interface SignalExprStateful {
  kind: "stateful";
  type: TypeDesc;
  op: StatefulSignalOp;
  input?: SigExprId;
  /** Explicit state reference - no closure memory */
  stateId: StateId;
  params?: Record<string, number>;
}

// =============================================================================
// Stateful Signal Operations
// =============================================================================

/**
 * Stateful signal operations - all have explicit state.
 * No closure memory - state is referenced by stateId.
 */
export type StatefulSignalOp =
  | "integrate" // number/unit -> number (accumulator)
  | "delayMs" // any -> any (time-based delay)
  | "delayFrames" // any -> any (frame-based delay)
  | "sampleHold" // any + trigger -> any (hold on trigger)
  | "slew" // any -> any (smoothing)
  | "edgeDetectWrap"; // phase01 -> trigger (wrap detection)
