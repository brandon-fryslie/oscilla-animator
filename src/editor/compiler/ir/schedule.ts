/**
 * Schedule IR - Explicit Execution Steps
 *
 * This module defines the schedule and step types that drive the IR runtime.
 * The schedule is an explicit, ordered list of steps that must be executed
 * deterministically.
 *
 * References:
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §12-15
 */

import type { StepId, NodeIndex, BusIndex, ValueSlot, StateId } from "./types";
import type { ColorBufferDesc, PathCommandStreamDesc, FlattenPolicy } from "../../ir/types/BufferDesc";

// ============================================================================
// Time Model IR (02-IR-Schema.md §4)
// ============================================================================

/**
 * Time Model - Authoritative Time Topology
 *
 * The time model defines how absolute time (tAbsMs) is mapped to model time
 * and what derived time signals are available.
 *
 * No "player looping" hacks - the time model is the single source of truth.
 */
export type TimeModelIR =
  | TimeModelFinite
  | TimeModelCyclic
  | TimeModelInfinite;

/** Finite time model with fixed duration */
export interface TimeModelFinite {
  kind: "finite";
  /** Duration in milliseconds */
  durationMs: number;
  /** Optional cue points for scrubbing/snapping */
  cuePoints?: CuePointIR[];
}

/** Cyclic time model with repeating period */
export interface TimeModelCyclic {
  kind: "cyclic";
  /** Period in milliseconds */
  periodMs: number;
  /** Loop mode: standard loop or ping-pong */
  mode: "loop" | "pingpong";
  /** Phase domain (always 0..1 for Oscilla) */
  phaseDomain: "0..1";
}

/** Infinite time model with windowing hints */
export interface TimeModelInfinite {
  kind: "infinite";
  /** Window size for exports/sampling */
  windowMs: number;
  /** Suggested window for UI timeline */
  suggestedUIWindowMs?: number;
}

/** Cue point for timeline navigation */
export interface CuePointIR {
  id: string;
  label: string;
  /** Time in milliseconds */
  tMs: number;
  /** Behavior when seeking to this cue point */
  behavior?: "snap" | "event";
}

// ============================================================================
// Schedule IR (10-Schedule-Semantics.md §12.1)
// ============================================================================

/**
 * Schedule - Ordered Execution Plan
 *
 * The schedule contains all steps that must be executed per frame,
 * in deterministic order.
 */
export interface ScheduleIR {
  /** Ordered array of execution steps */
  steps: StepIR[];

  /** Mapping from StepId to index in steps array */
  stepIdToIndex: Record<StepId, number>;

  /** Dependency information for hot-swap and invalidation */
  deps: DependencyIndexIR;

  /** Determinism contract enforcement */
  determinism: DeterminismIR;

  /** Caching policies per step */
  caching: CachingIR;
}

// ============================================================================
// Step IR - Discriminated Union (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * StepIR - Execution Step Discriminated Union
 *
 * Each step kind represents a specific operation that must be executed
 * as part of the frame evaluation.
 */
export type StepIR =
  | StepTimeDerive
  | StepNodeEval
  | StepBusEval
  | StepMaterialize
  | StepMaterializeColor
  | StepMaterializePath
  | StepRenderAssemble
  | StepDebugProbe;

/** Base properties shared by all step types */
export interface StepBase {
  /** Stable identifier for this step */
  id: StepId;

  /** Discriminator for step kind */
  kind: string;

  /** Optional debug label for UI/logs */
  label?: string;
}

// ============================================================================
// Step 1: Time Derivation (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * Time Derive Step
 *
 * Computes derived time signals from absolute time and the time model.
 * This is always the first step in every frame.
 *
 * Semantics:
 * - Runtime sets tAbsMsSlot each frame
 * - Step computes derived time signals (tModelMs, phase01, wrapEvent, progress01)
 * - No other step may write these slots
 */
export interface StepTimeDerive extends StepBase {
  kind: "timeDerive";

  // Inputs
  /** Slot containing absolute time in milliseconds (provided by runtime driver) */
  tAbsMsSlot: ValueSlot;

