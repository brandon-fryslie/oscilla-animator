/**
 * IR Module Public API
 *
 * Re-exports all public types and functions from the IR module.
 *
 * @module ir
 */

// =============================================================================
// Types
// =============================================================================

export type {
  TypeWorld,
  CoreDomain,
  InternalDomain,
  TypeDomain,
  TypeCategory,
  TypeDesc,
} from './types/TypeDesc';

export {
  getTypeCategory,
  isBusEligible,
  typeEquals,
  isCompatible,
  createTypeDesc,
} from './types/TypeDesc';

// =============================================================================
// Indices
// =============================================================================

export type {
  NodeIndex,
  PortIndex,
  BusIndex,
  ValueSlot,
  StepIndex,
  NodeId,
  BusId,
  StepId,
  ExprId,
  StateId,
} from './types/Indices';

export {
  nodeIndex,
  portIndex,
  busIndex,
  valueSlot,
  stepIndex,
  nodeId,
  busId,
  stepId,
  exprId,
  stateId,
} from './types/Indices';

// =============================================================================
// Debug Index
// =============================================================================

export type { DebugIndex } from './types/DebugIndex';
export { DebugIndexBuilder } from './types/DebugIndex';

// =============================================================================
// Type Conversion
// =============================================================================

export {
  valueKindToTypeDesc,
  slotTypeToTypeDesc,
  domainFromString,
  typeDescToString,
} from './types/typeConversion';

// =============================================================================
// Schema
// =============================================================================

export type {
  CompiledProgramIR,
  TimeModelIR,
  FiniteTimeModelIR,
  CyclicTimeModelIR,
  InfiniteTimeModelIR,
  CuePointIR,
  TypeTable,
  NodeTable,
  NodeIR,
  NodeCapability,
  InputPortIR,
  OutputPortIR,
  InputSourceIR,
  BusTable,
  BusIR,
  BusCombineMode,
  PublisherIR,
  ListenerIR,
  ConstPool,
  TypedConst,
  ConstPoolRef,
  DefaultSourceTable,
  DefaultSourceIR,
  UIHintIR,
  TransformTable,
  TransformChainRef,
  TransformChainIR,
  TransformStepIR,
  StateBindingIR,
  ScheduleIR,
  StepIR,
  TimeDeriveStepIR,
  NodeEvalStepIR,
  BusEvalStepIR,
  MaterializeStepIR,
  RenderAssembleStepIR,
  DebugProbeStepIR,
  PhasePartitionIR,
  CacheKeySpec,
  OutputSpec,
  ProgramMeta,
  CompileWarningIR,
  NodeMeta,
  OpCode,
} from './schema/CompiledProgramIR';

// =============================================================================
// Time Derivation
// =============================================================================

export type {
  CanonicalTimeSignals,
  CanonicalTimeSignalSpec,
  ValidationResult,
  TimeDerivedValues,
} from './time/TimeDerivation';

export {
  deriveTimeSignals,
  validateTimeModel,
  calculateTimeDerivedValues,
  getTimeModelPeriod,
  isTimeModelBounded,
  isTimeModelLooping,
} from './time/TimeDerivation';
