/**
 * IR Schema - Public API
 *
 * Barrel export for all IR types.
 *
 * This is the public interface to the Oscilla IR system.
 * All external code should import from this module, not from individual files.
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Type system
  TypeWorld,
  TypeDomain,
  TypeDesc,
  ValueKind,

  // Stable IDs
  NodeId,
  BusId,
  StepId,
  ExprId,
  StateId,

  // Dense indices
  NodeIndex,
  PortIndex,
  BusIndex,
  ValueSlot,

  // Type table
  TypeTable,
} from "./types";

// ============================================================================
// Schedule and Steps
// ============================================================================

export type {
  // Time model
  TimeModelIR,
  TimeModelFinite,
  TimeModelCyclic,
  TimeModelInfinite,
  CuePointIR,

  // Schedule
  ScheduleIR,

  // Steps (discriminated union)
  StepIR,
  StepBase,
  StepTimeDerive,
  StepNodeEval,
  StepBusEval,
  StepMaterialize,
  StepRenderAssemble,
  StepDebugProbe,

  // Step components
  PublisherIR,
  TransformChainRef,
  CombineSpec,
  SilentValueSpec,
  MaterializationIR,
  BufferFormat,
  DebugProbeIR,

  // Dependencies and caching
  DependencyIndexIR,
  DeterminismIR,
  CachingIR,
  CacheKeySpec,
  CacheDep,
} from "./schedule";

// ============================================================================
// Storage
// ============================================================================

export type {
  // ValueStore
  ValueStore,
  SlotMeta,

  // StateBuffer
  StateBuffer,
  StateLayout,
  StateCellLayout,
} from "./stores";

export {
  // Factory functions
  createValueStore,
  createStateBuffer,
  initializeState,
} from "./stores";

// ============================================================================
// Program IR
// ============================================================================

export type {
  // Top-level program
  CompiledProgramIR,

  // Tables
  NodeTable,
  NodeIR,
  BusTable,
  BusIR,
  LensTable,
  LensIR,
  AdapterTable,
  AdapterIR,
  FieldExprTable,
  FieldExprNodeIR,
  FieldMaterializationPlan,
  ConstPool,
  ConstIndexEntry,

  // Outputs
  OutputSpec,

  // Metadata
  ProgramMeta,
  SourceMapIR,
  CompileWarningIR,
} from "./program";
