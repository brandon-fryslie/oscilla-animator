/**
 * Pure Operator AST Types
 *
 * Defines the allowed AST node types for pure operator blocks.
 * Pure operator blocks MUST compile to these AST types, not raw closures.
 *
 * This enforces the constraint that pure operators are:
 * - Inspectable (AST nodes, not opaque functions)
 * - Serializable (can be exported/debugged)
 * - Verifiable (purity by inspection)
 * - Optimizable (compiler can analyze/transform)
 *
 * References:
 * - design-docs/7-Primitives/3-Registry-Gating.md § Pure Block Compilation
 * - .agent_planning/primitives/PLAN-2025-12-27-030002.md Deliverable 3
 */

import type { SignalExprIR } from "./ir/signalExpr";
import type { FieldExprIR } from "./ir/fieldExpr";


// =============================================================================
// Signal Expression AST
// =============================================================================

/**
 * SignalExpr - Pure signal expressions as AST nodes.
 *
 * These are the ONLY allowed outputs for pure operator blocks that produce signals.
 * Raw closures `(t: number) => number` are NOT allowed.
 *
 * All variants are defined in ir/signalExpr.ts:
 * - const: Constant value
 * - timeAbsMs: Absolute time
 * - timeModelMs: Model time
 * - phase01: Phase signal (0..1)
 * - wrapEvent: Wrap event trigger
 * - inputSlot: Reference to another node's output
 * - map: Unary function application
 * - zip: Binary function application
 * - select: Conditional (ternary)
 * - transform: Transform chain application
 * - busCombine: Bus aggregation
 * - stateful: Stateful operations (integrate, delay, etc.)
 * - closureBridge: TEMPORARY - migration bridge (will be removed)
 */
export type SignalExpr = SignalExprIR;

// =============================================================================
// Field Expression AST
// =============================================================================

/**
 * FieldExpr - Pure field expressions as AST nodes.
 *
 * These are the ONLY allowed outputs for pure operator blocks that produce fields.
 * Raw closures `(seed: number, n: number) => T[]` are NOT allowed.
 *
 * All variants are defined in ir/fieldExpr.ts:
 * - const: Constant field value
 * - broadcastSig: Broadcast signal to field
 * - map: Unary function application
 * - zip: Binary function application
 * - select: Conditional (ternary)
 * - transform: Transform chain application
 * - busCombine: Bus aggregation
 */
export type FieldExpr = FieldExprIR;

// =============================================================================
// Pure Function References
// =============================================================================

/**
 * Pure function types allowed in pure operator blocks.
 *
 * These are NOT raw closures - they are references to:
 * - Built-in opcodes (add, mul, sin, etc.)
 * - User-defined pure functions registered in the function table
 *
 * The actual function implementation is looked up at runtime, but the
 * reference itself is data (fnId + params).
 */
export type { PureFnRef, ReduceFn } from "./ir/builderTypes";

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a SignalExpr AST node.
 */
export function isSignalExpr(value: unknown): value is SignalExpr {
  if (value == null || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Must have 'kind' field matching SignalExprIR kinds
  const validKinds = [
    "const",
    "timeAbsMs",
    "timeModelMs",
    "phase01",
    "wrapEvent",
    "inputSlot",
    "map",
    "zip",
    "select",
    "transform",
    "busCombine",
    "stateful",
    "closureBridge",
  ];

  return typeof obj.kind === "string" && validKinds.includes(obj.kind);
}

/**
 * Check if a value is a FieldExpr AST node.
 */
export function isFieldExpr(value: unknown): value is FieldExpr {
  if (value == null || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Must have 'kind' field matching FieldExprIR kinds
  const validKinds = [
    "const",
    "broadcastSig",
    "map",
    "zip",
    "select",
    "transform",
    "busCombine",
  ];

  return typeof obj.kind === "string" && validKinds.includes(obj.kind);
}

/**
 * Check if a value is a closure (function).
 * Raw closures are NOT allowed in pure operator blocks.
 */
export function isClosure(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}