  /** Time model used to derive time signals */
  timeModel: TimeModelIR;

  // Outputs
  /** Derived time signal slots */
  out: {
    /** Model time in milliseconds (clamped/wrapped based on time model) */
    tModelMs: ValueSlot;

    /** Phase 0..1 (cyclic models only) */
    phase01?: ValueSlot;

    /** Wrap event trigger (cyclic models only) */
    wrapEvent?: ValueSlot;

    /** Progress 0..1 (finite models only) */
    progress01?: ValueSlot;
  };
}

// ============================================================================
// Step 2: Node Evaluation (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * Node Eval Step
 *
 * Evaluates a single node (block) by reading inputs and writing outputs.
 *
 * Semantics:
 * - Reads from inputSlots (already resolved by compiler)
 * - Executes node opcode/logic
 * - Writes to outputSlots
 * - Nodes never directly read other nodes by id - only by slots
 */
export interface StepNodeEval extends StepBase {
  kind: "nodeEval";

  /** Index of the node being evaluated */
  nodeIndex: NodeIndex;

  // Slot references (resolved at compile time)
  /** Input value slots (includes bus slots, wire slots, defaults) */
  inputSlots: ValueSlot[];

  /** Output value slots to write */
  outputSlots: ValueSlot[];

  // State access (optional)
  /** State cells read by this node */
  stateReads?: StateId[];

  /** State cells written by this node */
  stateWrites?: StateId[];

  /** Scheduling phase relative to bus evaluation */
  phase: "preBus" | "postBus" | "render";
}

// ============================================================================
// Step 3: Bus Evaluation (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * Bus Eval Step
 *
 * Combines all publisher values for a bus into a single bus value.
 *
 * Semantics:
 * - Publishers are processed in deterministic order (sortKey ascending, then publisherId)
 * - For each enabled publisher: read srcSlot, apply transform, produce term
 * - Combine terms based on bus type (signal/field) and combine spec
 * - If zero enabled publishers: write silent value
 * - Write result to outSlot
 */
export interface StepBusEval extends StepBase {
  kind: "busEval";

  /** Index of the bus being evaluated */
  busIndex: BusIndex;

  /** Output slot for the combined bus value */
  outSlot: ValueSlot;

  /** Publishers in deterministic order */
  publishers: PublisherIR[];

  /** Combine specification */
  combine: CombineSpec;

  /** Silent value specification (used when no publishers) */
  silent: SilentValueSpec;

  /** Bus type (determines evaluation mode: signal vs field) */
  busType: import("./types").TypeDesc;
}

/** Publisher specification */
export interface PublisherIR {
  /** Whether this publisher is enabled */
  enabled: boolean;

  /** Deterministic sort key (primary ordering) */
  sortKey: number;

  /** Source value slot */
  srcSlot: ValueSlot;

  /** Optional transform chain reference */
  transform?: TransformChainRef;

  /** Stable publisher identifier (for tie-breaking) */
  publisherId: string;
}

/** Transform chain reference (placeholder for Phase 3-5) */
export interface TransformChainRef {
  chainId: number;
}

/** Combine specification for bus aggregation */
export interface CombineSpec {
  /** Combine mode */
  mode: "last" | "sum" | "average" | "max" | "min" | "product";
}

/** Silent value specification */
export interface SilentValueSpec {
  /** Kind of silent value */
  kind: "zero" | "default" | "const";

  /** Optional constant ID (for kind: "const") */
  constId?: number;
}

// ============================================================================
// Step 4: Materialization (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * Materialize Step
 *
 * Evaluates a FieldExpr for a specific domain, producing a buffer.
 *
 * Semantics:
 * - Evaluates FieldExpr DAG
 * - Produces a buffer handle
 * - Must respect cache policy
 */
export interface StepMaterialize extends StepBase {
  kind: "materialize";

  /** Materialization specification */
  materialization: MaterializationIR;
}

/** Materialization specification (placeholder for Phase 5) */
export interface MaterializationIR {
  /** Unique materialization identifier */
  id: string;

  /** Field expression ID to materialize */
  fieldExprId: string;

