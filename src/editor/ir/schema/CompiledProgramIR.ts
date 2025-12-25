/**
 * CompiledProgramIR Schema
 *
 * Core IR TypeScript interfaces for the data-driven compiler.
 * Pure types with no implementation - the IR is data, not code.
 *
 * @module ir/schema/CompiledProgramIR
 */

import type {
  NodeIndex, BusIndex, ValueSlot, NodeId, BusId, StepId, StateId
} from '../types/Indices';
import type { TypeDesc } from '../types/TypeDesc';
import type { DebugIndex } from '../types/DebugIndex';

// =============================================================================
// Top-Level Program Container
// =============================================================================

/**
 * The compiled program IR - pure data representing the entire animation.
 * This is the output of compilation and input to the runtime VM.
 */
export interface CompiledProgramIR {
  /** IR format version (for compatibility checking) */
  readonly irVersion: 1;

  /** Stable patch identifier */
  readonly patchId: string;

  /** Patch revision number (increments on each edit) */
  readonly patchRevision: number;

  /** Unique compile identifier (for cache invalidation) */
  readonly compileId: string;

  /** Random seed for deterministic randomness */
  readonly seed: number;

  /** Time topology - defines how time flows through the program */
  readonly timeModel: TimeModelIR;

  /** Type table (for runtime type checking if needed) */
  readonly types: TypeTable;

  /** Node table - all computation nodes */
  readonly nodes: NodeTable;

  /** Bus table - all signal buses */
  readonly buses: BusTable;

  /** Constant pool - compile-time constant values */
  readonly constPool: ConstPool;

  /** Default source table - UI-bindable default values */
  readonly defaultSources: DefaultSourceTable;

  /** Transform table - adapter/lens chains */
  readonly transforms: TransformTable;

  /** Execution schedule - ordered evaluation plan */
  readonly schedule: ScheduleIR;

  /** Output specifications - what the program produces */
  readonly outputs: readonly OutputSpec[];

  /** Debug index - for source mapping and debugging */
  readonly debugIndex: DebugIndex;

  /** Program metadata - names, warnings, etc. */
  readonly meta: ProgramMeta;
}

// =============================================================================
// Time Model
// =============================================================================

/**
 * TimeModelIR defines the temporal topology of the program.
 * This is authoritative - the player and UI are driven by TimeModel.
 */
export type TimeModelIR =
  | FiniteTimeModelIR
  | CyclicTimeModelIR
  | InfiniteTimeModelIR;

/**
 * Finite time model: bounded animation with explicit duration.
 */
export interface FiniteTimeModelIR {
  readonly kind: 'finite';
  /** Total duration in milliseconds */
  readonly durationMs: number;
  /** Optional cue points for UI markers */
  readonly cuePoints?: readonly CuePointIR[];
}

/**
 * Cyclic time model: looping animation with defined period.
 */
export interface CyclicTimeModelIR {
  readonly kind: 'cyclic';
  /** Period of one cycle in milliseconds */
  readonly periodMs: number;
  /** Mode: loop (0→1→0→1) or pingpong (0→1→0→1) */
  readonly mode: 'loop' | 'pingpong';
  /** Phase domain is always 0..1 (normalized) */
  readonly phaseDomain: '0..1';
}

/**
 * Infinite time model: unbounded time with no inherent structure.
 */
export interface InfiniteTimeModelIR {
  readonly kind: 'infinite';
  /** Suggested window size for preview in milliseconds */
  readonly windowMs: number;
  /** Suggested UI window size (may differ from windowMs) */
  readonly suggestedUIWindowMs?: number;
}

/**
 * Cue point - a significant moment in the animation.
 */
export interface CuePointIR {
  readonly id: string;
  readonly label: string;
  readonly tMs: number;
  readonly behavior?: 'snap' | 'event';
}

// =============================================================================
// Type Table
// =============================================================================

/**
 * Type table for runtime type information.
 */
export interface TypeTable {
  readonly types: readonly TypeDesc[];
}

// =============================================================================
// Node Table
// =============================================================================

/**
 * Node table - all computation nodes indexed by NodeIndex.
 */
export interface NodeTable {
  readonly nodes: readonly NodeIR[];
  readonly nodeIdToIndex: ReadonlyMap<NodeId, NodeIndex>;
}

/**
 * A node in the IR graph - represents a computation.
 */
export interface NodeIR {
  /** Stable string ID (for persistence, hot-swap matching) */
  readonly id: NodeId;

