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

import type { TypeDesc, BusIndex, SigExprId } from "./types";
import type { TimeModelIR } from "./schedule";

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

  /** Type of the default value */
  readonly type: TypeDesc;
}

// =============================================================================
// NormalizedPatch - Output of Pass 1
// =============================================================================

/**
 * NormalizedPatch - output of Pass 1.
 *
 * A structurally well-formed patch with:
 * - Frozen block ID -> BlockIndex mapping
 * - Default sources attached to unwired inputs
 * - Canonicalized publishers/listeners (sorted, enabled only)
 *
 * This is a generic interface that works with the existing Patch types.
 */
export interface NormalizedPatch<
  TBlock = unknown,
  TConnection = unknown,
  TPublisher = unknown,
  TListener = unknown,
  TBus = unknown,
> {
  /** Stable mapping from BlockId to BlockIndex */
  readonly blockIndexMap: Map<string, BlockIndex>;

  /** All blocks (order preserved from original patch) */
  readonly blocks: readonly TBlock[];

  /** All wires/connections */
  readonly wires: readonly TConnection[];

  /** Canonicalized publishers (enabled, sorted by sortKey) */
  readonly publishers: readonly TPublisher[];

  /** Canonicalized listeners (enabled) */
  readonly listeners: readonly TListener[];

  /** Bus definitions */
  readonly buses: readonly TBus[];

  /** Default sources for unwired inputs */
  readonly defaultSources: readonly DefaultSourceAttachment[];
}

// =============================================================================
// TypedPatch - Output of Pass 2
// =============================================================================

/**
 * TypedPatch - output of Pass 2.
 *
 * All slots and buses have TypeDesc assigned.
 * Conversion paths precomputed for type mismatches.
 */
export interface TypedPatch<
  TBlock = unknown,
  TConnection = unknown,
  TPublisher = unknown,
  TListener = unknown,
  TBus = unknown,
> extends NormalizedPatch<TBlock, TConnection, TPublisher, TListener, TBus> {
  /** Type descriptor for each bus */
  readonly busTypes: Map<string, TypeDesc>;

  /** Conversion paths for wires that need type adaptation */
  readonly conversionPaths: Map<TConnection, readonly string[]>;
}

// =============================================================================
// TimeResolvedPatch - Output of Pass 3
// =============================================================================

/**
 * Canonical time signals created by Pass 3.
 */
export interface TimeSignals {
  /** Absolute time in milliseconds (monotonic) */
  readonly tAbsMs: SigExprId;

  /** Model time in milliseconds (after time model transformation) */
  readonly tModelMs: SigExprId;

  /** Phase 0..1 (cyclic models only) */
  readonly phase01?: SigExprId;

  /** Wrap event trigger (cyclic models only) */
  readonly wrapEvent?: SigExprId;
}

/**
 * TimeResolvedPatch - output of Pass 3.
 *
 * Time topology established, TimeModel created.
 */
export interface TimeResolvedPatch<
  TBlock = unknown,
  TConnection = unknown,
  TPublisher = unknown,
  TListener = unknown,
  TBus = unknown,
> extends TypedPatch<TBlock, TConnection, TPublisher, TListener, TBus> {
  /** The authoritative time model for this patch */
  readonly timeModel: TimeModelIR;

  /** Index of the TimeRoot block */
  readonly timeRootIndex: BlockIndex;

  /** Canonical time signals */
  readonly timeSignals: TimeSignals;
}

// =============================================================================
// Dependency Graph - Pass 4
// =============================================================================

/**
 * Node in the dependency graph.
 */
export type DepNode =
  | { readonly kind: "BlockEval"; readonly blockIndex: BlockIndex }
  | { readonly kind: "BusValue"; readonly busIndex: BusIndex };

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
 * Type guard for BusValue nodes.
 */
export function isBusValue(node: DepNode): node is { kind: "BusValue"; busIndex: BusIndex } {
  return node.kind === "BusValue";
}
