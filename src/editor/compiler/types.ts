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

export type Seed = number;

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

/**
 * TimelineHint describes the temporal structure of a program.
 * Programs can optionally expose this to inform the player.
 *
 * @deprecated Use TimeModel instead. TimelineHint is kept for backward compatibility.
 */
export type TimelineHint =
  | {
      kind: 'finite';
      durationMs: number;
      recommendedLoop?: 'loop' | 'pingpong' | 'none';
      cuePoints?: readonly CuePoint[];
    }
  | {
      kind: 'infinite';
      recommendedLoop?: 'loop' | 'none';
      windowMs?: number; // Suggested preview window
    };

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

/**
 * CompiledProgram is the output of successful compilation.
 * Contains both the runnable program and its time topology.
 *
 * This replaces the raw Program<RenderTree> return type, making
 * TimeModel a first-class artifact of compilation.
 */
export interface CompiledProgram {
  /** The runnable animation program */
  program: Program<RenderTree>;
  /** The time topology of the patch */
  timeModel: TimeModel;
}

/**
 * Program is time-dependent: returns signal + event handlers.
 * Optionally includes timeline metadata for player-aware playback.
 */
export interface Program<T> {
  signal: (tMs: number, rt: RuntimeCtx) => T;
  event: (ev: KernelEvent) => KernelEvent[];
  timeline?: () => TimelineHint;
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
  | 'Scalar:number'
  | 'Scalar:string'
  | 'Scalar:boolean'
  | 'Scalar:color'
  | 'Scalar:vec2'
  | 'Scalar:bounds'

  // Fields (per-element arrays)
  | 'Field:number'
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
  | 'Signal:number'
  | 'Signal:Unit'
  | 'Signal:vec2'
  | 'Signal:phase'
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
  | 'Event';      // TimeRoot wrap/end events

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
  u: number;
  uRaw: number;
  tLocal: number;
}

export interface PhaseMachine {
  sample(tMs: number): PhaseSample;
}

export interface TargetScene {
  id: string;
  targets: readonly Vec2[];
  groups?: readonly number[];
  bounds?: Bounds;
  meta?: Record<string, unknown>;
}

// =============================================================================
// Patch Graph Data Model
// =============================================================================

export type BlockId = string;

export interface PortRef {
  blockId: BlockId;
  port: string;
}

export interface CompilerConnection {
  from: PortRef; // output port
  to: PortRef; // input port
}

export interface BlockInstance {
  id: BlockId;
  type: string; // registry key
  params: Record<string, unknown>;
  lane?: number;
  position?: number;
}

/**
 * Forward declaration of bus types (imported from main types)
 * These will be available when buses are present in a patch.
 */
// Import types from main editor types for use in CompilerPatch
import type { Bus, Publisher, Listener } from '../types';
// Re-export for consumers
export type { Bus, Publisher, Listener };

// Import Domain from unified compiler
import type { Domain } from './unified/Domain';
// Re-export Domain for consumers
export type { Domain };

import type { DefaultSource } from '../types';

/**
 * Extended CompilerPatch with optional bus support.
 * Maintains backward compatibility with existing wire-only patches.
 */
export interface CompilerPatch {
  blocks: Map<BlockId, BlockInstance>;
  connections: readonly CompilerConnection[];
  output?: PortRef;

  // Bus-related additions (Phase 2)
  buses?: Bus[];
  publishers?: Publisher[];
  listeners?: Listener[];
  
  // Default sources for lens parameters (Phase 3)
  defaultSources?: Record<string, DefaultSource>;
}

// =============================================================================
// Artifacts: Compiled Values
// =============================================================================

