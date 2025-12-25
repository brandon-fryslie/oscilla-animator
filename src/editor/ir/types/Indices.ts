/**
 * Dense Index Types for IR
 *
 * Branded types for dense numeric indices used in runtime lookups.
 * String IDs are for persistence and debugging; indices are for fast runtime access.
 *
 * @module ir/types/Indices
 */

// =============================================================================
// Branded Index Types (Numeric)
// =============================================================================

/**
 * Dense index for nodes in the NodeTable.
 * Branded for type safety - prevents mixing with other index types.
 */
export type NodeIndex = number & { readonly __brand: 'NodeIndex' };

/**
 * Dense index for ports within a node.
 */
export type PortIndex = number & { readonly __brand: 'PortIndex' };

/**
 * Dense index for buses in the BusTable.
 */
export type BusIndex = number & { readonly __brand: 'BusIndex' };

/**
 * Dense index for value slots in the ValueStore.
 * Each port output is assigned a unique ValueSlot.
 */
export type ValueSlot = number & { readonly __brand: 'ValueSlot' };

/**
 * Dense index for steps in the Schedule.
 */
export type StepIndex = number & { readonly __brand: 'StepIndex' };

// =============================================================================
// Branded ID Types (String)
// =============================================================================

/**
 * Stable string ID for nodes (persisted, used for hot-swap matching).
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * Stable string ID for buses.
 */
export type BusId = string & { readonly __brand: 'BusId' };

/**
 * Stable string ID for schedule steps.
 */
export type StepId = string & { readonly __brand: 'StepId' };

/**
 * Stable string ID for field expressions.
 */
export type ExprId = string & { readonly __brand: 'ExprId' };

/**
 * Stable string ID for state bindings.
 */
export type StateId = string & { readonly __brand: 'StateId' };

// =============================================================================
// Factory Functions
// =============================================================================

// These are compile-time only casts with zero runtime cost.
// TypeScript erases the brands at runtime.

/**
 * Create a NodeIndex from a number.
 */
export function nodeIndex(n: number): NodeIndex {
  return n as NodeIndex;
}

/**
 * Create a PortIndex from a number.
 */
export function portIndex(n: number): PortIndex {
  return n as PortIndex;
}

/**
 * Create a BusIndex from a number.
 */
export function busIndex(n: number): BusIndex {
  return n as BusIndex;
}

/**
 * Create a ValueSlot from a number.
 */
export function valueSlot(n: number): ValueSlot {
  return n as ValueSlot;
}

/**
 * Create a StepIndex from a number.
 */
export function stepIndex(n: number): StepIndex {
  return n as StepIndex;
}

/**
 * Create a NodeId from a string.
 */
export function nodeId(s: string): NodeId {
  return s as NodeId;
}

/**
 * Create a BusId from a string.
 */
export function busId(s: string): BusId {
  return s as BusId;
}

/**
 * Create a StepId from a string.
 */
export function stepId(s: string): StepId {
  return s as StepId;
}

/**
 * Create an ExprId from a string.
 */
export function exprId(s: string): ExprId {
  return s as ExprId;
}

/**
 * Create a StateId from a string.
 */
export function stateId(s: string): StateId {
  return s as StateId;
}
