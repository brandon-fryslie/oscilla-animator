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
  SigExprId,
  FieldExprId,
  TransformChainId,

  // Type table
  TypeTable,
} from "./types";

// ============================================================================
// Block Lowering Types (Phase 3)
// ============================================================================

export type {
  // Block capability classification
  BlockCapability,

  // Port declarations
  BlockPortDecl,

  // Block type declaration
  BlockTypeDecl,

  // Lowering function signature
  BlockLowerFn,

  // Lowering context and result
  LowerCtx,
  LowerResult,
  BlockDeclarations,

  // Value references
  ValueRefPacked,
} from "./lowerTypes";

export {
  // Registry functions
  registerBlockType,
  getBlockType,
  hasBlockType,
} from "./lowerTypes";

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
  StepMaterializeColor,
  StepMaterializePath,
  StepMaterializeTestGeometry,
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

// ============================================================================
// Signal Expressions
// ============================================================================

export type {
  // Table
  SignalExprTable,

  // Expression types (discriminated union)
  SignalExprIR,
  SignalExprConst,
  SignalExprTimeAbsMs,
  SignalExprTimeModelMs,
  SignalExprPhase01,
  SignalExprWrapEvent,
  SignalExprInputSlot,
  SignalExprMap,
  SignalExprZip,
  SignalExprSelect,
  SignalExprTransform,
  SignalExprBusCombine,
  SignalExprStateful,

  // Stateful operations
  StatefulSignalOp,
} from "./signalExpr";

// ============================================================================
// OpCodes
// ============================================================================

export { OpCode, OPCODE_REGISTRY } from "./opcodes";

export type { OpCodeCategory, OpCodePurity, OpCodeMeta } from "./opcodes";

// ============================================================================
// Transforms
// ============================================================================

export type {
  // Table
  TransformTable,
  TransformChainIR,

  // Steps (discriminated union)
  TransformStepIR,
  TransformStepCast,
  TransformStepMap,
  TransformStepScaleBias,
  TransformStepNormalize,
  TransformStepQuantize,
  TransformStepEase,
  TransformStepSlew,

  // Cast operations
  CastOp,

  // Function references
  PureFnRef,
  PureFnRefOpcode,
  PureFnRefKernel,
} from "./transforms";

// ============================================================================
// Default Sources
// ============================================================================

export type {
  // Table
  DefaultSourceTable,
  DefaultSourceIR,

  // Value references
  ValueRef,
  ValueRefConst,
  ValueRefExpr,

  // UI hints
  UIControlHint,
  UIControlHintSlider,
  UIControlHintNumber,
  UIControlHintSelect,
  UIControlHintColor,
  UIControlHintBoolean,
  UIControlHintText,
  UIControlHintXY,
} from "./defaultSources";

// ============================================================================
// Field Expressions
// ============================================================================

export type {
  // Table
  FieldExprTable as FieldExprTableIR,

  // Expression types (discriminated union)
  FieldExprIR,
  FieldExprConst,
  FieldExprBroadcastSig,
  FieldExprMap,
  FieldExprZip,
  FieldExprSelect,
  FieldExprTransform,
  FieldExprBusCombine,
} from "./fieldExpr";

// ============================================================================
// IRBuilder
// ============================================================================

export type { IRBuilder } from "./IRBuilder";
export { IRBuilderImpl } from "./IRBuilderImpl";

export type {
  // Builder-specific types
  PureFnRef as BuilderPureFnRef,
  ReduceFn,
  StateLayoutEntry,
  BuilderTransformChain,
  RenderSinkIR,
  BuilderDebugIndex,
  SignalIRTable,
  FieldIRTable,
  BuilderProgramIR,
} from "./builderTypes";

// ============================================================================
// Patch Transformation Types (Compilation Pipeline)
// ============================================================================

export type {
  // Block index
  BlockIndex,
  ConstId,

  // Default sources
  DefaultSourceAttachment,

  // Patch stages
  NormalizedPatch,
  TypedPatch,
  TimeResolvedPatch,
  TimeSignals,

  // Dependency graph
  DepNode,
  DepEdge,
  DepGraph,

  // Cycle validation
  SCC,
  IllegalCycleError,
  AcyclicOrLegalGraph,
} from "./patches";

export { isBlockEval, isBusValue } from "./patches";
