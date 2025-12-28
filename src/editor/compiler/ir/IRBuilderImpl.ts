/**
 * IRBuilder Implementation
 *
 * Concrete implementation of the IRBuilder interface.
 * Manages ID allocation, constant deduplication, and IR graph construction.
 *
 * References:
 * - HANDOFF.md Topic 1: IRBuilder API
 */

import type { IRBuilder } from "./IRBuilder";
import type {
  TypeDesc,
  SigExprId,
  FieldExprId,
  EventExprId,
  ValueSlot,
  StateId,
  TransformChainId,
  BusIndex,
} from "./types";
import type { SignalExprIR, StatefulSignalOp, EventExprIR, EventCombineMode } from "./signalExpr";
import type { FieldExprIR } from "./fieldExpr";
import type { TransformStepIR } from "./transforms";
import type {
  PureFnRef,
  ReduceFn,
  StateLayoutEntry,
  BuilderTransformChain,
  RenderSinkIR,
  DomainDefIR,
  BuilderProgramIR,
  SlotMetaEntry,
  TimeSlots,
} from "./builderTypes";
import type { CameraIR } from "./types3d";
import type { TimeModelIR } from "./schedule";

/**
 * Infer storage type from TypeDesc.
 * Signals/events are numeric, fields/special types are objects.
 */
function inferStorage(type: TypeDesc): "f64" | "object" {
  if (type.world === "signal" || type.world === "event") {
    return "f64";
  }
  // Fields, special types (domain, renderTree) are stored as objects
  return "object";
}

/**
 * Implementation of IRBuilder.
 */
export class IRBuilderImpl implements IRBuilder {
  // Tables for IR nodes
  private sigExprs: SignalExprIR[] = [];
  private fieldExprs: FieldExprIR[] = [];
  private eventExprs: EventExprIR[] = [];
  private stateLayout: StateLayoutEntry[] = [];
  private transformChains: BuilderTransformChain[] = [];
  private renderSinks: RenderSinkIR[] = [];
  private domains: DomainDefIR[] = [];
  private cameras: CameraIR[] = [];

  // Constant pool with deduplication
  private constPool: unknown[] = [];
  private constMap: Map<string, number> = new Map();

  // Value slot counter
  private nextValueSlot = 0;
  private sigValueSlots: Array<ValueSlot | undefined> = [];
  private fieldValueSlots: Array<ValueSlot | undefined> = [];
  private eventValueSlots: Array<ValueSlot | undefined> = [];

  // Slot metadata - emitted during lowering
  private slotMetaEntries: SlotMetaEntry[] = [];

  // Time slots - set by TimeRoot lowering
  private timeSlots: TimeSlots | undefined;


  // Time model - set by pass6 from Pass 3 output
  private timeModel: TimeModelIR | undefined;
  // =============================================================================
  // Debug Index Tracking (Phase 7)
  // =============================================================================

  /** Current block ID being compiled (set by caller before lowering) */
  private currentBlockId: string | undefined;

  /** Map signal expression IDs to source block */
  private sigExprSourceMap: Map<SigExprId, string> = new Map();

  /** Map field expression IDs to source block */
  private fieldExprSourceMap: Map<FieldExprId, string> = new Map();

  /** Map event expression IDs to source block */
  private eventExprSourceMap: Map<EventExprId, string> = new Map();

  /** Map value slots to source port */
  private slotSourceMap: Map<ValueSlot, { blockId: string; slotId: string }> = new Map();

  /**
   * Set the current block ID for debug tracking.
   * Called by the compiler before lowering each block.
   *
   * @param blockId - Block instance ID
   */
  setCurrentBlockId(blockId: string | undefined): void {
    this.currentBlockId = blockId;
  }

  /**
   * Set the time model for this patch.
   * Called by pass6 before block lowering begins.
   *
   * @param timeModel - The time model from Pass 3
   */
  setTimeModel(timeModel: TimeModelIR): void {
    this.timeModel = timeModel;
  }

  // =============================================================================
  // ID Allocation
  // =============================================================================

  allocSigExprId(): SigExprId {
    return this.sigExprs.length;
  }

  allocFieldExprId(): FieldExprId {
    return this.fieldExprs.length;
  }

  allocStateId(type: TypeDesc, initial?: unknown, debugName?: string): StateId {
    const stateId = this.stateLayout.length as unknown as StateId;
    this.stateLayout.push({
      stateId,
      type,
      initial,
      debugName,
    });
    return stateId;
  }

  allocConstId(value: unknown): number {
    // Create a stable key for deduplication
    const key = JSON.stringify(value);

    // Check if we already have this constant
    const existing = this.constMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    // Allocate new constant
    const constId = this.constPool.length;
    this.constPool.push(value);
    this.constMap.set(key, constId);
    return constId;
  }

