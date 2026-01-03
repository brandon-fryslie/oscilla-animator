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
  TypeCategory,
  Domain,
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
  ValueSlot,
  SigExprId,
  FieldExprId,
  EventExprId,
  TransformChainId,

  // Type table
  TypeTable,

  // Constant pool (canonical schema)
  ConstPool,
} from "./types";

export {
  // Bundle kind helpers (legacy migration)
  BundleKind,
  getBundleArity,
  inferBundleKind,
  bundleKindToLanes,
  migrateBundleToLanes,

  // Type helpers
  getTypeArity,
  inferBundleLanes,
  createTypeDesc,
  createTypeDescCompat,
  completeTypeDesc,
  asTypeDesc,
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
  StepSignalEval,
  StepNodeEval,
  StepMaterialize,
  StepMaterializeColor,
  StepMaterializePath,
  StepMaterializeTestGeometry,
  StepRenderAssemble,
  StepDebugProbe,

  // Batch descriptors (compile-time config for renderAssemble)
  Instance2DBatch,
  PathBatch,

  // Step components
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
// Program IR (Canonical Schema)
// ============================================================================

export type {
  // Top-level program (canonical)
  CompiledProgramIR,
  CompiledProgram, // Deprecated alias

  // Outputs
  OutputSpecIR,

  // Slot metadata
  SlotMetaEntry,

  // Render IR
  RenderIR,
  RenderSinkIR,

  // Debug index (mandatory)
  DebugIndexIR,

  // Diagnostics
  SourceMapIR,
  CompilerWarning,
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

  // Combine spec
  SigCombineMode,
  SigCombineSpec,
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
  FieldExprTable,

  // Expression types (discriminated union)
  FieldExprIR,
  FieldExprConst,
  FieldExprBroadcastSig,
  FieldExprMap,
  FieldExprZip,
  FieldExprSelect,
  FieldExprTransform,
  FieldExprBusCombine,
  FieldExprMapIndexed,
  FieldExprZipSig,

  // Combine spec
  FieldCombineMode,
  FieldCombineSpec,
} from "./fieldExpr";

// ============================================================================
// 3D IR Types
// ============================================================================

export type {
  // Camera IR
  CameraId,
  ProjectionKind,
  CameraIR,
  CameraEval,
  CameraTable,

  // Mesh IR (extrusion-only)
  MeshId,
  ExtrudeProfile2D,
  ExtrudeKind,
  MeshIR,
  MeshBufferRef,
  MeshTable,

  // Instance2D buffers (3D-to-2D projection output)
  Instance2DBufferRef,

  // Performance counters
  StepPerfCounters,
} from "./types3d";

export { DEFAULT_CAMERA_IR } from "./types3d";

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

// ============================================================================
// Pass Results (for debug UI)
// ============================================================================

export type { LinkedGraphIR } from "../passes/pass8-link-resolution";
