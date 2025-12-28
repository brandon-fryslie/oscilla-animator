/**
 * IRBuilder Interface
 *
 * The IRBuilder provides a fluent API for constructing IR nodes.
 * It manages ID allocation, constant deduplication, and IR graph construction.
 *
 * Usage pattern:
 * ```typescript
 * const builder = new IRBuilderImpl();
 * const timeSignal = builder.sigTimeAbsMs();
 * const scaledTime = builder.sigMap(timeSignal, { kind: 'opcode', opcode: OpCode.Mul });
 * const ir = builder.build();
 * ```
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md
 * - HANDOFF.md Topic 1: IRBuilder API
 */

import type {
  TypeDesc,
  SigExprId,
  FieldExprId,
  ValueSlot,
  StateId,
  TransformChainId,
  BusIndex,
} from "./types";
import type { TransformStepIR } from "./transforms";
import type { StatefulSignalOp } from "./signalExpr";
import type { PureFnRef, ReduceFn, BuilderProgramIR, TimeSlots } from "./builderTypes";
import type { CameraIR } from "./types3d";

/**
 * IRBuilder interface for constructing Intermediate Representation.
 *
 * This is the main API used by all compilation passes to build IR.
 * Implementations must maintain internal state for ID allocation and graph construction.
 */
export interface IRBuilder {
  // =============================================================================
  // Debug Tracking (Phase 7)
  // =============================================================================

  /**
   * Set the current block ID for debug index tracking.
   * Called by the compiler before lowering each block instance.
   *
   * @param blockId - Block instance ID (or undefined to clear)
   */
  setCurrentBlockId(blockId: string | undefined): void;

  // =============================================================================
  // ID Allocation
  // =============================================================================

  /**
   * Allocate a new signal expression ID.
   * IDs are sequential starting from 0.
   */
  allocSigExprId(): SigExprId;

  /**
   * Allocate a new field expression ID.
   * IDs are sequential starting from 0.
   */
  allocFieldExprId(): FieldExprId;

  /**
   * Allocate a new state ID for stateful blocks.
   */
  allocStateId(type: TypeDesc, initial?: unknown, debugName?: string): StateId;

  /**
   * Allocate or reuse a constant ID.
   * Deduplicates identical values to save memory.
   */
  allocConstId(value: unknown): number;

  /**
   * Allocate a value slot (runtime storage location).
   * @param type - Optional type descriptor for slot metadata
   * @param debugName - Optional debug name for the slot
   */
  allocValueSlot(type?: TypeDesc, debugName?: string): ValueSlot;

  /**
   * Register a signal output slot for a signal expression ID.
   */
  registerSigSlot(sigId: SigExprId, slot: ValueSlot): void;

  /**
   * Register a ValueSlot for a field expression output.
   */
  registerFieldSlot(fieldId: FieldExprId, slot: ValueSlot): void;

  /**
   * Set time slots allocated by TimeRoot during lowering.
   * Schedule will reference these rather than allocating its own.
   */
  setTimeSlots(slots: TimeSlots): void;

  // =============================================================================
  // Signal Expressions
  // =============================================================================

  /**
   * Create a constant signal.
   */
  sigConst(value: number, type: TypeDesc): SigExprId;

  /**
   * Create absolute time signal (monotonic, in milliseconds).
   */
  sigTimeAbsMs(): SigExprId;

  /**
   * Create model time signal (after time model transformation).
   */
  sigTimeModelMs(): SigExprId;

  /**
   * Create phase signal (0..1 normalized cyclic time).
   */
  sigPhase01(): SigExprId;

  /**
   * Create wrap event signal (trigger on cycle wrap).
   */
  sigWrapEvent(): SigExprId;

  /**
   * Map a signal through a pure function.
   */
  sigMap(src: SigExprId, fn: PureFnRef): SigExprId;

  /**
   * Zip two signals together with a binary function.
   */
  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId;

  /**
   * Select between two signals based on a condition signal.
   */
  sigSelect(cond: SigExprId, t: SigExprId, f: SigExprId, outputType: TypeDesc): SigExprId;

  /**
   * Apply a transform chain to a signal.
   */
  sigTransform(src: SigExprId, chain: TransformChainId): SigExprId;

  /**
   * Combine multiple signals using a bus combine mode.
   */
  sigCombine(
    busIndex: BusIndex,
    terms: readonly SigExprId[],
    mode: "sum" | "average" | "max" | "min" | "last",
    outputType: TypeDesc
  ): SigExprId;

  /**
   * Create a stateful signal operation.
   */
  sigStateful(
    op: StatefulSignalOp,
    input: SigExprId,
    stateId: StateId,
    outputType: TypeDesc,
    params?: Record<string, number>
  ): SigExprId;

  // =============================================================================
  // Field Expressions
  // =============================================================================

  /**
   * Create a constant field.
   */
  fieldConst(value: unknown, type: TypeDesc): FieldExprId;

  /**
   * Map a field through a pure function.
   */
  fieldMap(src: FieldExprId, fn: PureFnRef): FieldExprId;

  /**
   * Zip two fields together.
   */
  fieldZip(a: FieldExprId, b: FieldExprId, fn: PureFnRef): FieldExprId;

  /**
   * Select between two fields based on a condition field.
   */
  fieldSelect(cond: FieldExprId, t: FieldExprId, f: FieldExprId, outputType: TypeDesc): FieldExprId;

  /**
   * Apply a transform chain to a field.
   */
  fieldTransform(src: FieldExprId, chain: TransformChainId): FieldExprId;

  /**
   * Combine multiple fields.
   */
  fieldCombine(
    busIndex: BusIndex,
    terms: readonly FieldExprId[],
    mode: "sum" | "average" | "max" | "min" | "last" | "layer",
    outputType: TypeDesc
  ): FieldExprId;

  /**
   * Broadcast a signal to a field (repeat signal value for each element).
   */
  broadcastSigToField(sig: SigExprId, domainSlot: ValueSlot, outputType: TypeDesc): FieldExprId;

  /**
   * Reduce a field to a signal.
   */
  reduceFieldToSig(field: FieldExprId, fn: ReduceFn): SigExprId;

  // =============================================================================
  // Domain
  // =============================================================================

  /**
   * Create a domain from a fixed size N.
   */
  domainFromN(n: number): ValueSlot;

  /**
   * Create a domain from SVG sampling.
   */
  domainFromSVG(svgRef: string, sampleCount: number): ValueSlot;

  // =============================================================================
  // Transforms
  // =============================================================================

  /**
   * Create a transform chain.
   */
  transformChain(steps: readonly TransformStepIR[], outputType: TypeDesc): TransformChainId;

  // =============================================================================
  // Render Sinks
  // =============================================================================

  /**
   * Register a render sink.
   */
  renderSink(sinkType: string, inputs: Record<string, ValueSlot>): void;

  // =============================================================================
  // Camera Support (3D)
  // =============================================================================

  /**
   * Add a camera to the program's camera table.
   *
   * @param camera - CameraIR definition
   * @returns Camera index in the cameras array
   */
  addCamera(camera: CameraIR): number;

  /**
   * Get all cameras added to the builder.
   *
   * @returns Array of CameraIR definitions
   */
  getCameras(): readonly CameraIR[];

  // =============================================================================
  // Finalization
  // =============================================================================

  /**
   * Build the final IR structure.
   * This consumes the builder and returns the complete IR.
   */
  build(): BuilderProgramIR;
}