  /** Dense numeric index (for runtime lookups) */
  readonly index: NodeIndex;

  /** Capability category (for scheduling and optimization) */
  readonly capability: NodeCapability;

  /** Operation to perform */
  readonly op: OpCode;

  /** Input ports */
  readonly inputs: readonly InputPortIR[];

  /** Output ports */
  readonly outputs: readonly OutputPortIR[];

  /** Reference to constants (if any) */
  readonly consts?: ConstPoolRef;

  /** State bindings (if any) */
  readonly state?: readonly StateBindingIR[];

  /** Debug metadata */
  readonly meta?: NodeMeta;
}

/**
 * Node capability - what kind of computation this node performs.
 * Used for scheduling and optimization.
 */
export type NodeCapability =
  | 'time'     // Produces time-derived values (phase, wrap events)
  | 'identity' // Produces stable element identity (domain blocks)
  | 'state'    // Has internal state (integrators, delays)
  | 'render'   // Produces render output
  | 'io'       // External I/O (viewport, user input)
  | 'pure';    // Pure computation (no side effects)

/**
 * Input port on a node.
 */
export interface InputPortIR {
  /** Port name */
  readonly name: string;

  /** Type descriptor */
  readonly type: TypeDesc;

  /** Where this input gets its value */
  readonly source: InputSourceIR;

  /** Optional transform chain to apply */
  readonly transform?: TransformChainRef;
}

/**
 * Output port on a node.
 */
export interface OutputPortIR {
  /** Port name */
  readonly name: string;

  /** Type descriptor */
  readonly type: TypeDesc;

  /** Value slot in the runtime value store */
  readonly slot: ValueSlot;
}

// =============================================================================
// Input Sources
// =============================================================================

/**
 * Where an input port gets its value.
 */
export type InputSourceIR =
  | { readonly kind: 'slot'; readonly slot: ValueSlot }
  | { readonly kind: 'bus'; readonly busIndex: BusIndex }
  | { readonly kind: 'const'; readonly constId: string }
  | { readonly kind: 'defaultSource'; readonly defaultId: string }
  | { readonly kind: 'rail'; readonly railId: string }
  | { readonly kind: 'external'; readonly externalId: string };

// =============================================================================
// Bus Table
// =============================================================================

/**
 * Bus table - all signal buses indexed by BusIndex.
 */
export interface BusTable {
  readonly buses: readonly BusIR[];
  readonly busIdToIndex: ReadonlyMap<BusId, BusIndex>;
}

/**
 * A bus in the IR - a typed signal distribution point.
 */
export interface BusIR {
  /** Stable string ID */
  readonly id: BusId;

  /** Dense numeric index */
  readonly index: BusIndex;

  /** Type of values on this bus */
  readonly type: TypeDesc;

  /** How to combine multiple publishers */
  readonly combineMode: BusCombineMode;

  /** Default value constant ID (if any) */
  readonly defaultConstId?: string;

  /** Publishers writing to this bus */
  readonly publishers: readonly PublisherIR[];

  /** Listeners reading from this bus */
  readonly listeners: readonly ListenerIR[];

  /** Output slot for the combined value */
  readonly outputSlot: ValueSlot;
}

/**
 * Bus combination modes.
 */
export type BusCombineMode = 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer';

/**
 * A publisher writing to a bus.
 */
export interface PublisherIR {
  /** Source value slot */
  readonly sourceSlot: ValueSlot;

  /** Sort key for deterministic ordering */
  readonly sortKey: number;

  /** Optional weight for combining */
  readonly weight?: number;

  /** Whether this publisher is enabled */
  readonly enabled: boolean;

  /** Optional transform to apply */
  readonly transform?: TransformChainRef;
}

/**
 * A listener reading from a bus.
 */
export interface ListenerIR {
  /** Target node index */
  readonly targetNodeIndex: NodeIndex;

  /** Target input port index within the node */
  readonly targetInputIndex: number;

  /** Whether this listener is enabled */
  readonly enabled: boolean;

  /** Optional transform to apply */
  readonly transform?: TransformChainRef;
}

// =============================================================================
// Constants & Default Sources
// =============================================================================

/**
 * Pool of compile-time constant values.
 */
export interface ConstPool {
  readonly entries: ReadonlyMap<string, TypedConst>;
}

/**
 * A typed constant value.
 */
