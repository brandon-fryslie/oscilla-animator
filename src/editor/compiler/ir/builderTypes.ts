/**
 * IRBuilder Types
 *
 * Types used by the IRBuilder that are not part of the core IR schema.
 * These are intermediate types for the building process.
 *
 * References:
 * - HANDOFF.md Topic 1: IRBuilder API
 */

import type { TypeDesc, StateId, ValueSlot, SigExprId, FieldExprId, EventExprId } from "./types";
import type { SignalExprIR, EventExprIR } from "./signalExpr";
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
 * Tracks the slot and metadata for each domain created.
 */
export interface DomainDefIR {
  /** Value slot where domain handle is stored */
  slot: ValueSlot;

  /** Number of elements in the domain */
  count: number;

  /** Optional SVG path data for SVG-sampled domains */
  svgPath?: string;
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

  /** Map event expression IDs to source block */
  eventExprSource: Map<EventExprId, string>;

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

// =============================================================================
// Time Slots (from TimeRoot lowering)
// =============================================================================

/**
 * Time slots emitted by TimeRoot lowering.
 * Stores the slots for canonical time signals.
 *
 * Different TimeRoot types emit different subsets:
 * - Finite: systemTime, progress, tAbsMs, tModelMs, phase01, progress01, wrapEvent
 * - Infinite: systemTime, tAbsMs
 * - Cycle: systemTime, phase, tAbsMs, tModelMs, phase01, progress01, wrapEvent
 */
export interface TimeSlots {
  /** Absolute system time in milliseconds (always present) */
  systemTime: ValueSlot;

  /** Progress value for finite/cyclic time models [0,1] (optional) */
  progress?: ValueSlot;

  /** Absolute time signal (tAbsMs) */
  tAbsMs?: ValueSlot;

  /** Model time signal (tModelMs) */
  tModelMs?: ValueSlot;

  /** Phase signal [0,1] (phase01) */
  phase01?: ValueSlot;

  /** Progress signal [0,1] (progress01) - same as progress */
  progress01?: ValueSlot;

  /** Wrap/end event signal */
  wrapEvent?: ValueSlot;
}

// =============================================================================
// Signal and Field IR Tables
// =============================================================================

/**
 * Signal IR table (for re-export compatibility).
 */
export interface SignalIRTable {
  nodes: readonly SignalExprIR[];
}

/**
 * Field IR table (for re-export compatibility).
 */
export interface FieldIRTable {
  nodes: readonly FieldExprIR[];
}

// =============================================================================
// Builder Program IR
// =============================================================================

/**
 * Field IR table.
 */
export interface FieldIRTable {
  nodes: FieldExprIR[];
}

// =============================================================================
// Event IR Table
// =============================================================================

/**
 * Event IR table.
 */
export interface EventIRTable {
  nodes: EventExprIR[];
}

// =============================================================================
// Builder Program IR Output
// =============================================================================

/**
 * BuilderProgramIR - the output of IRBuilder.build()
 *
 * This is a simplified version of CompiledProgramIR focused on what the builder produces.
 * Later compilation passes will transform this into the full CompiledProgramIR.
 * Intermediate IR representation built by IRBuilder.
 * This is the output of the builder, consumed by later compiler phases.
 */
export interface BuilderProgramIR {
  /** Signal expression table */
  signalIR: SignalIRTable;

  /** Field expression table */
  fieldIR: FieldIRTable;

  /** Event expression graph */
  eventIR: EventIRTable;

  /** Constant pool */
  constants: readonly unknown[];

  /** State layout entries */
  stateLayout: readonly StateLayoutEntry[];

  /** Transform chains */
  transformChains: readonly BuilderTransformChain[];

  /** Render sinks */
  renderSinks: readonly RenderSinkIR[];

  /** Domain definitions */
  domains: readonly DomainDefIR[];

  /** Cameras (3D) */
  cameras: readonly CameraIR[];

  /** Debug index for provenance tracking */
  debugIndex: BuilderDebugIndex;

  /** Time model from TimeRoot */
  timeModel: TimeModelIR;

  /** Slot metadata */
  slotMeta: readonly SlotMetaEntry[];

  /** Signal value slots registration */
  sigValueSlots: ReadonlyArray<ValueSlot | undefined>;

  /** Field value slots registration */
  fieldValueSlots: ReadonlyArray<ValueSlot | undefined>;

  /**
   * Mapping from EventExprId to output slot.
   * Indexed by EventExprId; entries may be undefined if unused.
   */
  eventValueSlots: readonly (ValueSlot | undefined)[];

  /**
   * Next available value slot after lowering.
   * Used by schedule builders to avoid slot collisions.
   */
  nextValueSlot: ValueSlot;

  /**
   * Time-related slots allocated by TimeRoot during lowering.
   * Schedule references these rather than allocating new ones.
   */
  /** Time slots (from TimeRoot) */
  timeSlots?: TimeSlots;
}
