/**
 * SignalExpr Schema
 *
 * Signal expressions as data - the canonical representation of time-varying values.
 * No hidden state; closureBridge is the only temporary legacy escape hatch.
 *
 * Philosophy: Signals as data, not closures - enables inspection and serialization.
 *
 * References:
 * - design-docs/12-Compiler-Final/12-SignalExpr.md
 * - HANDOFF.md Topic 1: SignalExpr Schema
 */

import type { TypeDesc, ValueSlot, StateId, TransformChainId, SigExprId, EventExprId } from "./types";
import type { PureFnRef } from "./transforms";

// Re-export expression IDs for convenience
export type { SigExprId, EventExprId } from "./types";

// =============================================================================
// Signal Expression Combine Types
// =============================================================================

/**
 * Combine mode for signal bus aggregation.
 *
 * Defines how multiple signal terms are combined:
 * - `sum`: Add all terms
 * - `average`: Mean of all terms
 * - `min`: Minimum value
 * - `max`: Maximum value
 * - `first`: First term in sorted order (compiler-sorted)
 * - `last`: Last term in sorted order (compiler-sorted)
 */
export type SigCombineMode = "sum" | "average" | "min" | "max" | "first" | "last";

/**
 * Combine specification for signal bus combine nodes.
 *
 * Specifies how to aggregate multiple signal publishers into a single bus value.
 */
export interface SigCombineSpec {
  /** Combine mode */
  mode: SigCombineMode;
  /** Default value when no publishers (default: 0) */
  default?: number;
}

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
  | SignalExprStateful

  // TEMPORARY: Closure bridge for migration (Sprint 6)
  | SignalExprClosureBridge;

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
  /** Pre-sorted by compiler - runtime never re-sorts */
  terms: SigExprId[];
  combine: SigCombineSpec;
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

/**
 * TEMPORARY: Closure bridge node for gradual migration.
 *
 * Allows calling legacy closure-based signals from within SignalExpr DAG.
 * This is a temporary mechanism to support gradual block-by-block migration.
 *
 * Will be REMOVED once all blocks are migrated to IR (Sprint 7+).
 *
 * Philosophy:
 * - Enables migration without breaking existing functionality
 * - closureId is looked up in ClosureRegistry at evaluation time
 * - inputSlots are optional evaluated signal inputs (reserved for future)
 * - Result is cached like any other node
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md
 * - design-docs/12-Compiler-Final/01.1-CompilerMigration-Roadmap.md
 */
export interface SignalExprClosureBridge {
  kind: "closureBridge";
  type: TypeDesc;
  /** Unique ID for closure lookup in ClosureRegistry */
  closureId: string;
  /** Optional evaluated signal inputs to pass to closure (reserved for future) */
  inputSlots: SigExprId[];
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
  | "edgeDetectWrap" // phase01 -> trigger (wrap detection)
  | "pulseDivider" // phase01 -> trigger (pulse division)
  | "envelopeAD"; // trigger -> number (envelope generator)

// =============================================================================
// Event Expression Types
// =============================================================================

/**
 * Combine mode for event bus aggregation.
 *
 * Defines how multiple event streams are combined:
 * - `merge`: Union of all event occurrences (sorted by time)
 * - `first`: Events from first publisher only (by sortKey)
 * - `last`: Events from last publisher only (by sortKey)
 */
export type EventCombineMode = "merge" | "first" | "last";

/**
 * Combine specification for event bus combine nodes.
 */
export interface EventCombineSpec {
  /** Combine mode */
  mode: EventCombineMode;
}

/**
 * Event expression table - dense array of event nodes.
 * Index = EventExprId for O(1) lookup.
 */
export interface EventExprTable {
  /** Dense array of event expressions */
  nodes: EventExprIR[];
}

/**
 * Event expression IR - discriminated union of all event node kinds.
 *
 * Key invariants:
 * - Every node has explicit type: TypeDesc (world: "event")
 * - Event streams are objects, not numeric values
 * - Bus combine terms are pre-sorted (runtime never re-sorts)
 */
export type EventExprIR =
  // Empty event stream (no events)
  | EventExprEmpty

  // Wrap event from cyclic time model
  | EventExprWrap

  // Reference another node's output slot
  | EventExprInputSlot

  // Map event values through a pure function
  | EventExprMap

  // Filter events by predicate
  | EventExprFilter

  // Merge multiple event streams
  | EventExprMerge

  // Bus combine
  | EventExprBusCombine;

// -----------------------------------------------------------------------------
// Individual Event Expression Kinds
// -----------------------------------------------------------------------------

/** Empty event stream (produces no events) */
export interface EventExprEmpty {
  kind: "eventEmpty";
  type: TypeDesc;
}

/** Wrap event from cyclic time model - fires when phase wraps from 1 to 0 */
export interface EventExprWrap {
  kind: "eventWrap";
  type: TypeDesc;
}

/** Reference to a value slot containing an event stream */
export interface EventExprInputSlot {
  kind: "eventInputSlot";
  type: TypeDesc;
  slot: ValueSlot;
}

/** Map event values through a pure function */
export interface EventExprMap {
  kind: "eventMap";
  type: TypeDesc;
  src: EventExprId;
  fn: PureFnRef;
}

/** Filter events by predicate (keep events where predicate returns true) */
export interface EventExprFilter {
  kind: "eventFilter";
  type: TypeDesc;
  src: EventExprId;
  predicate: PureFnRef;
}

/** Merge multiple event streams (union, sorted by time) */
export interface EventExprMerge {
  kind: "eventMerge";
  type: TypeDesc;
  sources: EventExprId[];
}

/** Event bus combine - aggregate multiple publishers */
export interface EventExprBusCombine {
  kind: "eventBusCombine";
  type: TypeDesc;
  /** Pre-sorted by compiler - runtime never re-sorts */
  terms: EventExprId[];
  combine: EventCombineSpec;
}
