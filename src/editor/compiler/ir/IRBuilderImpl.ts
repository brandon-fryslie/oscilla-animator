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
import { getTypeArity } from "./types";
import type { SignalExprIR, StatefulSignalOp, EventExprIR, EventCombineMode } from "./signalExpr";
import type { FieldExprIR } from "./fieldExpr";
import type { TransformStepIR, PureFnRef } from "./transforms";
import type {
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
  setCurrentBlockId(blockId: string | undefined): void {
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
  // ID Allocation
  // =============================================================================

  allocSigExprId(): SigExprId {
    return this.sigExprs.length;
  }

  allocFieldExprId(): FieldExprId {
    return this.fieldExprs.length;
  }

  allocStateId(type: TypeDesc, initial?: unknown, debugName?: string): StateId {
    return this.allocState(type, initial, debugName);
  }

  allocConstId(value: unknown): number {
    return this.addConst(value);
  }

  /**
   * Allocate value slot(s) respecting bundle arity.
   *
   * Sprint 2: Bundle type system
   * - Scalar types (arity=1) allocate 1 slot
   * - Bundle types (arity>1) allocate N consecutive slots
   * - Example: vec2 at slot 5 uses slots [5, 6]
   * - Example: vec3 at slot 7 uses slots [7, 8, 9]
   *
   * @param type - Type descriptor (determines bundle arity)
   * @param debugName - Optional debug name for slot metadata
   * @returns Starting slot index (bundles use [slot, slot+arity))
   */
  allocValueSlot(type?: TypeDesc, debugName?: string): ValueSlot {
    const slot = this.nextValueSlot;

    // Get bundle arity (defaults to 1 for scalar)
    const arity = type !== undefined ? getTypeArity(type) : 1;

    // Allocate N consecutive slots for bundle types
    this.nextValueSlot += arity;

    // Register slot metadata if type provided
    if (type !== undefined) {
      const storage = inferStorage(type);
      this.slotMetaEntries.push({
        slot,
        storage,
        type,
        debugName,
      });
    }

    return slot;
  }

  registerSigSlot(sigId: SigExprId, slot: ValueSlot): void {
    while (this.sigValueSlots.length <= sigId) {
      this.sigValueSlots.push(undefined);
    }
    this.sigValueSlots[sigId] = slot;
  }

  registerFieldSlot(fieldId: FieldExprId, slot: ValueSlot): void {
    while (this.fieldValueSlots.length <= fieldId) {
      this.fieldValueSlots.push(undefined);
    }
    this.fieldValueSlots[fieldId] = slot;
  }

  // =============================================================================
  // Time Model and Slots
  // =============================================================================

  setTimeModel(timeModel: TimeModelIR): void {
    this.timeModel = timeModel;
  }

  setTimeSlots(slots: TimeSlots): void {
    this.timeSlots = slots;
  }

  getTimeSlots(): TimeSlots | undefined {
    return this.timeSlots;
  }

  // =============================================================================
  // Constant Pool
  // =============================================================================

  private addConst(value: unknown): number {
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
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "const",
      constId,
      type,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigTimeAbsMs(): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "timeAbsMs",
      type: { world: "signal", domain: "timeMs" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigTimeModelMs(): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "timeModelMs",
      type: { world: "signal", domain: "float" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigPhase01(): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "phase01",
      type: { world: "signal", domain: "float", semantics: "phase(0..1)" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigWrapEvent(): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "wrapEvent",
      type: { world: "event", domain: "trigger" },
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigMap(src: SigExprId, fn: PureFnRef, outputType: TypeDesc): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "map",
      src,
      fn,
      type: outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef, outputType: TypeDesc): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "zip",
      a,
      b,
      fn,
      type: outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigSelect(cond: SigExprId, t: SigExprId, f: SigExprId, outputType: TypeDesc): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "select",
      cond,
      t,
      f,
      type: outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigTransform(src: SigExprId, chain: TransformChainId): SigExprId {
    const id = this.sigExprs.length;
    const chainDef = this.transformChains[chain];
    if (chainDef === undefined) {
      throw new Error(`Transform chain ${chain} not found`);
    }
    this.sigExprs.push({
      kind: "transform",
      src,
      chain,
      type: chainDef.outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigCombine(
    busIndex: BusIndex,
    terms: readonly SigExprId[],
    mode: "sum" | "average" | "max" | "min" | "last",
    outputType: TypeDesc
  ): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "busCombine",
      busIndex,
      terms: [...terms],
      combine: { mode },
      type: outputType,
    });
    this.trackSigExprSource(id);
    return id;
  }

  sigStateful(
    op: StatefulSignalOp,
    input: SigExprId,
    stateId: StateId,
    outputType: TypeDesc,
    params?: Record<string, number>
  ): SigExprId {
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: "stateful",
      op,
      input,
      stateId,
      type: outputType,
      params,
    });
    this.trackSigExprSource(id);
    return id;
  }

  // =============================================================================
  // Field Expression Builders
  // =============================================================================

  fieldConst(value: unknown, type: TypeDesc): FieldExprId {
    const constId = this.addConst(value);
    const id = this.fieldExprs.length;
    this.fieldExprs.push({
      kind: "const",
      constId,
      type,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  broadcastSigToField(sig: SigExprId, domainSlot: ValueSlot, outputType: TypeDesc): FieldExprId {
    const id = this.fieldExprs.length;
    this.fieldExprs.push({
      kind: "broadcastSig",
      sig,
      domainSlot,
      type: outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldMap(src: FieldExprId, fn: PureFnRef, outputType: TypeDesc, params?: Record<string, unknown>): FieldExprId {
    const id = this.fieldExprs.length;
    this.fieldExprs.push({
      kind: "map",
      src,
      fn,
      params,
      type: outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldZip(a: FieldExprId, b: FieldExprId, fn: PureFnRef, outputType: TypeDesc, params?: Record<string, unknown>): FieldExprId {
    const id = this.fieldExprs.length;
    this.fieldExprs.push({
      kind: "zip",
      a,
      b,
      fn,
      params,
      type: outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldSelect(cond: FieldExprId, t: FieldExprId, f: FieldExprId, outputType: TypeDesc): FieldExprId {
    const id = this.fieldExprs.length;
    this.fieldExprs.push({
      kind: "select",
      cond,
      t,
      f,
      type: outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldTransform(src: FieldExprId, chain: TransformChainId): FieldExprId {
    const id = this.fieldExprs.length;
    const chainDef = this.transformChains[chain];
    if (chainDef === undefined) {
      throw new Error(`Transform chain ${chain} not found`);
    }
    this.fieldExprs.push({
      kind: "transform",
      src,
      chain,
      type: chainDef.outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  fieldCombine(
    busIndex: BusIndex,
    terms: readonly FieldExprId[],
    mode: "sum" | "average" | "max" | "min" | "last" | "product",
    outputType: TypeDesc
  ): FieldExprId {
    const id = this.fieldExprs.length;
    this.fieldExprs.push({
      kind: "busCombine",
      busIndex,
      terms: [...terms],
      combine: { mode },
      type: outputType,
    });
    this.trackFieldExprSource(id);
    return id;
  }

  reduceFieldToSig(field: FieldExprId, fn: ReduceFn): SigExprId {
    // Field-to-signal reduction is implemented as a signal expression
    // that references the field (this will be handled in the runtime)
    const id = this.sigExprs.length;
    // TEMPORARY: Use closureBridge until proper reduce node is added
    // This is a placeholder that will need proper implementation
    this.sigExprs.push({
      kind: "closureBridge",
      type: fn.outputType,
      closureId: `reduce_${field}`,
      inputSlots: [],
    });
    this.trackSigExprSource(id);
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
    if (this.currentBlockId !== undefined) {
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
    if (this.currentBlockId !== undefined) {
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
    if (this.currentBlockId !== undefined) {
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
    if (this.currentBlockId !== undefined) {
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
    if (this.currentBlockId !== undefined) {
      this.eventExprSourceMap.set(id, this.currentBlockId);
    }

    return id;
  }

  // =============================================================================
  // State Management
  // =============================================================================

  private allocState(type: TypeDesc, initial?: unknown, debugName?: string): StateId {
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

  transformChain(steps: readonly TransformStepIR[], outputType: TypeDesc): TransformChainId {
    const chainId = this.transformChains.length;
    this.transformChains.push({
      steps: [...steps],
      outputType,
    });
    return chainId;
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
  // Domains
  // =============================================================================

  domainFromN(n: number): ValueSlot {
    const slot = this.allocValueSlot({ world: "scalar", domain: "domain" }, `domain_n${n}`);
    this.domains.push({
      slot,
      count: n,
    });
    return slot;
  }

  domainFromSVG(svgRef: string, sampleCount: number): ValueSlot {
    const slot = this.allocValueSlot(
      { world: "scalar", domain: "domain" },
      `domain_svg_${svgRef}`
    );
    this.domains.push({
      slot,
      count: sampleCount,
      svgPath: svgRef,
    });
    return slot;
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
  // Internal Methods (used by old code, will be removed)
  // =============================================================================

  /** @deprecated Use registerSigSlot instead */
  registerSigValueSlot(sigId: SigExprId, slot: ValueSlot): void {
    this.registerSigSlot(sigId, slot);
  }

  /** @deprecated Use registerFieldSlot instead */
  registerFieldValueSlot(fieldId: FieldExprId, slot: ValueSlot): void {
    this.registerFieldSlot(fieldId, slot);
  }

  /** @deprecated Use renderSink instead */
  addRenderSink(sinkType: string, inputs: Record<string, ValueSlot>): void {
    this.renderSink(sinkType, inputs);
  }

  /** @deprecated Use transformChain instead */
  createTransformChain(steps: readonly TransformStepIR[], outputType: TypeDesc): TransformChainId {
    return this.transformChain(steps, outputType);
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
