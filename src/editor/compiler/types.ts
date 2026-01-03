/**
 * Compiler Types (V4-aligned)
 *
 * Core types for the patch → program compiler.
 * Based on the typed "Option A" architecture:
 * - Patch graph is made of blocks with typed ports
 * - Compilation is a topo-ordered reduction producing typed Artifacts per output port
 * - Final Artifact must be a RenderTreeProgram
 * - Phase 2: Buses as first-class graph nodes
 */

// =============================================================================
// Kernel Primitives
// =============================================================================

export type Seed = int;

export interface Env {}

export interface GeometryCache {
  get<K extends object, V>(key: K, compute: () => V): V;
  invalidate(scope?: unknown): void;
}

export interface CompileCtx {
  env: Env;
  geom: GeometryCache;
}

export interface RuntimeCtx {
  viewport: { w: number; h: number; dpr: number };
  reducedMotion?: boolean;
  /** Frame counter for debug span attribution */
  frameId?: number;
  /** Animation time for span recording (mirrors signal param) */
  tMs?: number;
}

export type KernelEvent = { type: string; payload?: unknown };

/**
 * A CuePoint marks a significant moment in the animation.
 * Used for phase boundaries, beats, and other structural markers.
 */
export interface CuePoint {
  tMs: number;
  label: string;
  kind?: 'phase' | 'beat' | 'marker';
}


// =============================================================================
// TimeModel: Authoritative Time Topology
// =============================================================================

/**
 * TimeModel defines the temporal topology of a patch.
 * This is the authoritative source of time information - the UI and player
 * are driven by TimeModel, not by heuristics or player-side looping.
 *
 * Three variants:
 * - FiniteTimeModel: Bounded duration with explicit start/end
 * - CyclicTimeModel: Looping with a defined period
 * - InfiniteTimeModel: Unbounded time with no inherent structure
 *
 * Reference: feature_planning_docs/TimeRoot/0-PlayerTimeDesign.md
 */
export type TimeModel =
  | FiniteTimeModel
  | CyclicTimeModel
  | InfiniteTimeModel;

/**
 * Finite time model: bounded performance with known duration.
 * Example: a logo entrance animation that plays once and stops.
 */
export interface FiniteTimeModel {
  kind: 'finite';
  /** Total duration in milliseconds */
  durationMs: number;
  /** Optional cue points for UI markers */
  cuePoints?: readonly CuePoint[];
}

/**
 * Cyclic time model: looping animation with a defined period.
 * Example: an ambient background that loops every 4 seconds.
 */
export interface CyclicTimeModel {
  kind: 'cyclic';
  /** Period of one cycle in milliseconds */
  periodMs: number;
  /** Phase domain is always 0..1 (normalized) */
  phaseDomain: '0..1';
  /** Mode: loop (0→1→0→1) or pingpong (0→1→0→1) */
  mode?: 'loop' | 'pingpong';
}

/**
 * Infinite time model: unbounded time with no inherent structure.
 * Example: a generative art piece that evolves indefinitely.
 */
export interface InfiniteTimeModel {
  kind: 'infinite';
  /** Suggested window size for preview in milliseconds */
  windowMs: number;
}

// =============================================================================
// Phase 4: SignalExpr IR Integration (Sprint 8)
// =============================================================================

import type { SignalExprTable } from './ir/signalExpr';
import type { StateLayoutEntry } from './ir/builderTypes';

/**
 * CompiledProgram is the output of successful compilation.
 * Contains both the runnable program and its time topology.
 *
 * This replaces the raw Program<RenderTree> return type, making
 * TimeModel a first-class artifact of compilation.
 *
 * Either `program` (SVG/RenderTree) or `canvasProgram` will be set,
 * depending on which render sink the patch uses.
 *
 * Phase 4 additions:
 * - signalTable: SignalExpr IR for blocks migrated to V2
 * - constPool: Shared constant pool for IR evaluation
 * - stateLayout: State allocation for stateful operations
 */
export interface CompiledProgram {
  /** The runnable animation program (SVG path) */
  program?: Program<RenderTree>;
  /** The runnable canvas program (Canvas path) */
  canvasProgram?: CanvasProgram;
  /** The time topology of the patch */
  timeModel: TimeModel;

  // NEW: IR additions (Phase 4, Sprint 8)
  /** SignalExpr IR table (when V2 blocks present) */
  signalTable?: SignalExprTable;
  /** Constant pool for IR evaluation */
  constPool?: unknown[];
  /** State layout for stateful operations */
  stateLayout?: StateLayoutEntry[];
}

// Canvas program returns a RenderTree for the Canvas2DRenderer to execute
export interface CanvasProgram {
  signal: (tMs: number, rt: RuntimeCtx) => import('../runtime/renderCmd').RenderTree;
  event: (ev: KernelEvent) => KernelEvent[];
}