  /** Domain reference */
  domainSlot: ValueSlot;

  /** Output buffer slot */
  outBufferSlot: ValueSlot;

  /** Buffer format */
  format: BufferFormat;

  /** Cache policy */
  policy: "perFrame" | "onDemand";
}

/** Buffer format specification */
export interface BufferFormat {
  /** Component count (e.g., 1 for scalar, 2 for vec2, 3 for vec3) */
  components: number;

  /** Element type */
  elementType: "f32" | "f64" | "i32" | "u32" | "u8";
}

// ============================================================================
// Step 4a: Materialize Color (Phase C - Renderer IR)
// ============================================================================

/**
 * MaterializeColor Step
 *
 * Converts field<color> or signal<color> to u8x4 premultiplied linear RGBA buffer.
 *
 * This is an explicit, cacheable materialization step that produces deterministic
 * color buffers for renderer consumption.
 *
 * Semantics:
 * - For signal<color>: quantize single value to 4 bytes
 * - For field<color>: quantize instanceCount values to instanceCount*4 bytes
 * - Uses quantizeColorRGBA() kernel from Phase B
 * - Writes Uint8Array to bufferSlot in ValueStore
 * - Emits performance counters for cache attribution
 *
 * References:
 * - design-docs/13-Renderer/09-Materialization-Steps.md (MaterializeColor contract)
 * - design-docs/13-Renderer/04-Decision-to-IR.md (ColorBufferDesc)
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.C2
 */
export interface StepMaterializeColor extends StepBase {
  kind: "materializeColor";

  // Inputs
  /** Source slot containing field<color> or signal<color> */
  sourceSlot: ValueSlot;

  /** Number of instances to materialize (undefined for signal<color>) */
  instanceCount?: number;

  // Outputs
  /** Output slot for u8x4 buffer (Uint8Array) */
  bufferSlot: ValueSlot;

  /** Buffer descriptor (always canonical u8x4 premul linear RGBA) */
  bufferDesc: ColorBufferDesc;

  // Cache policy (optional - Phase E work)
  /** Cache key specification for buffer reuse */
  cacheKey?: CacheKeySpec;

  // Debug/instrumentation
  /** Debug label for performance attribution */
  debugLabel?: string;
}

// ============================================================================
// Step 4b: Materialize Path (Phase D - Renderer IR)
// ============================================================================

/**
 * MaterializePath Step
 *
 * Converts path expressions to PathCommandStream buffers with optional flattening.
 *
 * This is an explicit, cacheable materialization step that encodes path geometry
 * to typed buffers for renderer consumption.
 *
 * Semantics:
 * - Evaluates path expression
 * - Encodes commands to Uint16Array (0=M, 1=L, 2=Q, 3=C, 4=Z)
 * - Packs points to Float32Array (interleaved xy pairs)
 * - Optional flattening: curves → polylines with canonical tolerance
 * - Writes commandsSlot and pointsSlot to ValueStore
 * - Emits performance counters for cache attribution
 *
 * References:
 * - design-docs/13-Renderer/09-Materialization-Steps.md (MaterializePath contract)
 * - design-docs/13-Renderer/04-Decision-to-IR.md (PathCommandStreamDesc, FlattenPolicy)
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.D2
 */
export interface StepMaterializePath extends StepBase {
  kind: "materializePath";

  // Inputs
  /** Source slot containing path expression */
  sourceSlot: ValueSlot;

  /** Flattening policy (off or on-canonical) */
  flattenPolicy: FlattenPolicy;

  // Outputs
  /** Output slot for command buffer (Uint16Array) */
  commandsSlot: ValueSlot;

  /** Output slot for points buffer (Float32Array) */
  pointsSlot: ValueSlot;

  /** Command descriptor (always canonical u16 LE) */
  commandDesc: PathCommandStreamDesc;

  // Cache policy (optional - Phase E work)
  /** Cache key specification for buffer reuse */
  cacheKey?: CacheKeySpec;

  // Debug/instrumentation
  /** Debug label for performance attribution */
  debugLabel?: string;
}

