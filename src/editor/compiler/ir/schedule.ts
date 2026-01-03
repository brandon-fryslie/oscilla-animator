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

import type { StepId, NodeIndex, ValueSlot, StateId, SigExprId } from "./types";

// Import 3D step types
import type { StepCameraEval } from "../../runtime/executor/steps/executeCameraEval";
import type { StepMeshMaterialize } from "../../runtime/executor/steps/executeMeshMaterialize";
import type { StepInstances3DProjectTo2D } from "../../runtime/executor/steps/executeInstances3DProject";

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

  /**
   * Initial slot values to populate at runtime initialization.
   * Used for batch descriptor lists and other compile-time-known objects.
   * The runtime should write these values to the ValueStore before first frame.
   */
  initialSlotValues?: Record<ValueSlot, unknown>;
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
  | StepSignalEval
  | StepNodeEval
  | StepMaterialize
  | StepMaterializeColor
  | StepMaterializePath
  | StepMaterializeTestGeometry
  | StepRenderAssemble
  | StepDebugProbe
  // 3D steps
  | StepCameraEval
  | StepMeshMaterialize
  | StepInstances3DProjectTo2D;

/** Base properties shared by all step types */
export interface StepBase {
  /** Stable identifier for this step */
  id: StepId;

  /** Discriminator for step kind */
  kind: string;

  /** Steps that must run before this one */
  deps: StepId[];

  /** Optional cache key specification for buffer reuse */
  cacheKey?: CacheKeySpec;

  /** Optional debug label for UI/logs */
  label?: string;
}

// ============================================================================
// Step 1b: Signal Eval
// ============================================================================

/**
 * SignalEval Step
 *
 * Evaluates signal expressions and writes their outputs to slots.
 */
export interface StepSignalEval extends StepBase {
  kind: "signalEval";

  /** Signal outputs to evaluate this frame */
  outputs: Array<{ sigId: SigExprId; slot: ValueSlot }>;
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
// Step 4a: Materialize Color (Phase E - Final Integration)
// ============================================================================

/**
 * MaterializeColor Step
 *
 * Converts field<color> or signal<color> to 4 separate Float32Array channel buffers.
 *
 * This is an explicit, cacheable materialization step that produces deterministic
 * color buffers for renderer consumption.
 *
 * Semantics:
 * - Reads domain handle from domainSlot to get instance count
 * - Reads field expression handle from colorExprSlot
 * - Evaluates color field expression for all instances
 * - Writes 4 separate Float32Array buffers (R, G, B, A channels in [0..1] range)
 * - Emits performance counters for cache attribution
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §A1
 * - design-docs/13-Renderer/09-Materialization-Steps.md
 */
export interface StepMaterializeColor extends StepBase {
  kind: "materializeColor";

  // Inputs
  /** Slot containing Domain handle (or count) */
  domainSlot: ValueSlot;

  /** Slot containing field expression handle for color */
  colorExprSlot: ValueSlot;

  // Outputs (4 separate Float32Array buffers, one per channel)
  /** Output slot for R channel (Float32Array) */
  outRSlot: ValueSlot;

  /** Output slot for G channel (Float32Array) */
  outGSlot: ValueSlot;

  /** Output slot for B channel (Float32Array) */
  outBSlot: ValueSlot;

  /** Output slot for A channel (Float32Array) */
  outASlot: ValueSlot;

  // Optional format specifier (future-proof)
  /** Buffer format: always "rgba_f32" for now */
  format?: "rgba_f32";
}

// ============================================================================
// Step 4b: Materialize Path (Phase E - Final Integration)
// ============================================================================

/**
 * MaterializePath Step
 *
 * Converts path expressions to command/param buffers with optional flattening.
 *
 * This is an explicit, cacheable materialization step that encodes path geometry
 * to typed buffers for renderer consumption.
 *
 * Semantics:
 * - Reads domain handle from domainSlot to get instance count
 * - Reads path field expression handle from pathExprSlot
 * - Evaluates path expression for all instances
 * - Encodes commands to Uint16Array (0=M, 1=L, 2=Q, 3=C, 4=Z)
 * - Packs params to Float32Array (coordinates, control points)
 * - Optional flattening: curves → polylines with tolerance
 * - Writes outCmdsSlot and outParamsSlot to ValueStore
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §A1
 * - design-docs/13-Renderer/09-Materialization-Steps.md
 */
export interface StepMaterializePath extends StepBase {
  kind: "materializePath";

  // Inputs
  /** Slot containing Domain handle */
  domainSlot: ValueSlot;

  /** Slot containing path field expression handle */
  pathExprSlot: ValueSlot;

  // Outputs
  /** Output slot for command buffer (Uint16Array) */
  outCmdsSlot: ValueSlot;

  /** Output slot for params buffer (Float32Array) */
  outParamsSlot: ValueSlot;

  /** Output slot for per-path command start indices (Uint32Array) */
  outCmdStartSlot: ValueSlot;

  /** Output slot for per-path command lengths (Uint32Array) */
  outCmdLenSlot: ValueSlot;

  /** Output slot for per-path point start indices (Uint32Array) */
  outPointStartSlot: ValueSlot;

  /** Output slot for per-path point lengths (Uint32Array) */
  outPointLenSlot: ValueSlot;