/**
 * Program is time-dependent: returns signal + event handlers.
 */
export interface Program<T> {
  signal: (tMs: number, rt: RuntimeCtx) => T;
  event: (ev: KernelEvent) => KernelEvent[];
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  min: Vec2;
  max: Vec2;
}

export type NodeId = string;

export type DrawNode =
  | { kind: 'group'; id: NodeId; children: readonly DrawNode[]; tags?: readonly string[]; meta?: Record<string, unknown> }
  | { kind: 'shape'; id: NodeId; geom: unknown; style?: unknown; tags?: readonly string[]; meta?: Record<string, unknown> }
  | { kind: 'effect'; id: NodeId; effect: unknown; child: DrawNode; tags?: readonly string[]; meta?: Record<string, unknown> };

export type RenderTree = DrawNode;

// =============================================================================
// Bulk Field Type (compile-time)
// =============================================================================

/**
 * Field is always the bulk form: evaluated once at compile time.
 * If a block wants scalar-by-index ergonomics, it wraps internally.
 */
export type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[];

// =============================================================================
// Port Typing: What Flows Through Wires
// =============================================================================

/**
 * ValueKind is the core compatibility axis.
 * Keep it explicit. Avoid structural typing for ports.
 */
export type ValueKind =
  // Scalars (single values)
  | 'Scalar:float'
  | 'Scalar:int'
  | 'Scalar:string'
  | 'Scalar:boolean'
  | 'Scalar:color'
  | 'Scalar:vec2'
  | 'Scalar:bounds'

  // Fields (per-element arrays)
  | 'Field:float'
  | 'Field:int'
  | 'Field:string'
  | 'Field:boolean'
  | 'Field:color'
  | 'Field:vec2'
  | 'Field:Point'
  | 'Field<Point>'
  | 'Field:Jitter'
  | 'Field:Spiral'
  | 'Field:Wave'
  | 'Field:Wobble'
  | 'Field:Path'

  // Signals
  | 'Signal:Time'
  | 'Signal:float'
  | 'Signal:int'
  | 'Signal:Unit'
  | 'Signal:vec2'
  | 'Signal:phase'
  | 'Signal:phase01'
  | 'Signal:color'

  // Special types
  | 'Domain'          // Per-element identity (Phase 3)
  | 'PhaseMachine'
  | 'TargetScene'
  | 'Scene'
  | 'Render'          // User-facing unified render output type
  | 'RenderTreeProgram' // Internal: Program<RenderTree>
  | 'RenderTree'      // Internal: render function
  | 'RenderNode'
  | 'RenderNodeArray'
  | 'FilterDef'
  | 'StrokeStyle'

  // Specs (structured config that compiles to Programs)
  | 'Spec:LineMorph'
  | 'Spec:Particles'
  | 'Spec:RevealMask'
  | 'Spec:Transform3DCompositor'
  | 'Spec:DeformCompositor'
  | 'Spec:ProgramStack'

  // Additional artifact kinds (can be produced by compilers)
  | 'ElementCount'  // Number of elements from scene
  | 'FieldExpr'    // Lazy field expression (Phase 2)
  | 'Event'       // TimeRoot wrap/end events

  // Canvas 2D render output
  | 'CanvasRender'; // Canvas 2D render function (returns renderCmd.RenderTree)

/**
 * PortType can be extended with refinements (units, constraints, etc.)
 */
export interface PortType {
  kind: ValueKind;
  meta?: Record<string, unknown>;
}

export interface PortDef {
  name: string;
  type: PortType;
  required?: boolean;
}

// =============================================================================
// PhaseMachine + TargetScene
// =============================================================================

export interface PhaseSample {
  phase: string;
  u: float;
  uRaw: float;
  tLocal: float;
}

export interface PhaseMachine {
  sample(tMs: number): PhaseSample;
}

export interface TargetScene {
  id: string;
  targets: readonly Vec2[];
  groups?: readonly int[];
  bounds?: Bounds;
  meta?: Record<string, unknown>;
}

// =============================================================================
// Patch Graph Data Model
// =============================================================================

import type { BlockType, BlockId, BlockCategory, Bus } from '../types';
export type { BlockType, BlockId, BlockCategory };

export interface BlockInstance {
  id: BlockId;
  type: string; // registry key
  params: Record<string, unknown>;
  position?: number;
}

/**
 * Forward declaration of bus types (imported from main types)
 * These will be available when buses are present in a patch.
 */
// Import types from main editor types for use in CompilerPatch
import type { LensInstance, AdapterStep } from '../types';
// Re-export for consumers
export type { Bus, LensInstance, AdapterStep };

