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
   * @param blockId - The ID of the block being lowered
   */
  setCurrentBlockId(blockId: string): void {
    this.currentBlockId = blockId;
  }

  /**
   * Track that a signal expression originated from a specific block.
   *
   * @param sigId - Signal expression ID
   */
  private trackSigExprSource(sigId: SigExprId): void {
    if (this.currentBlockId !== undefined) {
      this.sigExprSourceMap.set(sigId, this.currentBlockId);
    }
  }

  /**
   * Track that a field expression originated from a specific block.
   *
   * @param fieldId - Field expression ID
   */
  private trackFieldExprSource(fieldId: FieldExprId): void {
    if (this.currentBlockId !== undefined) {
      this.fieldExprSourceMap.set(fieldId, this.currentBlockId);
    }
  }

  /**
   * Track that a value slot originated from a specific block port.
   *
   * @param slot - Value slot
   * @param slotId - Port ID (e.g., 'output', 'value')
   */
  trackSlotSource(slot: ValueSlot, slotId: string): void {
    if (this.currentBlockId !== undefined) {
      this.slotSourceMap.set(slot, {
        blockId: this.currentBlockId,
        slotId,
      });
    }
  }

  // =============================================================================
  // Slot Management
  // =============================================================================

  allocValueSlot(type: TypeDesc, debugName?: string): ValueSlot {
    const slot = this.nextValueSlot++;

    // Register slot metadata
    const storage = inferStorage(type);
    this.slotMetaEntries.push({
      slot,
      storage,
      type,
      debugName,
    });

    return slot;
  }

  registerSigValueSlot(sigId: SigExprId, slot: ValueSlot): void {
    while (this.sigValueSlots.length <= sigId) {
      this.sigValueSlots.push(undefined);
    }
    this.sigValueSlots[sigId] = slot;
  }

  registerFieldValueSlot(fieldId: FieldExprId, slot: ValueSlot): void {
    while (this.fieldValueSlots.length <= fieldId) {
      this.fieldValueSlots.push(undefined);
    }
    this.fieldValueSlots[fieldId] = slot;
  }

  // =============================================================================
  // Time Slots (from TimeRoot lowering)
  // =============================================================================

  setTimeSlots(slots: TimeSlots): void {
    this.timeSlots = slots;
  }

  getTimeSlots(): TimeSlots | undefined {
    return this.timeSlots;
  }

  // =============================================================================
  // Constant Pool
  // =============================================================================

  addConst(value: unknown): number {
    const key = JSON.stringify(value);
    const existing = this.constMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const index = this.constPool.length;
    this.constPool.push(value);
    this.constMap.set(key, index);
    return index;
  }

  // =============================================================================
  // Signal Expression Builders
  // =============================================================================

  sigConst(value: number, type: TypeDesc): SigExprId {
    const constId = this.addConst(value);
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "const",
      constId,
      type,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigTimeAbsMs(): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "timeAbsMs",
      type: { world: "signal", domain: "number" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigTimeModelMs(): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "timeModelMs",
      type: { world: "signal", domain: "number" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigPhase01(): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "phase01",
      type: { world: "signal", domain: "number" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigWrapEvent(): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "wrapEvent",
      type: { world: "event", domain: "trigger" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigBusRead(busIndex: BusIndex, type: TypeDesc): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "busRead",
      busIndex,
      type,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigMap(inputId: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "map",
      inputId,
      fn,
      type: fn.outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigZip(inputIds: readonly SigExprId[], fn: PureFnRef): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "zip",
      inputIds: [...inputIds],
      fn,
      type: fn.outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigStateful(
    inputIds: readonly SigExprId[],
    stateId: StateId,
    op: StatefulSignalOp,
    type: TypeDesc
  ): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "stateful",
      inputIds: [...inputIds],
      stateId,
      op,
      type,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigReduce(fieldId: FieldExprId, fn: ReduceFn): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "reduce",
      fieldId,
      fn,
      type: fn.outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigSlot(slot: ValueSlot, type: TypeDesc): SigExprId {
    const id = this.sigExprs.length as SigExprId;
    this.sigExprs.push({
      kind: "slot",
      slot,
      type,
    });
    this.trackSigExprSource(id);
    return id;
  }

  // =============================================================================
  // Field Expression Builders
  // =============================================================================

  fieldConst(value: unknown, type: TypeDesc): FieldExprId {
    const constId = this.addConst(value);
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "const",
      constId,
      type,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldLift(sigId: SigExprId, type: TypeDesc): FieldExprId {
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "lift",
      sigId,
      type,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldMap(inputId: FieldExprId, fn: PureFnRef): FieldExprId {
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "map",
      inputId,
      fn,
      type: fn.outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldZip(inputIds: readonly FieldExprId[], fn: PureFnRef): FieldExprId {
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "zip",
      inputIds: [...inputIds],
      fn,
      type: fn.outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldTransform(inputId: FieldExprId, chainId: TransformChainId, type: TypeDesc): FieldExprId {
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "transform",
      inputId,
      chainId,
      type,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldSample(
    domainSlot: ValueSlot,
    channelId: FieldExprId,
    type: TypeDesc
  ): FieldExprId {
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "sample",
      domainSlot,
      channelId,
      type,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldSlot(slot: ValueSlot, type: TypeDesc): FieldExprId {
    const id = this.fieldExprs.length as FieldExprId;
    this.fieldExprs.push({
      kind: "slot",
      slot,
      type,
    });
    this.trackFieldExprSource(id);
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
  // State Management
  // =============================================================================

  allocState(type: TypeDesc, initial?: unknown, debugName?: string): StateId {
    const stateId = `state_${this.stateLayout.length}`;
    this.stateLayout.push({
      stateId,
      type,
      initial,
      debugName,
    });
    return stateId;
  }

  // =============================================================================
  // Transform Chains
  // =============================================================================

  createTransformChain(steps: readonly TransformStepIR[], outputType: TypeDesc): TransformChainId {
    const chainId = this.transformChains.length as TransformChainId;
    this.transformChains.push({
      steps: [...steps],
      outputType,
    });
    return chainId;
  }

  // =============================================================================
  // Render Sinks
  // =============================================================================

  addRenderSink(sinkType: string, inputs: Record<string, ValueSlot>): void {
    this.renderSinks.push({
      sinkType,
      inputs,
    });
  }

  // =============================================================================
  // Domains
  // =============================================================================

  addDomain(slot: ValueSlot, count: number, svgPath?: string): void {
    this.domains.push({
      slot,
      count,
      svgPath,
    });
  }

  // =============================================================================
  // Cameras (3D)
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
