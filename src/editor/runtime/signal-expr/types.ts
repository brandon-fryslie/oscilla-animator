/**
 * Signal Expression Runtime Types
 *
 * Runtime-specific types for signal expression evaluation.
 * These complement the IR types with runtime evaluation concerns.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-03-busCombine.md
 * - src/editor/compiler/ir/signalExpr.ts
 */

import type { SigExprId } from "../../compiler/ir/types";

// =============================================================================
// Bus Combine Types (Sprint 3)
// =============================================================================

/**
 * Combine mode for bus aggregation.
 *
 * Defines how multiple signal terms are combined into a single output:
 * - `sum`: Add all terms (Σ terms)
 * - `average`: Mean of all terms (Σ terms / count)
 * - `min`: Minimum value across all terms
 * - `max`: Maximum value across all terms
 * - `first`: First term in sorted order
 * - `last`: Last term in sorted order
 *
 * NOTE: Terms array is pre-sorted by compiler (by sortKey).
 * Evaluator does NOT re-sort - it trusts compiler ordering.
 */
export type CombineMode = "sum" | "average" | "min" | "max" | "first" | "last";

/**
 * Combine specification for bus combine nodes.
 *
 * Specifies how to aggregate multiple publishers into a single bus value.
 *
 * @property mode - Combine function to apply
 * @property default - Value to return when no publishers (defaults to 0)
 *
 * @example
 * ```typescript
 * // Sum combine with default 0
 * const spec: CombineSpec = { mode: "sum" };
 *
 * // Average combine with custom default
 * const spec: CombineSpec = { mode: "average", default: 100 };
 * ```
 */
export interface CombineSpec {
  /** Combine mode */
  mode: CombineMode;

  /** Default value when no publishers (default: 0) */
  default?: number;
}

/**
 * Bus combine node for signal expressions.
 *
 * Combines multiple signal terms into one output using a specified combine function.
 *
 * Key semantics:
 * - Empty bus (terms.length === 0): Returns combine.default (or 0)
 * - Single term: Returns that term directly (no combine needed)
 * - Multiple terms: Evaluates all terms, applies combine function
 * - Terms array is pre-sorted by compiler - runtime never re-sorts
 *
 * @example
 * ```typescript
 * // Sum of three signals
 * const node: BusCombineNode = {
 *   kind: "busCombine",
 *   type: { world: "signal", domain: "number" },
 *   busIndex: 0,
 *   terms: [sigId0, sigId1, sigId2],
 *   combine: { mode: "sum" }
 * };
 * ```
 */
export interface BusCombineNode {
  kind: "busCombine";
  type: import("../../compiler/ir/types").TypeDesc;
  busIndex: number;
  /** Pre-sorted terms (compiler responsibility) */
  terms: SigExprId[];
  /** Combine specification */
  combine: CombineSpec;
}
