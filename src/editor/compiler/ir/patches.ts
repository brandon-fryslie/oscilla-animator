/**
 * Patch Transformation Types
 *
 * Intermediate representations of the patch as it moves through compilation passes.
 * Each pass transforms the patch, adding information and validating constraints.
 *
 * Pass Flow:
 * Patch -> NormalizedPatch -> TypedPatch -> TimeResolvedPatch -> DepGraph -> ...
 *
 * References:
 * - HANDOFF.md Topics 2-5: Compilation Passes
 * - design-docs/12-Compiler-Final/02-IR-Schema.md
 */

import type { TypeDesc, SigExprId } from "./types";
import type { TimeModelIR } from "./schedule";
import type { Edge } from "../../types";

// =============================================================================
// Block Index (Dense ID for Runtime)
// =============================================================================

/**
 * Index into the blocks array (dense, starts at 0).
 * Frozen at normalization time - stable mapping from BlockId to BlockIndex.
 */
export type BlockIndex = number & { readonly __brand: "BlockIndex" };

/**
 * Constant ID in the constant pool (for default sources).
 */
export type ConstId = number & { readonly __brand: "ConstId" };

// =============================================================================
// Default Source Attachment
// =============================================================================

/**
 * Default source attachment for an unwired input.
 * Created during Pass 1 (Normalize) for inputs without wires or bus listeners.
 */
export interface DefaultSourceAttachment {
  /** Block containing the input */
  readonly blockId: string;

  /** Input slot ID */
  readonly slotId: string;

  /** Constant pool reference for the default value */
  readonly constId: ConstId;
}

// =============================================================================
// Normalized Patch - Pass 1
// =============================================================================

/**
 * Normalized patch representation.
 *
 * Normalization establishes:
 * 1. Stable BlockIndex assignments (frozen block ordering)
 * 2. Const pool with default source values
 * 3. Default source attachments for unwired inputs
 */
export interface NormalizedPatch {
  /** Stable block indexing (frozen) */
  readonly blockIndexMap: ReadonlyMap<string, BlockIndex>;

  /** Edges from the original patch (includes wires + bus connections) */
  readonly edges: readonly Edge[];

  /** Default source attachments for unwired inputs */
  readonly defaults: readonly DefaultSourceAttachment[];

  /** Const pool entries */
  readonly constPool: ReadonlyMap<ConstId, unknown>;

  // Forward the full patch for later passes
  readonly blocks: ReadonlyMap<string, unknown>; // opaque block data

  // Thread through buses and publishers/listeners (legacy until bus-block unification)
  readonly buses?: ReadonlyMap<string, unknown>;
  readonly publishers?: readonly unknown[];
  readonly listeners?: readonly unknown[];
}

// =============================================================================
// Typed Patch - Pass 2
// =============================================================================

/**
 * Typed patch with resolved types for all edges and defaults.
 *
 * Pass 2 resolves TypeDesc for every connection and validates type compatibility.
 */
export interface TypedPatch extends NormalizedPatch {
  /** Type descriptors for each block output */
  readonly blockOutputTypes: ReadonlyMap<string, ReadonlyMap<string, TypeDesc>>;

  /** Type descriptors for bus outputs (if any buses exist) */
  readonly busOutputTypes?: ReadonlyMap<string, TypeDesc>;
}

// =============================================================================
// Time-Resolved Patch - Pass 3
// =============================================================================

/**
 * Patch with time signals resolved and validated.
 *
 * Pass 3 determines the time model and generates derived time signals.
 */
export interface TimeResolvedPatch extends TypedPatch {
  /** Time model (authoritative for the patch) */
  readonly timeModel: TimeModelIR;

  /** Derived time signals available to all blocks */
  readonly timeSignals: TimeSignals;
}

/**
 * Derived time signals generated from the time model.
 */
export interface TimeSignals {
  /** Signal expression ID for tModelMs (model time) */
  readonly tModelMs: SigExprId;

  /** Signal expression ID for phase01 (cyclic only) */
  readonly phase01?: SigExprId;

  /** Signal expression ID for wrapEvent (cyclic only) */
  readonly wrapEvent?: SigExprId;

  /** Signal expression ID for progress01 (finite only) */
  readonly progress01?: SigExprId;
}

// =============================================================================
// Dependency Graph - Pass 4
// =============================================================================

/**
 * Node in the dependency graph.
 *
 * After bus-block unification, all nodes are BlockEval nodes.
 * BusBlocks are treated like any other block.
 */
export type DepNode = { readonly kind: "BlockEval"; readonly blockIndex: BlockIndex };

/**
 * Edge in the dependency graph.
 */
export interface DepEdge {
  readonly from: DepNode;
  readonly to: DepNode;
}

/**
 * Complete dependency graph.
 */
export interface DepGraph {
  readonly nodes: readonly DepNode[];
  readonly edges: readonly DepEdge[];
}

// =============================================================================
// Cycle Validation - Pass 5
// =============================================================================

/**
 * Strongly connected component in the dependency graph.
 */
export interface SCC {
  readonly nodes: readonly DepNode[];
  readonly hasStateBoundary: boolean;
}

/**
 * Illegal cycle error.
 */
export interface IllegalCycleError {
  readonly kind: "IllegalCycle";
  readonly nodes: readonly BlockIndex[];
}

/**
 * Graph with cycle validation results.
 */
export interface AcyclicOrLegalGraph {
  readonly graph: DepGraph;
  readonly sccs: readonly SCC[];
  readonly errors: readonly IllegalCycleError[];

  /** Time model from Pass 3, threaded through for Pass 6 */
  readonly timeModel: TimeModelIR;
}

// =============================================================================
// Helper Type Guards
// =============================================================================

/**
 * Type guard for BlockEval nodes.
 */
export function isBlockEval(node: DepNode): node is { kind: "BlockEval"; blockIndex: BlockIndex } {
  return node.kind === "BlockEval";
}

/**
 * Type guard for BusValue nodes (DEPRECATED).
 *
 * After bus-block unification, all buses are represented as BusBlocks,
 * which are BlockEval nodes. This function is kept for backward compatibility
 * but always returns false.
 *
 * @deprecated Buses are now BusBlocks - use isBlockEval instead
 */
export function isBusValue(_node: DepNode): boolean {
  return false;
}