export interface TypedConst {
  readonly type: TypeDesc;
  readonly value: unknown; // JSON-serializable
}

/** Reference to a constant in the pool */
export type ConstPoolRef = string;

/**
 * Table of default source values (UI-bindable).
 */
export interface DefaultSourceTable {
  readonly sources: ReadonlyMap<string, DefaultSourceIR>;
}

/**
 * A default source - a UI-bindable default value for an input.
 */
export interface DefaultSourceIR {
  readonly type: TypeDesc;
  readonly value: unknown;
  readonly uiHint?: UIHintIR;
}

/**
 * UI hint for how to render a default source control.
 */
export interface UIHintIR {
  readonly kind: 'slider' | 'number' | 'select' | 'color' | 'boolean' | 'text';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

// =============================================================================
// Transforms (Adapters + Lenses)
// =============================================================================

/**
 * Table of transform chains.
 */
export interface TransformTable {
  readonly chains: ReadonlyMap<string, TransformChainIR>;
}

/** Reference to a transform chain */
export type TransformChainRef = string;

/**
 * A chain of transforms to apply to a value.
 */
export interface TransformChainIR {
  readonly id: string;
  readonly steps: readonly TransformStepIR[];
  readonly inputType: TypeDesc;
  readonly outputType: TypeDesc;
}

/**
 * A single step in a transform chain.
 */
export interface TransformStepIR {
  readonly kind: 'adapter' | 'lens';
  readonly implId: string;
  readonly params: ReadonlyMap<string, unknown>;
}

// =============================================================================
// State
// =============================================================================

/**
 * State binding for stateful nodes.
 */
export interface StateBindingIR {
  readonly stateId: StateId;
  readonly type: TypeDesc;
  readonly initialConstId?: string;
  readonly policy: 'frame' | 'timeMs';
}

// =============================================================================
// Schedule
// =============================================================================

/**
 * Execution schedule - the ordered plan for evaluating the program.
 */
export interface ScheduleIR {
  readonly steps: readonly StepIR[];
  readonly phasePartition: PhasePartitionIR;
}

/**
 * A step in the execution schedule.
 */
export type StepIR =
  | TimeDeriveStepIR
  | NodeEvalStepIR
  | BusEvalStepIR
  | MaterializeStepIR
  | RenderAssembleStepIR
  | DebugProbeStepIR;

/**
 * Step that derives time signals from the TimeModel.
 */
export interface TimeDeriveStepIR {
  readonly kind: 'timeDerive';
  readonly id: StepId;
  readonly outputSlots: readonly ValueSlot[];
}

/**
 * Step that evaluates a node.
 */
export interface NodeEvalStepIR {
  readonly kind: 'nodeEval';
  readonly id: StepId;
  readonly nodeIndex: NodeIndex;
  readonly cacheKey?: CacheKeySpec;
}

/**
 * Step that evaluates a bus (combines publishers).
 */
export interface BusEvalStepIR {
  readonly kind: 'busEval';
  readonly id: StepId;
  readonly busIndex: BusIndex;
  readonly cacheKey?: CacheKeySpec;
}

/**
 * Step that materializes a field expression to a buffer.
 */
export interface MaterializeStepIR {
  readonly kind: 'materialize';
  readonly id: StepId;
  readonly exprId: string;
  readonly targetBuffer: string;
  readonly domainSize: ValueSlot | number;
}

/**
 * Step that assembles the final render tree.
 */
export interface RenderAssembleStepIR {
  readonly kind: 'renderAssemble';
  readonly id: StepId;
  readonly rootNodeIndices: readonly NodeIndex[];
}

/**
 * Step that probes a value for debugging.
 */
export interface DebugProbeStepIR {
  readonly kind: 'debugProbe';
  readonly id: StepId;
  readonly targetSlot: ValueSlot;
  readonly probeId: string;
}

/**
 * Phase partition - groups steps by evaluation phase.
 */
export interface PhasePartitionIR {
  readonly timeDerive: readonly StepId[];
  readonly preBus: readonly StepId[];
  readonly bus: readonly StepId[];
  readonly postBus: readonly StepId[];
  readonly materializeRender: readonly StepId[];
  readonly renderAssemble: readonly StepId[];
}

/**
 * Cache key specification for memoization.
 */
export interface CacheKeySpec {
  readonly policy: 'none' | 'perFrame' | 'untilInvalidated';
  readonly deps?: readonly ValueSlot[];
}

// =============================================================================
// Outputs
// =============================================================================

/**
 * Output specification - what the program produces.
 */
export interface OutputSpec {
  readonly kind: 'renderTree' | 'renderCommands';
  readonly sourceSlot: ValueSlot;
}

// =============================================================================
// Metadata
// =============================================================================

/**
 * Program metadata for debugging and tooling.
 */
export interface ProgramMeta {
  readonly names: {
    readonly nodes: ReadonlyMap<NodeId, string>;
    readonly buses: ReadonlyMap<BusId, string>;
    readonly steps: ReadonlyMap<StepId, string>;
  };
  readonly warnings?: readonly CompileWarningIR[];
}

/**
 * A compile-time warning.
 */
export interface CompileWarningIR {
  readonly code: string;
  readonly message: string;
  readonly where?: { readonly nodeId?: NodeId; readonly busId?: BusId };
}

/**
 * Node metadata for debugging.
 */
export interface NodeMeta {
  readonly label?: string;
  readonly blockId?: string;
  readonly portNames?: readonly string[];
}

// =============================================================================
// OpCodes
// =============================================================================

/**
 * Operation codes - what computation a node performs.
 */
export type OpCode =
  // Time operations
  | { readonly op: 'time.absMs' }
  | { readonly op: 'time.modelMs' }
  | { readonly op: 'time.phase01' }
  | { readonly op: 'time.wrapEvent' }