// Import Domain from unified compiler
import type { Domain } from './unified/Domain';
// Re-export Domain for consumers
export type { Domain };

/**
 * Discriminated union of artifacts.
 * Each kind has a precise value type - not `unknown`.
 */
export type Artifact =
  | { kind: 'Scalar:float'; value: float }
  | { kind: 'Scalar:int'; value: int }
  | { kind: 'Scalar:string'; value: string }
  | { kind: 'Scalar:boolean'; value: boolean }
  | { kind: 'Scalar:color'; value: unknown }
  | { kind: 'Scalar:vec2'; value: Vec2 }
  | { kind: 'Scalar:bounds'; value: Bounds }

  | { kind: 'Field:float'; value: Field<float> }
  | { kind: 'Field:int'; value: Field<int> }
  | { kind: 'Field:string'; value: Field<string> }
  | { kind: 'Field:boolean'; value: Field<boolean> }
  | { kind: 'Field:color'; value: Field<unknown> }
  | { kind: 'Field:vec2'; value: Field<Vec2> }
  | { kind: 'Field:Point'; value: Field<Vec2> }
  | { kind: 'Field<Point>'; value: Field<Vec2> }
  | { kind: 'Field:Jitter'; value: Field<unknown> }
  | { kind: 'Field:Spiral'; value: Field<unknown> }
  | { kind: 'Field:Wave'; value: Field<unknown> }
  | { kind: 'Field:Wobble'; value: Field<unknown> }
  | { kind: 'Field:Path'; value: Field<unknown> }

  | { kind: 'PhaseMachine'; value: PhaseMachine }
  | { kind: 'TargetScene'; value: TargetScene }
  | { kind: 'Scene'; value: unknown }
  | { kind: 'RenderTreeProgram'; value: Program<RenderTree> }
  | { kind: 'StrokeStyle'; value: unknown }

  // Primitive block artifacts (Phase 2)
  | { kind: 'ElementCount'; value: int }
  | { kind: 'Signal:Time'; value: (t: number, ctx: RuntimeCtx) => float }
  | { kind: 'Signal:float'; value: (t: number, ctx: RuntimeCtx) => float }
  | { kind: 'Signal:int'; value: (t: number, ctx: RuntimeCtx) => int }
  | { kind: 'Signal:Unit'; value: (t: number, ctx: RuntimeCtx) => float }
  | { kind: 'Signal:vec2'; value: (t: number, ctx: RuntimeCtx) => Vec2 }
  | { kind: 'Signal:phase'; value: (t: number, ctx: RuntimeCtx) => float }
  | { kind: 'Signal:phase01'; value: (t: number, ctx: RuntimeCtx) => float }
  | { kind: 'Signal:color'; value: (t: number, ctx: RuntimeCtx) => string }
  | { kind: 'RenderNode'; value: DrawNode }
  | { kind: 'RenderNodeArray'; value: readonly DrawNode[] }
  | { kind: 'RenderTree'; value: (tMs: number, ctx: RuntimeCtx) => DrawNode }
  | { kind: 'FilterDef'; value: unknown }

  // Phase 2 spec variants (for encapsulation)
  | { kind: 'Spec:LineMorph'; value: unknown }
  | { kind: 'Spec:Particles'; value: unknown }
  | { kind: 'Spec:RevealMask'; value: unknown }
  | { kind: 'Spec:Transform3DCompositor'; value: unknown }
  | { kind: 'Spec:DeformCompositor'; value: unknown }
  | { kind: 'Spec:ProgramStack'; value: unknown }

  // Phase 3: Domain for per-element identity
  | { kind: 'Domain'; value: Domain }

  // Phase 2: FieldExpr (lazy field expression)
  | { kind: 'FieldExpr'; value: unknown }
  // Phase 3: Event (TimeRoot wrap/end events)
  | { kind: 'Event'; value: unknown }
  // Canvas 2D render artifact
  | { kind: 'CanvasRender'; value: (tMs: number, ctx: RuntimeCtx) => import('../runtime/renderCmd').RenderTree }

  // Phase 2: ExternalAsset (future - IO capability)
  | { kind: 'ExternalAsset'; value: unknown }

  // Error artifact (returned by block compilers on validation failure)
  | { kind: 'Error'; message: string; value?: undefined; where?: { blockId?: string; port?: string } };

export type CompiledOutputs = Record<string, Artifact>;

export interface BlockCompiler {
  type: string;

  /** Declared input ports */
  inputs: readonly PortDef[];

  /** Declared output ports */
  outputs: readonly PortDef[];

  /**
   * Compile a block instance using already-compiled upstream Artifacts.
   * Must be pure. May construct Fields/Specs/Programs that are pure given inputs.
   */
  compile(args: {
    id: BlockId;
    params: Record<string, unknown>;
    inputs: Record<string, Artifact>;
    ctx: CompileCtx;
  }): CompiledOutputs;
}