  allocValueSlot(type?: TypeDesc, debugName?: string): ValueSlot {
    const slot = this.nextValueSlot++;

    // Track metadata if type is provided
    if (type) {
      this.slotMetaEntries.push({
        slot,
        storage: inferStorage(type),
        type,
        debugName,
      });
    }

    // Track slot source for debug index (if current block is set)
    if (this.currentBlockId && debugName) {
      this.slotSourceMap.set(slot, {
        blockId: this.currentBlockId,
        slotId: debugName,
      });
    }

    return slot;
  }

  registerSigSlot(sigId: SigExprId, slot: ValueSlot): void {
    this.sigValueSlots[sigId] = slot;
  }

  registerFieldSlot(fieldId: FieldExprId, slot: ValueSlot): void {
    this.fieldValueSlots[fieldId] = slot;
  }

  /**
   * Set time slots allocated by TimeRoot during lowering.
   * Schedule will reference these rather than allocating its own.
   */
  setTimeSlots(slots: TimeSlots): void {
    this.timeSlots = slots;
  }

  // =============================================================================
  // Signal Expressions
  // =============================================================================

  sigConst(value: number, type: TypeDesc): SigExprId {
    const constId = this.allocConstId(value);
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "const",
      type,
      constId,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigTimeAbsMs(): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "timeAbsMs",
      type: {
        world: "signal",
        domain: "timeMs",
      },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigTimeModelMs(): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "timeModelMs",
      type: {
        world: "signal",
        domain: "timeMs",
      },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigPhase01(): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "phase01",
      type: {
        world: "signal",
        domain: "phase01",
      },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigWrapEvent(): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "wrapEvent",
      type: {
        world: "event",
        domain: "trigger",
      },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigMap(src: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "map",
      type: fn.outputType,
      src,
      fn: fn.opcode
        ? { kind: "opcode", opcode: fn.opcode }
        : { kind: "kernel", kernelId: fn.fnId },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "zip",
      type: fn.outputType,
      a,
      b,
      fn: fn.opcode
        ? { kind: "opcode", opcode: fn.opcode }
        : { kind: "kernel", kernelId: fn.fnId },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigSelect(cond: SigExprId, t: SigExprId, f: SigExprId, outputType: TypeDesc): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "select",
      type: outputType,
      cond,
      t,
      f,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigTransform(src: SigExprId, chain: TransformChainId): SigExprId {
    const transformChain = this.transformChains[chain];
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "transform",
      type: transformChain.outputType,
      src,
      chain,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigCombine(
    busIndex: BusIndex,
    terms: readonly SigExprId[],
    mode: "sum" | "average" | "max" | "min" | "last",
    outputType: TypeDesc
  ): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "busCombine",
      type: outputType,
      busIndex,
      terms: [...terms],
      combine: { mode },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  sigStateful(
    op: StatefulSignalOp,
    input: SigExprId,
    stateId: StateId,
    outputType: TypeDesc,
    params?: Record<string, number>
  ): SigExprId {
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "stateful",
      type: outputType,
      op,
      input,
      stateId,
      params,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  // =============================================================================
  // Field Expressions
  // =============================================================================

  fieldConst(value: unknown, type: TypeDesc): FieldExprId {
    const constId = this.allocConstId(value);
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "const",
      type,
      constId,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  fieldMap(src: FieldExprId, fn: PureFnRef): FieldExprId {
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "map",
      type: fn.outputType,
      src,
      fn: fn.opcode
        ? { kind: "opcode", opcode: fn.opcode }
        : { kind: "kernel", kernelId: fn.fnId },
      params: fn.params,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  fieldZip(a: FieldExprId, b: FieldExprId, fn: PureFnRef): FieldExprId {
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "zip",
      type: fn.outputType,
      a,
      b,
      fn: fn.opcode
        ? { kind: "opcode", opcode: fn.opcode }
        : { kind: "kernel", kernelId: fn.fnId },
      params: fn.params,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  fieldSelect(cond: FieldExprId, t: FieldExprId, f: FieldExprId, outputType: TypeDesc): FieldExprId {
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "select",
      type: outputType,
      cond,
      t,
      f,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  fieldTransform(src: FieldExprId, chain: TransformChainId): FieldExprId {
    const transformChain = this.transformChains[chain];
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "transform",
      type: transformChain.outputType,
      src,
      chain,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  fieldCombine(
    busIndex: BusIndex,
    terms: readonly FieldExprId[],
    mode: "sum" | "average" | "max" | "min" | "last" | "layer",
    outputType: TypeDesc
  ): FieldExprId {
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "busCombine",
      type: outputType,
      busIndex,
      terms: [...terms],
      combine: { mode: mode === "layer" ? "last" : mode },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  broadcastSigToField(sig: SigExprId, domainSlot: ValueSlot, outputType: TypeDesc): FieldExprId {
    const id = this.allocFieldExprId();
    this.fieldExprs.push({
      kind: "broadcastSig",
      type: outputType,
      sig,
      domainSlot,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.fieldExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  reduceFieldToSig(_field: FieldExprId, fn: ReduceFn): SigExprId {
    // For now, we'll create a map node as a placeholder
    // This will be properly implemented in a future sprint
    const id = this.allocSigExprId();
    this.sigExprs.push({
      kind: "map",
      type: fn.outputType,
      src: 0 as SigExprId, // Placeholder - will be properly linked
      fn: {
        kind: "kernel",
        kernelId: `reduce_${fn.reducerId}`,
      },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.sigExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  // =============================================================================
  // Event Expressions
  // =============================================================================

  allocEventExprId(): EventExprId {
    return this.eventExprs.length;
  }

  registerEventSlot(eventId: EventExprId, slot: ValueSlot): void {
    this.eventValueSlots[eventId] = slot;
  }

  eventEmpty(type: TypeDesc): EventExprId {
    const id = this.allocEventExprId();
    this.eventExprs.push({
      kind: "eventEmpty",
      type,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.eventExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  eventWrap(): EventExprId {
    const id = this.allocEventExprId();
    this.eventExprs.push({
      kind: "eventWrap",
      type: {
        world: "event",
        domain: "trigger",
      },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.eventExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  eventInputSlot(slot: ValueSlot, type: TypeDesc): EventExprId {
    const id = this.allocEventExprId();
    this.eventExprs.push({
      kind: "eventInputSlot",
      type,
      slot,
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.eventExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  eventMerge(sources: readonly EventExprId[], outputType: TypeDesc): EventExprId {
    const id = this.allocEventExprId();
    this.eventExprs.push({
      kind: "eventMerge",
      type: outputType,
      sources: [...sources],
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.eventExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  eventCombine(
    busIndex: BusIndex,
    terms: readonly EventExprId[],
    mode: EventCombineMode,
    outputType: TypeDesc
  ): EventExprId {
    const id = this.allocEventExprId();
    this.eventExprs.push({
      kind: "eventBusCombine",
      type: outputType,
      busIndex,
      terms: [...terms],
      combine: { mode },
    });

    // Track source block for debug index
    if (this.currentBlockId) {
      this.eventExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  // =============================================================================
  // Domain
  // =============================================================================

  domainFromN(n: number): ValueSlot {
    // Allocate a value slot for the domain
    const slot = this.allocValueSlot();

    // Track the domain definition for runtime initialization
    this.domains.push({ slot, count: n });

    return slot;
  }

  domainFromSVG(svgPath: string, sampleCount: number): ValueSlot {
    // Allocate a value slot for the domain
    const slot = this.allocValueSlot();

    // Track the domain definition for runtime initialization
    // Include svgPath so the runtime can sample the SVG
    this.domains.push({ slot, count: sampleCount, svgPath });

    return slot;
  }


  // =============================================================================
  // Transforms
  // =============================================================================

  transformChain(steps: readonly TransformStepIR[], outputType: TypeDesc): TransformChainId {
    const id = this.transformChains.length;
    this.transformChains.push({
      steps,
      outputType,
    });
    return id;
  }

  // =============================================================================
  // Render Sinks
  // =============================================================================

  renderSink(sinkType: string, inputs: Record<string, ValueSlot>): void {
    this.renderSinks.push({
      sinkType,
      inputs,
    });
  }

  // =============================================================================
  // Camera Support (3D)
  // =============================================================================

  addCamera(camera: CameraIR): number {
    const index = this.cameras.length;
    this.cameras.push(camera);
    return index;
  }

  getCameras(): readonly CameraIR[] {
    return this.cameras;
  }

  getConstPool(): readonly unknown[] {
    return this.constPool;
  }

  // =============================================================================
  // Finalization
  // =============================================================================

  build(): BuilderProgramIR {
    return {
      signalIR: {
        nodes: this.sigExprs,
      },
      fieldIR: {
        nodes: this.fieldExprs,
      },
      eventIR: {
        nodes: this.eventExprs,
      },
      constants: this.constPool,
      stateLayout: this.stateLayout,
      transformChains: this.transformChains,
      renderSinks: this.renderSinks,
      domains: this.domains,
      cameras: this.cameras,
      debugIndex: {
        sigExprSource: this.sigExprSourceMap,
        fieldExprSource: this.fieldExprSourceMap,
        eventExprSource: this.eventExprSourceMap,
        slotSource: this.slotSourceMap,
      },
      timeModel: this.timeModel ?? {
        kind: "infinite",
        windowMs: 30000,
      },
      slotMeta: this.slotMetaEntries,
      sigValueSlots: this.sigValueSlots,
      fieldValueSlots: this.fieldValueSlots,
      eventValueSlots: this.eventValueSlots,
      nextValueSlot: this.nextValueSlot,
      timeSlots: this.timeSlots,
    };
  }
}