  // Identity/Domain operations
  | { readonly op: 'domain.n' }
  | { readonly op: 'domain.stableId' }
  | { readonly op: 'domain.index' }

  // Pure math (scalar)
  | { readonly op: 'math.add' }
  | { readonly op: 'math.sub' }
  | { readonly op: 'math.mul' }
  | { readonly op: 'math.div' }
  | { readonly op: 'math.mod' }
  | { readonly op: 'math.abs' }
  | { readonly op: 'math.floor' }
  | { readonly op: 'math.ceil' }
  | { readonly op: 'math.round' }
  | { readonly op: 'math.sin' }
  | { readonly op: 'math.cos' }
  | { readonly op: 'math.tan' }
  | { readonly op: 'math.pow' }
  | { readonly op: 'math.sqrt' }
  | { readonly op: 'math.exp' }
  | { readonly op: 'math.log' }
  | { readonly op: 'math.clamp' }
  | { readonly op: 'math.lerp' }
  | { readonly op: 'math.map' }
  | { readonly op: 'math.noise' }
  | { readonly op: 'math.random' }

  // Pure math (vector)
  | { readonly op: 'vec.add' }
  | { readonly op: 'vec.sub' }
  | { readonly op: 'vec.scale' }
  | { readonly op: 'vec.dot' }
  | { readonly op: 'vec.cross' }
  | { readonly op: 'vec.normalize' }
  | { readonly op: 'vec.length' }
  | { readonly op: 'vec.distance' }
  | { readonly op: 'vec.rotate' }

  // State operations
  | { readonly op: 'state.integrate' }
  | { readonly op: 'state.delay' }
  | { readonly op: 'state.sampleHold' }
  | { readonly op: 'state.slew' }
  | { readonly op: 'state.trigger' }

  // Render operations
  | { readonly op: 'render.instances2d' }
  | { readonly op: 'render.group' }
  | { readonly op: 'render.filter' }
  | { readonly op: 'render.composite' }
  | { readonly op: 'render.shape' }
  | { readonly op: 'render.path' }

  // IO operations
  | { readonly op: 'io.viewport' }
  | { readonly op: 'io.time' }
  | { readonly op: 'io.pointer' }

  // Transform operations (applied via chains)
  | { readonly op: 'transform.scale' }
  | { readonly op: 'transform.offset' }
  | { readonly op: 'transform.clamp' }
  | { readonly op: 'transform.invert' }
  | { readonly op: 'transform.quantize' }

  // Field operations
  | { readonly op: 'field.broadcast' }
  | { readonly op: 'field.reduce' }
  | { readonly op: 'field.map' }
  | { readonly op: 'field.zip' }
  | { readonly op: 'field.filter' }

  // Color operations
  | { readonly op: 'color.rgb' }
  | { readonly op: 'color.hsl' }
  | { readonly op: 'color.lerp' }
  | { readonly op: 'color.mix' }

  // Special
  | { readonly op: 'noop' }
  | { readonly op: 'passthrough' }
  | { readonly op: 'custom'; readonly kernelId: string };