  // Optional flatten tolerance (default from canonical 0.75px)
  /** Flatten tolerance in pixels (undefined = keep curves) */
  flattenTolerancePx?: number;
}

// ============================================================================
// Step 4c: Materialize Test Geometry (Temporary - Phase E)
// ============================================================================

/**
 * MaterializeTestGeometry Step
 *
 * TEMPORARY step that creates test geometry data (positions and radius) for circles.
 * This is a placeholder until we implement full field materialization for vec2 and number types.
 *
 * Semantics:
 * - Reads domain handle from domainSlot to get instance count
 * - Creates test position data (x, y) in a grid pattern
 * - Creates test radius data (fixed radius for all instances)
 * - Writes 3 Float32Array buffers (x, y, radius)
 *
 * This step will be replaced with proper StepMaterializeVec2 and StepMaterializeNumber
 * steps in a future iteration.
 */
export interface StepMaterializeTestGeometry extends StepBase {
  kind: "materializeTestGeometry";

  // Inputs
  /** Slot containing Domain handle (or count) */
  domainSlot: ValueSlot;

  // Outputs
  /** Output slot for X positions (Float32Array) */
  outXSlot: ValueSlot;

  /** Output slot for Y positions (Float32Array) */
  outYSlot: ValueSlot;

  /** Output slot for radius values (Float32Array) */
  outRadiusSlot: ValueSlot;
}

// ============================================================================
// Step 5: Render Assembly (Phase E - Final Integration)
// ============================================================================

/**
 * Render Assemble Step
 *
 * Assembles final RenderFrameIR from materialized buffers and batch descriptors.
 *
 * This step reads batch descriptor lists and produces the final RenderFrameIR
 * that the Canvas2D renderer consumes.
 *
 * Semantics:
 * - Reads Instance2DBatchList from instance2dListSlot
 * - Reads PathBatchList from pathBatchListSlot
 * - Assembles RenderFrameIR with passes array
 * - Writes RenderFrameIR to outFrameSlot
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §C2
 */
export interface StepRenderAssemble extends StepBase {
  kind: "renderAssemble";

  // Compile-time batch configuration (per 12-ValueSlotPerNodeOutput.md)
  // These are embedded in the step, not read from slots
  /** Instance2D batches (compile-time configuration) */
  instance2dBatches?: Instance2DBatch[];

  /** Path batches (compile-time configuration) */
  pathBatches?: PathBatch[];

  // Legacy slot-based inputs (for backward compatibility)
  /** @deprecated Use instance2dBatches instead */
  instance2dListSlot?: ValueSlot;

  /** @deprecated Use pathBatchListSlot instead */
  pathBatchListSlot?: ValueSlot;

  // Output
  /** Output slot for final RenderFrameIR */
  outFrameSlot: ValueSlot;
}

/**
 * Instance2D batch descriptor.
 * Compile-time configuration for one batch of 2D circle instances.
 */
export interface Instance2DBatch {
  kind: "instance2d";
  /** Number of elements (may be 0 if domain count is runtime-determined) */
  count: number;
  /** Slot containing domain handle */
  domainSlot: ValueSlot;
  /** Slot containing interleaved xy buffer */
  posXYSlot: ValueSlot;
  /** Slot containing size/radius buffer or scalar */
  sizeSlot: ValueSlot;
  /** Slot containing packed color RGBA buffer or scalar */
  colorRGBASlot: ValueSlot;
  /** Slot containing opacity scalar or buffer */
  opacitySlot: ValueSlot;
  /** Static z-order value (default: 0) */
  zOrder?: number;
  /** Runtime z-order from signal (takes precedence over static zOrder) */
  zOrderSlot?: ValueSlot;
}

/**
 * Path batch descriptor.
 * Compile-time configuration for one batch of path primitives.
 */
export interface PathBatch {
  kind: "path";
  /** Number of paths in the batch (0 if runtime-determined) */
  count: number;
  /** Slot containing domain handle */
  domainSlot: ValueSlot;
  /** Slot containing path commands buffer */
  cmdsSlot: ValueSlot;
  /** Slot containing path parameters buffer (points XY) */
  paramsSlot: ValueSlot;
  /** Slot containing per-path command start indices */
  cmdStartSlot: ValueSlot;
  /** Slot containing per-path command lengths */
  cmdLenSlot: ValueSlot;
  /** Slot containing per-path point start indices */
  pointStartSlot: ValueSlot;
  /** Slot containing per-path point lengths */
  pointLenSlot: ValueSlot;

  /** Optional fill color (scalar or buffer slot) */
  fillColorSlot?: ValueSlot;
  /** Optional stroke color (scalar or buffer slot) */
  strokeColorSlot?: ValueSlot;
  /** Optional stroke width (scalar or buffer slot) */
  strokeWidthSlot?: ValueSlot;
  /** Optional opacity (scalar or buffer slot) */
  opacitySlot?: ValueSlot;

  /** Draw mode control */
  draw: { stroke: boolean; fill: boolean };

  /** Optional style settings */
  fillRule?: "nonzero" | "evenodd";
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  miterLimit?: number;
  dash?: { pattern: number[]; offset?: number } | null;

  /** Static z-order value (default: 0) */
  zOrder?: number;
  /** Runtime z-order from signal (takes precedence over static zOrder) */
  zOrderSlot?: ValueSlot;
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
  | { kind: "timeModel" }
  | { kind: "seed" }
  | { kind: "stateCell"; stateId: StateId }
  | { kind: "external"; id: string };
