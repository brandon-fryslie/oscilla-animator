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

  /** Debug index for error reporting */
  debugIndex: BuilderDebugIndex;

  /** Time model (placeholder until time topology pass) */
  timeModel: TimeModelIR;
}
