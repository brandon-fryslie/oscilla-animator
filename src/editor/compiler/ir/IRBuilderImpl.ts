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
  ValueSlot,
  StateId,
  TransformChainId,
  BusIndex,
} from "./types";
import type { SignalExprIR, StatefulSignalOp } from "./signalExpr";
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
} from "./builderTypes";

/**
 * Implementation of IRBuilder.
 */
export class IRBuilderImpl implements IRBuilder {
  // Tables for IR nodes
  private sigExprs: SignalExprIR[] = [];
  private fieldExprs: FieldExprIR[] = [];
  private stateLayout: StateLayoutEntry[] = [];
  private transformChains: BuilderTransformChain[] = [];
  private renderSinks: RenderSinkIR[] = [];
  private domains: DomainDefIR[] = [];

  // Constant pool with deduplication
  private constPool: unknown[] = [];
  private constMap: Map<string, number> = new Map();

  // Value slot counter
  private nextValueSlot = 0;

  // =============================================================================
  // ID Allocation
  // =============================================================================

  allocSigExprId(): SigExprId {
    return this.sigExprs.length as SigExprId;
  }

  allocFieldExprId(): FieldExprId {
    return this.fieldExprs.length as FieldExprId;
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

  allocValueSlot(): ValueSlot {
    return this.nextValueSlot++ as ValueSlot;
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
    });
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
    });
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

  domainFromSVG(_svgRef: string, _sampleCount: number): ValueSlot {
    // Allocate a value slot for the domain
    // The actual SVG sampling will be handled by the runtime
    return this.allocValueSlot();
  }

  // =============================================================================
  // Transforms
  // =============================================================================

  transformChain(steps: readonly TransformStepIR[], outputType: TypeDesc): TransformChainId {
    const id = this.transformChains.length as TransformChainId;
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
      constants: this.constPool,
      stateLayout: this.stateLayout,
      transformChains: this.transformChains,
      renderSinks: this.renderSinks,
      domains: this.domains,
      debugIndex: {
        sigExprSource: new Map(),
        fieldExprSource: new Map(),
        slotSource: new Map(),
      },
      timeModel: {
        kind: "infinite",
        windowMs: 30000,
      },
    };
  }
}