export type Artifact =
  | { kind: 'Scalar:number'; value: number }
  | { kind: 'Scalar:string'; value: string }
  | { kind: 'Scalar:boolean'; value: boolean }
  | { kind: 'Scalar:color'; value: unknown }
  | { kind: 'Scalar:vec2'; value: Vec2 }
  | { kind: 'Scalar:bounds'; value: Bounds }

  | { kind: 'Field:number'; value: Field<number> }
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
  | { kind: 'ElementCount'; value: number }
  | { kind: 'Signal:Time'; value: (t: number, ctx: RuntimeCtx) => number }
  | { kind: 'Signal:number'; value: (t: number, ctx: RuntimeCtx) => number }
  | { kind: 'Signal:Unit'; value: (t: number, ctx: RuntimeCtx) => number }
  | { kind: 'Signal:vec2'; value: (t: number, ctx: RuntimeCtx) => Vec2 }
  | { kind: 'Signal:phase'; value: (t: number, ctx: RuntimeCtx) => number }
  | { kind: 'Signal:color'; value: (t: number, ctx: RuntimeCtx) => string }
  | { kind: 'RenderNode'; value: DrawNode }
  | { kind: 'RenderNodeArray'; value: readonly DrawNode[] }
  | { kind: 'RenderTree'; value: (tMs: number, ctx: RuntimeCtx) => DrawNode }
  | { kind: 'FilterDef'; value: unknown }

  | { kind: 'Spec:LineMorph'; value: unknown }
  | { kind: 'Spec:Particles'; value: unknown }
  | { kind: 'Spec:RevealMask'; value: unknown }
  | { kind: 'Spec:Transform3DCompositor'; value: unknown }
  | { kind: 'Spec:DeformCompositor'; value: unknown }
  | { kind: 'Spec:ProgramStack'; value: unknown }

  // Phase 2: Field expression artifacts for lazy evaluation
  | { kind: 'FieldExpr'; value: unknown }

  // Phase 3: Domain for per-element identity
  | { kind: 'Domain'; value: Domain }
  
  // Event artifacts for TimeRoot wrap/end events
  | { kind: 'Event'; value: (tMs: number, lastTMs: number, ctx: RuntimeCtx) => boolean }

  | { kind: 'Error'; message: string; where?: { blockId?: string; port?: string } };

/**
 * A compiled block returns one Artifact per declared output port.
 */
export type CompiledOutputs = Record<string, Artifact>;

// =============================================================================
// Block Compiler Contract
// =============================================================================

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

export type BlockRegistry = Record<string, BlockCompiler>;

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
  // Phase 3: TimeRoot additions
  | 'MissingTimeRoot'
  | 'MultipleTimeRoots'
  | 'ConflictingTimeTopology';

export interface CompileError {
  code: CompileErrorCode;
  message: string;
  where?: { blockId?: string; port?: string; connection?: CompilerConnection; busId?: string };
}

export interface CompileResult {
  ok: boolean;
  program?: Program<RenderTree>;
  /** TimeModel inferred from the patch (present when ok === true) */
  timeModel?: TimeModel;
  errors: readonly CompileError[];
  compiledPortMap?: Map<string, Artifact>;
}

// =============================================================================
// WP1: TimeRoot Bundle Interface and Auto-Publication
// =============================================================================

/**
 * Standardized outputs from all TimeRoot blocks.
 * Auto-published to canonical buses by compiler.
 */
export interface TimeOutputs {
  time: Artifact;      // Signal<time> - monotonic
  phaseA: Artifact;    // Signal<phase> - primary phase (0..1)
  wrap: Artifact;      // Event - fires on wrap/direction flip
  energy: Artifact;    // Signal<number> - speed/intensity
}

/**
 * Auto-publication configuration for TimeRoot outputs to canonical buses.
 * Generated at compile time, NOT persisted in patch data.
 */
export interface AutoPublication {
  busName: string;     // 'phaseA', 'pulse', 'energy', etc.
  artifactKey: string; // Key in the TimeOutputs bundle
  sortKey: number;     // Priority: 0 = system (highest), 100 = manual
}

/**
 * Extended TimeRoot compiler result that includes auto-publications.
 */
export interface TimeRootCompileResult {
  artifacts: Record<string, Artifact>;
  autoPublications: AutoPublication[];
}

/**
 * Reserved bus contracts for WP0 validation.
 * These are the canonical buses that TimeRoot blocks auto-publish to.
 */
export const RESERVED_BUSES = {
  phaseA: { type: 'Signal<phase>', combine: 'last' },
  pulse: { type: 'Event', combine: 'or' },
  energy: { type: 'Signal<number>', combine: 'sum' },
  palette: { type: 'Signal<color>', combine: 'last' },
  progress: { type: 'Signal<number>', combine: 'last' },
} as const;

export type ReservedBusName = keyof typeof RESERVED_BUSES;
export type ReservedBusContract = typeof RESERVED_BUSES[ReservedBusName];