/**
 * Registry mapping block type names to their compilers.
 */
export type BlockRegistry = Record<string, BlockCompiler>;

/**
 * Auto-publication from TimeRoot blocks.
 * Used to automatically inject system bus publishers.
 */
export interface AutoPublication {
  busName: string;
  artifactKey: string;
  sortKey: number;
}

// =============================================================================
// Compile Errors
// =============================================================================

export type CompileErrorCode =
  | 'EmptyPatch'
  | 'NotImplemented'
  | 'BlockMissing'
  | 'CompilerMissing'
  | 'PortMissing'
  | 'PortTypeMismatch'
  | 'MultipleWriters'
  | 'CycleDetected'
  | 'OutputMissing'
  | 'OutputWrongType'
  | 'UpstreamError'
  // Phase 2 additions
  | 'BusMissing'
  | 'BusTypeError'
  | 'InvalidBusRouting'
  | 'FeedbackLoopError'
  | 'AdapterError'
  | 'BusEvaluationError'
  | 'FieldBusNotSupported'
  | 'UnsupportedCombineMode'
  | 'EventBusNotSupported'
  | 'UnsupportedBusType'
  | 'InvalidDefaultValue'
  | 'UnknownBusWorld'
  // Phase 3: TimeRoot additions
  | 'MissingTimeRoot'
  | 'MultipleTimeRoots'
  | 'ConflictingTimeTopology'
  // Phase 3: IR/Pass additions (Sprint 2)
  | 'BusLoweringFailed'
  | 'DanglingConnection'
  | 'DanglingBindingEndpoint'
  | 'UnresolvedPort'
  // Sprint 2: IR validation
  | 'IRValidationFailed'
  // Sprint 2: Missing required inputs
  | 'MissingInput'
  // Primitives: Pure block validation (Deliverable 3)
  | 'PureBlockViolation'
  // Type system red flag fixes
  | 'UnsupportedAdapterInIRMode'
  | 'UnsupportedLensInIRMode'
  // P1: Pass 8 hardening (type-contracts-ir-plumbing)
  | 'MissingOutputRegistration'
  // Sprint 2 P2: Bus-Block Unification
  | 'UnmigratedBusEdge';

export interface CompileError {
  code: CompileErrorCode;
  message: string;
  where?: { blockId?: string; port?: string; edgeId?: string; busId?: string; blockType?: string; outputType?: unknown };
}

// Import LinkedGraphIR for dual-emit support (Sprint 2, P0-4)
import type { LinkedGraphIR } from './passes/pass8-link-resolution';
// Import CompiledProgramIR for Pass 9 (Codegen)
import type { CompiledProgramIR } from './ir';
// Import DebugIndex for debug infrastructure
import type { DebugIndex } from '../debug';
export type { LinkedGraphIR, CompiledProgramIR };

export interface CompileResult {
  ok: boolean;
  /** SVG render program (RenderTree-based) */
  program?: Program<RenderTree>;
  /** Canvas render program (RenderCmd-based) */
  canvasProgram?: CanvasProgram;
  /** Time model defining temporal topology */
  timeModel?: TimeModel;
  /** Detailed errors (if ok: false) */
  errors: CompileError[];

  // Phase 2 additions for dual-emit support (Sprint 2)
  /** IR representation (NEW) */
  ir?: LinkedGraphIR;
  /** Compiled program IR (from Pass 9: Codegen) */
  programIR?: CompiledProgramIR;
  /** Debug index mapping IR nodes to source blocks */
  debugIndex?: DebugIndex;

  // Legacy bus-aware compiler compatibility
  /** Warnings from IR generation (legacy) */
  irWarnings?: CompileError[];
  /** Compiled IR (legacy - use programIR instead) */
  compiledIR?: unknown;
  /** Compiled port map (legacy) */
  compiledPortMap?: Map<string, Artifact>;
}

/**
 * Full patch representation including blocks, edges, buses, and metadata.
 *
 * Sprint: Edge-based architecture migration (2026-01-02)
 * - Uses Edge type from editor/types.ts (unified connection type)
 * - Buses are BusBlocks in the blocks array
 */
export interface CompilerPatch {
  blocks: readonly BlockInstance[];
  /** Unified edges - all connections are port-to-port */
  edges: readonly import('../types').Edge[];
  buses: readonly Bus[];
  /** Default sources keyed by "blockId:slotId" */
  defaultSources?: Record<string, unknown>;
  /** Default source values keyed by "blockId:slotId" */
  defaultSourceValues?: Record<string, unknown>;
  /** Output port reference (legacy) */
  output?: import('../types').PortRef;
}
