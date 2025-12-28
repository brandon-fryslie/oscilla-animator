/**
 * IRBuilder Types
 *
 * Types used by the IRBuilder that are not part of the core IR schema.
 * These are intermediate types for the building process.
 *
 * References:
 * - HANDOFF.md Topic 1: IRBuilder API
 */

import type { TypeDesc, StateId, ValueSlot, SigExprId, FieldExprId } from "./types";
import type { SignalExprIR } from "./signalExpr";
import type { FieldExprIR } from "./fieldExpr";
import type { TransformStepIR } from "./transforms";
import type { TimeModelIR } from "./schedule";
import type { OpCode } from "./opcodes";
import type { CameraIR } from "./types3d";

// =============================================================================
// Pure Function Reference
// =============================================================================

/**
 * Reference to a pure function used in map/zip operations.
 * These are either built-in opcodes or user-defined pure functions.
 */
export interface PureFnRef {
  /** Function identifier (opcode name or custom function id) */
  fnId: string;

  /** Output type of this function */
  outputType: TypeDesc;

  /** Optional parameters for parameterized functions */
  params?: Record<string, unknown>;

  /** Optional opcode reference for built-in functions */
  opcode?: OpCode;
}

/**
 * Reduction function for field-to-signal operations.
 */
export interface ReduceFn {
  /** Reducer identifier (sum, average, min, max, etc.) */
  reducerId: string;

  /** Output type */
  outputType: TypeDesc;
}

// =============================================================================
// State Layout Entry
// =============================================================================

/**
 * Entry in the state layout describing a piece of runtime state.
 */
export interface StateLayoutEntry {
  stateId: StateId;
  type: TypeDesc;
  initial?: unknown;
  debugName?: string;
}

// =============================================================================
// Transform Chain
// =============================================================================

/**
 * A chain of transforms applied in sequence.
 * This is the builder's version - TransformChainIR in transforms.ts is the final IR version.
 */
export interface BuilderTransformChain {
  steps: readonly TransformStepIR[];
  outputType: TypeDesc;
}

// =============================================================================
// Render Sink
// =============================================================================

/**
 * A render sink consumes values and produces visual output.
 */
export interface RenderSinkIR {
  /** Type of render sink (svg, canvas, etc.) */
  sinkType: string;

  /** Input bindings (slot name -> value slot) */
  inputs: Record<string, ValueSlot>;
}

/**
 * Domain definition for IR.
 * Tracks the slot and count for each domain created.
 */
export interface DomainDefIR {
  /** Value slot where domain handle is stored */
  slot: ValueSlot;

  /** Number of elements in the domain */
  count: number;
}

// =============================================================================
// Debug Index
// =============================================================================

/**
 * Debug information mapping IR nodes back to source blocks.
 */
export interface BuilderDebugIndex {
  /** Map signal expression IDs to source block */
  sigExprSource: Map<SigExprId, string>;

  /** Map field expression IDs to source block */
  fieldExprSource: Map<FieldExprId, string>;

  /** Map value slots to source port */
  slotSource: Map<ValueSlot, { blockId: string; slotId: string }>;
}

// =============================================================================
// Slot Metadata (emitted during lowering)
// =============================================================================

/**
 * Metadata for a value slot, emitted during lowering.
 * This is the canonical source of slot type/storage info.
 */
export interface SlotMetaEntry {
  /** Slot index */
  slot: ValueSlot;

  /** Storage type (inferred from TypeDesc) */
  storage: "f64" | "f32" | "i32" | "u32" | "object";

  /** Type descriptor for this slot */
  type: TypeDesc;

  /** Optional debug name for the slot */
  debugName?: string;
}

/**
 * Time-related slots allocated by TimeRoot during lowering.
 * Schedule references these rather than allocating its own.
 */
export interface TimeSlots {
  /** Slot for absolute time in ms (input from runtime) */
  tAbsMs: ValueSlot;

  /** Slot for model-adjusted time in ms */
  tModelMs: ValueSlot;

  /** Slot for phase [0,1] */
  phase01?: ValueSlot;

  /** Slot for progress [0,1] */
  progress01?: ValueSlot;

  /** Slot for wrap event trigger */
  wrapEvent?: ValueSlot;
}

// =============================================================================
// Signal IR Table
// =============================================================================

/**
 * Signal IR table.
 */
export interface SignalIRTable {
  nodes: SignalExprIR[];
}

// =============================================================================
// Field IR Table
// =============================================================================

/**
 * Field IR table.
 */
export interface FieldIRTable {
  nodes: FieldExprIR[];
}

// =============================================================================
// Builder Program IR Output
// =============================================================================

/**
 * BuilderProgramIR - the output of IRBuilder.build()
 *
 * This is a simplified version of CompiledProgramIR focused on what the builder produces.
 * Later compilation passes will transform this into the full CompiledProgramIR.
 */
export interface BuilderProgramIR {
  /** Signal expression graph */
  signalIR: SignalIRTable;

  /** Field expression graph */
  fieldIR: FieldIRTable;

  /** Constant pool (deduplicated values) */
  constants: readonly unknown[];

  /** State layout for stateful blocks */
  stateLayout: readonly StateLayoutEntry[];

  /** Transform chains */
  transformChains: readonly BuilderTransformChain[];

  /** Render sinks */
  renderSinks: readonly RenderSinkIR[];

  /** Domain definitions (for initializing domain slots at runtime) */
  domains: readonly DomainDefIR[];

  /** Camera definitions (3D support) */
  cameras: readonly CameraIR[];

  /** Debug index for error reporting */
  debugIndex: BuilderDebugIndex;

  /** Time model (placeholder until time topology pass) */
  timeModel: TimeModelIR;

  /**
   * Slot metadata - canonical source for all allocated slots.
   * Emitted during lowering, used by RuntimeState.
   */
  slotMeta: readonly SlotMetaEntry[];

  /**
   * Mapping from SigExprId to output slot.
   * Indexed by SigExprId; entries may be undefined if unused.
   */
  sigValueSlots: readonly (ValueSlot | undefined)[];

  /**
   * Mapping from FieldExprId to output slot.
   * Indexed by FieldExprId; entries may be undefined if unused.
   */
  fieldValueSlots: readonly (ValueSlot | undefined)[];

  /**
   * Next available value slot after lowering.
   * Used by schedule builders to avoid slot collisions.
   */
  nextValueSlot: ValueSlot;

  /**
   * Time-related slots allocated by TimeRoot during lowering.
   * Schedule references these rather than allocating new ones.
   */
  timeSlots?: TimeSlots;
}