// ============================================================================
// Step 5: Render Assembly (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * Render Assemble Step
 *
 * Assembles final render output from render node outputs.
 *
 * Semantics:
 * - Typically trivial: render node already wrote RenderTree to its output slot
 * - This step exists for stable finalization boundary (hot-swap + tracing)
 */
export interface StepRenderAssemble extends StepBase {
  kind: "renderAssemble";

  /** Root render node index */
  rootNodeIndex: NodeIndex;

  /** Output slot for final render output */
  outSlot: ValueSlot;
}

// ============================================================================
// Step 6: Debug Probe (10-Schedule-Semantics.md §12.2)
// ============================================================================

/**
 * Debug Probe Step
 *
 * Inserted for debugging/tracing. Can be enabled/disabled without recompiling.
 *
 * Semantics:
 * - Reads values for inspection
 * - Logs to trace buffer
 * - No-op when debugging disabled
 */
export interface StepDebugProbe extends StepBase {
  kind: "debugProbe";

  /** Debug probe specification */
  probe: DebugProbeIR;
}

/** Debug probe specification (placeholder for Phase 7) */
export interface DebugProbeIR {
  /** Probe identifier */
  id: string;

  /** Slots to probe */
  slots: ValueSlot[];

  /** Probe mode */
  mode: "value" | "trace" | "breakpoint";
}

// ============================================================================
// Dependency Index (10-Schedule-Semantics.md §13)
// ============================================================================

/**
 * Dependency Index
 *
 * Tracks dependencies between steps and slots for:
 * - Hot-swap analysis
 * - Cache invalidation
 * - Debugger causal links
 */
export interface DependencyIndexIR {
  /** Maps slot to the step that produces it */
  slotProducerStep: Record<ValueSlot, StepId>;

  /** Maps slot to steps that consume it */
  slotConsumers: Record<ValueSlot, StepId[]>;

  /** Bus dependencies on source slots */
  busDependsOnSlots: Record<BusIndex, ValueSlot[]>;

  /** Bus provides slot mapping */
  busProvidesSlot: Record<BusIndex, ValueSlot>;

  /** Field expression dependencies (optional, can be derived) */
  exprDependsOnExpr?: Record<string, string[]>;

  /** Field expression slot dependencies (optional) */
  exprDependsOnSlots?: Record<string, ValueSlot[]>;
}

// ============================================================================
// Determinism Contract (10-Schedule-Semantics.md §14)
// ============================================================================

/**
 * Determinism Contract
 *
 * Specifies what inputs are allowed to affect ordering and results.
 * Ensures same inputs produce same outputs.
 */
export interface DeterminismIR {
  /** Allowed inputs that can affect ordering */
  allowedOrderingInputs: Array<
    | { kind: "busPublisherSortKey" }
    | { kind: "publisherIdTieBreak" }
    | { kind: "topoStableNodeIdTieBreak" }
  >;

  /** Stable tie-breaker for topological sorts */
  topoTieBreak: "nodeIdLex" | "nodeIndex";
}

// ============================================================================
// Caching Policy (09-Caching.md §15)
// ============================================================================

/**
 * Caching Policy IR
 *
 * Per-step and per-materialization caching hints.
 */
export interface CachingIR {
  /** Per-step caching hints */
  stepCache: Record<StepId, CacheKeySpec>;

  /** Field materialization caching */
  materializationCache: Record<string, CacheKeySpec>;
}

/**
 * Cache Key Specification
 *
 * Determines when cached values can be reused.
 */
export type CacheKeySpec =
  | { kind: "none" } // Never cache
  | { kind: "perFrame" } // Recompute each frame, allow in-frame reuse
  | { kind: "untilInvalidated"; deps: CacheDep[] }; // Cache until dependencies change

/**
 * Cache Dependency
 *
 * Specifies what changes invalidate a cache entry.
 */
export type CacheDep =
  | { kind: "slot"; slot: ValueSlot }
  | { kind: "bus"; busIndex: BusIndex }
  | { kind: "timeModel" }
  | { kind: "seed" }
  | { kind: "stateCell"; stateId: StateId }
  | { kind: "external"; id: string };
