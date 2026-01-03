/**
 * Build Schedule - Convert BuilderProgramIR to CompiledProgramIR
 *
 * Transforms the output of IRBuilder into an executable schedule.
 *
 * Current schedule structure:
 * 1. StepTimeDerive - derive time signals from tAbsMs
 * 2. StepSignalEval - evaluate signal outputs to slots
 * 3. StepMaterialize* - materialize fields to buffers (color, geometry, paths)
 * 4. StepInstances3DProjectTo2D - project 3D instances to 2D (optional)
 * 5. StepRenderAssemble - final render tree assembly
 *
 * KNOWN GAPS:
 * - StepBusEval is NOT emitted (busRoots from pass7 not threaded through BuilderProgramIR)
 * - StepMaterializeTestGeometry is still used as fallback for geometry
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md
 * - design-docs/12-Compiler-Final/Compiler-Audit-RedFlags-Schedule-and-Runtime.md
 * - design-docs/13-Renderer/07-3d-Canonical.md (§7.2 - 3D projection)
 */

import type { BuilderProgramIR, RenderSinkIR, StateLayoutEntry } from "./builderTypes";
import type {
  CompiledProgramIR,
  FieldExprTable,
  StateLayout,
  StateCellLayout,
  ScheduleIR,
  StepIR,
  StepDebugProbe,
  OutputSpecIR,
  SlotMetaEntry,
  RenderIR,
  DebugIndexIR,
  TypeTable,
  ValueSlot,
  Instance2DBatch,
  PathBatch,
} from "./index";
// Note: randomUUID was used in legacy schema but removed for canonical CompiledProgramIR
import type { StepInstances3DProjectTo2D } from "../../runtime/executor/steps/executeInstances3DProject";
import type { CameraTable, CameraId, CameraIR, MeshTable } from "./types3d";
import { DEFAULT_CAMERA_IR } from "./types3d";
import type { StateId } from "./types";
import type { SignalExprIR, SignalExprTable } from "./signalExpr";
import type { EventExprTable } from "./signalExpr";
import type { TypeDesc } from "./types";
import { createTypeDesc } from "./types";

/**
 * Debug configuration for schedule building.
 *
 * Controls insertion of debug probe steps into the schedule.
 */
export interface ScheduleDebugConfig {
  /**
   * Probe mode:
   * - 'off': No debug probes inserted (default)
   * - 'basic': Insert probes after key evaluation steps (time, bus, signals)
   * - 'full': Insert probes after every significant step
   */
  probeMode: 'off' | 'basic' | 'full';
}

/**
 * Domain handle - stored in ValueStore to represent a domain.
 * Contains the element count for materialization steps.
 */
interface DomainHandle {
  kind: "domain";
  count: number;
  elementIds?: readonly string[];
}

// Note: Instance2DBatchDescriptor, Instance2DBatchList, PathBatchList, and
// PathBatchDescriptor were moved to compile-time config embedded in the step,
// not slot values. See 12-ValueSlotPerNodeOutput.md

// ============================================================================
// Camera Selection (design-docs/13-Renderer/07-3d-Canonical.md)
// ============================================================================

/**
 * Result of camera selection logic.
 */
interface CameraSelectionResult {
  /** Camera table for the compiled program */
  cameraTable: CameraTable;
  /** Default camera ID (always present) */
  defaultCameraId: CameraId;
}

/**
 * Build camera table with selection semantics.
 *
 * Camera selection rules:
 * - 0 cameras → inject implicit '__default__' camera
 * - 1 camera → that camera is the default
 * - N cameras → first by creation order is default
 */
function buildCameraSelection(cameras: readonly CameraIR[]): CameraSelectionResult {
  // Case 1: No cameras - inject implicit default
  if (cameras.length === 0) {
    const implicitCamera: CameraIR = {
      ...DEFAULT_CAMERA_IR,
      id: "__default__",
    };
    return {
      cameraTable: {
        cameras: [implicitCamera],
        cameraIdToIndex: { "__default__": 0 },
      },
      defaultCameraId: "__default__",
    };
  }

  // Case 2+: Use first camera as default
  const cameraIdToIndex: Record<CameraId, number> = {};
  for (let i = 0; i < cameras.length; i++) {
    cameraIdToIndex[cameras[i].id] = i;
  }

  return {
    cameraTable: {
      cameras: [...cameras],
      cameraIdToIndex,
    },
    defaultCameraId: cameras[0].id,
  };
}

// ============================================================================
// State Offset Resolution (Sprint 1)
// ============================================================================

/**
 * Resolve state IDs to numeric offsets in SignalExprStateful nodes.
 *
 * This mutates the signal nodes in-place, adding params.stateOffset to each
 * stateful node based on the stateId → offset mapping from stateLayout.
 *
 * Sprint 1: State ID Resolution in buildSchedule
 * References:
 * - .agent_planning/signal-runtime-stateful/PLAN-2025-12-30-031559.md
 * - .agent_planning/signal-runtime-stateful/DOD-2025-12-30-031559.md Sprint 1
 *
 * @param signalNodes - Mutable array of signal IR nodes
 * @param stateLayout - State layout entries from IRBuilder
 * @throws Error if stateful node references undeclared stateId
 */
function resolveStateOffsets(
  signalNodes: SignalExprIR[],
  stateLayout: readonly StateLayoutEntry[]
): void {
  // Build stateId → offset map
  const stateOffsetMap = new Map<StateId, number>();
  stateLayout.forEach((entry, idx) => {
    stateOffsetMap.set(entry.stateId, idx);
  });

  // Patch SignalExprStateful nodes
  for (const node of signalNodes) {
    if (node.kind === 'stateful') {
      const offset = stateOffsetMap.get(node.stateId);
      if (offset === undefined) {
        throw new Error(
          `StateRefMissingDecl: stateful node references unknown stateId '${node.stateId}'. ` +
          `Available state IDs: ${Array.from(stateOffsetMap.keys()).join(', ')}`
        );
      }
      // Patch params with stateOffset
      node.params = { ...node.params, stateOffset: offset };
    }
  }
}

/**
 * Convert BuilderProgramIR to CompiledProgramIR.
 *
 * Creates a minimal but valid CompiledProgramIR with a basic execution schedule.
 * This enables the IR pipeline to work end-to-end without implementing the full
 * scheduler/optimizer.
 */
export function buildCompiledProgram(
  builderIR: BuilderProgramIR,
  patchId: string,
  _patchRevision: number,  // Legacy param, not in canonical schema
  seed: number,
  debugConfig?: ScheduleDebugConfig,
): CompiledProgramIR {
  // Create empty type table (will be populated as we implement more passes)
  const emptyTypeTable: TypeTable = { typeIds: [] };

  // Build expression tables from builder IR
  const signalExprs: SignalExprTable = { nodes: builderIR.signalIR.nodes.map(node => ({ ...node })) };
  const fieldExprs: FieldExprTable = { nodes: Array.from(builderIR.fieldIR.nodes) };
  const eventExprs: EventExprTable = { nodes: Array.from(builderIR.eventIR.nodes) };

  // SPRINT 1: Resolve state offsets before building schedule
  // This patches SignalExprStateful nodes with params.stateOffset
  resolveStateOffsets(signalExprs.nodes, builderIR.stateLayout);

  // Convert constants to canonical format (JSON-only)
  const constants: { readonly json: readonly unknown[] } = {
    json: Array.from(builderIR.constants),
  };

  // Convert state layout
  const stateLayout: StateLayout = {
    cells: builderIR.stateLayout.map((entry, idx): StateCellLayout => ({
      stateId: entry.stateId,
      storage: "f64" as const, // Default to f64 for now
      offset: idx,
      size: 1, // Single value per state cell for now
      nodeId: `node_${idx}`, // Placeholder
      role: "accumulator", // Default role
      initialConstId: entry.initial !== undefined ? 0 : undefined,
    })),
    f64Size: builderIR.stateLayout.length,
    f32Size: 0,
    i32Size: 0,
  };

  // Build schedule (now processes render sinks) and collect additional slotMeta
  const { schedule, frameOutSlot, scheduleSlotMeta } = buildSchedule(builderIR, { debugConfig });

  // Build camera table with selection semantics
  const { cameraTable, defaultCameraId } = buildCameraSelection(builderIR.cameras);

  // Create outputs that reference the frame output slot (canonical OutputSpecIR)
  const outputs: readonly OutputSpecIR[] = frameOutSlot !== undefined
    ? [{
        kind: "renderFrame" as const,
        slot: frameOutSlot,
      }]
    : [];

  // Build render IR from builder's render sinks
  const render: RenderIR = {
    sinks: builderIR.renderSinks.map(sink => ({
      sinkType: sink.sinkType,
      inputs: sink.inputs,
    })),
  };

  // Build debug index from builder's debug tracking (mandatory in canonical schema)
  const debugIndex: DebugIndexIR = {
    stepToBlock: new Map(schedule.steps.map(s => [s.id, s.label ?? 'unknown'])),
    slotToBlock: new Map(builderIR.slotMeta.map(m => [m.slot, m.debugName ?? 'unknown'])),
    labels: new Map(),
  };

  // Empty mesh table (3D support)
  const emptyMeshTable: MeshTable = { meshes: [], meshIdToIndex: {} };

  // Convert SlotMetaEntry to canonical SlotMetaEntry format (add offset = slot for dense allocation)
  // Merge builder's slotMeta with schedule-allocated slotMeta
  const slotMeta: readonly SlotMetaEntry[] = [
    ...builderIR.slotMeta.map((entry): SlotMetaEntry => ({
      slot: entry.slot,
      storage: entry.storage,
      offset: entry.slot, // Dense allocation: offset = slot index
      type: entry.type,
      debugName: entry.debugName,
    })),
    ...scheduleSlotMeta,
  ];

  return {
    irVersion: 1,
    patchId,
    seed,
    timeModel: builderIR.timeModel,
    types: emptyTypeTable,
    signalExprs,
    fieldExprs,
    eventExprs,
    constants,
    stateLayout,
    slotMeta,
    render,
    cameras: cameraTable,
    meshes: emptyMeshTable,
    primaryCameraId: defaultCameraId,
    schedule,
    outputs,
    debugIndex,
  };
}

/**
 * Slot allocator - tracks next available slot AND slotMeta entries.
 */
class SlotAllocator {
  private nextSlot: number;
  private readonly metaEntries: SlotMetaEntry[] = [];

  constructor(startSlot = 0) {
    this.nextSlot = startSlot;
  }

  /**
   * Allocate a new slot with slotMeta.
   *
   * This ensures every schedule-allocated slot has metadata for ValueStore.
   *
   * @param type - TypeDesc for the slot
   * @param debugName - Debug label for the slot
   * @returns Allocated ValueSlot
   */
  allocWithMeta(type: TypeDesc, debugName: string): ValueSlot {
    const slot = this.nextSlot++;

    this.metaEntries.push({
      slot,
      storage: "object", // Schedule slots are always object storage
      offset: slot,
      type,
      debugName,
    });

    return slot;
  }

  /**
   * Legacy alloc without meta (for compatibility during migration).
   * DO NOT USE for new code - use allocWithMeta instead.
   */
  alloc(): ValueSlot {
    return this.nextSlot++;
  }

  peek(): number {
    return this.nextSlot;
  }

  /**
   * Get all collected SlotMetaEntry records.
   */
  getSlotMeta(): readonly SlotMetaEntry[] {
    return this.metaEntries;
  }
}

/**
 * Result of buildSchedule including the schedule and output slot references.
 */
interface BuildScheduleResult {
  schedule: ScheduleIR;
  frameOutSlot: ValueSlot | undefined;
  scheduleSlotMeta: readonly SlotMetaEntry[];
}

/**
 * Options for buildSchedule.
 */
interface BuildScheduleOptions {
  /** Debug configuration (optional) */
  debugConfig?: ScheduleDebugConfig;
}

/**
 * Build a basic execution schedule.
 *
 * The schedule is minimal but follows the correct evaluation order:
 * 1. Time derivation
 * 2. Bus evaluation (if any)
 * 3. Field materialization (color, path, etc.)
 * 4. 3D projection (instances3d sinks)
 * 5. Geometry materialization (test data for now)
 * 6. Render assembly
 *
 * Per design-docs/13-Renderer/12-ValueSlotPerNodeOutput.md:
 * - Lowering allocates all output slots (including time slots from TimeRoot)
 * - Schedule only orders and allocates buffers (materialization outputs + frame slot)
 *
 * Debug Probe Insertion (Phase 7):
 * - probeMode='off': No probes (default, zero overhead)
 * - probeMode='basic': Probes after time derive and signal eval steps
 * - probeMode='full': Probes after every significant step
 *
 * Schedule Slot Meta (Workstream 01):
 * - All schedule-allocated slots get SlotMetaEntry with object storage
 * - Materialization buffer slots: domain "matBuffer"
 * - Frame output slot: domain "renderFrame"
 * - Validation ensures no slot is used without slotMeta
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §A2
 * - design-docs/13-Renderer/12-ValueSlotPerNodeOutput.md
 * - .agent_planning/debugger/PLAN-2025-12-27-005641.md (Phase 7 Debug Infrastructure)
 * - .agent_planning/compiler-migration-workstreams (Workstream 01)
 */
function buildSchedule(
  builderIR: BuilderProgramIR,
  options?: BuildScheduleOptions,
): BuildScheduleResult {
  console.log('[buildSchedule] Starting with:', {
    renderSinkCount: builderIR.renderSinks.length,
    renderSinkTypes: builderIR.renderSinks.map(s => s.sinkType),
    domainCount: builderIR.domains.length,
  });
  const steps: StepIR[] = [];
  const slots = new SlotAllocator(builderIR.nextValueSlot ?? 0);
  const probeMode = options?.debugConfig?.probeMode ?? 'off';
  let probeCounter = 0;
  const initialSlotValues: Record<number, unknown> = {};

  /**
   * Insert a debug probe step after a preceding step.
   * Only inserts if probeMode is not 'off'.
   *
   * @param category - Category for probe ID (e.g., 'time', 'signal', 'bus')
   * @param precedingStepId - ID of the step this probe follows
   * @param slotsToProbe - Slots to capture values from
   */
  const maybeInsertProbe = (
    category: string,
    precedingStepId: string,
    slotsToProbe: ValueSlot[],
  ): void => {
    if (probeMode === 'off' || slotsToProbe.length === 0) {
      return;
    }

    const probeId = `probe:${category}:${probeCounter++}`;
    const probe: StepDebugProbe = {
      kind: 'debugProbe',
      id: `step-${probeId}`,
      deps: [precedingStepId],
      probe: {
        id: probeId,
        slots: slotsToProbe,
        mode: 'value',
      },
    };
    steps.push(probe);
  };

  const sigSlotToId = new Map<ValueSlot, number>();
  builderIR.sigValueSlots.forEach((slot, sigId) => {
    if (slot !== undefined) {
      sigSlotToId.set(slot, sigId);
    }
  });

  const fieldSlotToId = new Map<ValueSlot, number>();
  builderIR.fieldValueSlots.forEach((slot, fieldId) => {
    if (slot !== undefined) {
      fieldSlotToId.set(slot, fieldId);
    }
  });

  // Time slots come from lowering (TimeRoot block allocates them)
  // If no TimeRoot was lowered, we fall back to local allocation with metadata
  const timeSlotType = createTypeDesc('signal', 'timeMs', 'internal', false);
  const timeSlots: import("./builderTypes").TimeSlots = builderIR.timeSlots ?? {
    // Fallback for patches without TimeRoot (allocate locally with metadata)
    systemTime: slots.allocWithMeta(timeSlotType, 'schedule:time-system'),
    tAbsMs: slots.allocWithMeta(timeSlotType, 'schedule:time-abs'),
    tModelMs: slots.allocWithMeta(timeSlotType, 'schedule:time-model'),
    progress01: slots.allocWithMeta(createTypeDesc('signal', 'float', 'core', false), 'schedule:time-progress'),
    phase01: undefined,
    wrapEvent: undefined,
  };

  const SLOT_T_ABS_MS = timeSlots.tAbsMs ?? timeSlots.systemTime;
  const SLOT_T_MODEL_MS = timeSlots.tModelMs ?? timeSlots.systemTime;
  const SLOT_PROGRESS_01 = timeSlots.progress01 ?? SLOT_T_MODEL_MS;

  // Allocate frame output slot with metadata
  // Per 12-ValueSlotPerNodeOutput.md: schedule allocates only:
  // - Materialization buffer slots (done in processInstances2DSink)
  // - Frame output slot
  // Batch lists are compile-time config embedded in the step, not slots
  const frameOutputType = createTypeDesc('config', 'renderFrame', 'internal', false);
  const SLOT_FRAME_OUT = slots.allocWithMeta(frameOutputType, 'schedule:frame-out');

  // Step 1: Time Derive
  // Use slots from lowering where available
  steps.push({
    kind: "timeDerive",
    id: "step-time-derive",
    deps: [],
    label: "Derive time signals",
    tAbsMsSlot: SLOT_T_ABS_MS,
    timeModel: builderIR.timeModel,
    out: {
      tModelMs: SLOT_T_MODEL_MS,
      progress01: SLOT_PROGRESS_01,
      phase01: timeSlots.phase01,
      wrapEvent: timeSlots.wrapEvent,
    },
  });

  // Debug probe after time derive (basic + full mode)
  {
    const timeSlotsToProbe: ValueSlot[] = [SLOT_T_MODEL_MS, SLOT_PROGRESS_01];
    if (timeSlots.phase01 !== undefined) timeSlotsToProbe.push(timeSlots.phase01);
    if (timeSlots.wrapEvent !== undefined) timeSlotsToProbe.push(timeSlots.wrapEvent);
    maybeInsertProbe('time', 'step-time-derive', timeSlotsToProbe);
  }

  // Step 1b: Signal Eval (write signal outputs to slots)
  const signalOutputs = builderIR.sigValueSlots
    .map((slot, sigId) => (slot !== undefined ? { sigId, slot } : null))
    .filter((entry): entry is { sigId: number; slot: ValueSlot } => entry !== null);

  if (signalOutputs.length > 0) {
    steps.push({
      kind: "signalEval",
      id: "step-signal-eval",
      deps: ["step-time-derive"],
      label: "Evaluate signals",
      outputs: signalOutputs,
    });

    // Debug probe after signal eval (basic + full mode)
    const signalSlots = signalOutputs.map(o => o.slot);
    maybeInsertProbe('signal', 'step-signal-eval', signalSlots);
  }

  // Step 2: Process render sinks and emit materialization steps
  // Batch descriptors are compile-time config, not slot values
  const instance2dBatches: Instance2DBatch[] = [];
  const pathBatches: PathBatch[] = [];
  const materializeStepIds: string[] = [];

  for (let sinkIdx = 0; sinkIdx < builderIR.renderSinks.length; sinkIdx++) {
    const sink = builderIR.renderSinks[sinkIdx];

    if (sink.sinkType === "instances2d") {
      const result = processInstances2DSink(
        sink,
        sinkIdx,
        slots,
        steps,
        sigSlotToId,
        fieldSlotToId,
      );
      instance2dBatches.push(result.batch);
      materializeStepIds.push(...result.stepIds);

      // In 'full' mode, add probes after each materialization step
      if (probeMode === 'full') {
        // Probe the output buffer slots from each materialization
        maybeInsertProbe('materialize', result.stepIds[result.stepIds.length - 1], [
          result.batch.posXYSlot,
          result.batch.colorRGBASlot,
        ]);
      }
    }
    if (sink.sinkType === "instances3d") {
      const result = processInstances3DSink(
        sink,
        sinkIdx,
        slots,
        steps,
        sigSlotToId,
        fieldSlotToId,
      );
      instance2dBatches.push(result.batch);
      materializeStepIds.push(...result.stepIds);

      // In 'full' mode, add probes after projection step
      if (probeMode === 'full') {
        maybeInsertProbe('projection', result.stepIds[result.stepIds.length - 1], [
          result.batch.posXYSlot,
          result.batch.colorRGBASlot,
        ]);
      }
    }
    if (sink.sinkType === "paths2d") {
      const result = processPaths2DSink(
        sink,
        sinkIdx,
        slots,
        steps,
        sigSlotToId,
        fieldSlotToId,
        initialSlotValues,
      );
      pathBatches.push(result.batch);
      materializeStepIds.push(...result.stepIds);
    }
  }

  // Step 3: Render Assemble
  // Depends on all materialization steps
  // Batch lists are embedded directly in the step (compile-time config)
  //
  // LIMITATION: Dependencies are based on step IDs, not slot-level analysis.
  // This is correct as long as steps are added in the order they are processed
  // above. A more robust approach would track which slots each step produces
  // and which slots renderAssemble consumes, then derive dependencies from
  // the slot producer/consumer relationship.
  // See: design-docs/12-Compiler-Final/Compiler-Audit-RedFlags-Schedule-and-Runtime.md
  const renderAssembleDeps = [
    "step-time-derive",
    ...(signalOutputs.length > 0 ? ["step-signal-eval"] : []),
    ...materializeStepIds,
  ];

  steps.push({
    kind: "renderAssemble",
    id: "step-render-assemble",
    deps: renderAssembleDeps,
    label: "Assemble render frame",
    instance2dBatches,
    pathBatches,
    outFrameSlot: SLOT_FRAME_OUT,
  });

  // Build step index map
  const stepIdToIndex: Record<string, number> = Object.fromEntries(
    steps.map((s, i) => [s.id, i])
  );

  // Create the schedule with initial slot values for batch lists
  const schedule: ScheduleIR = {
    steps,
    stepIdToIndex,
    deps: {
      slotProducerStep: {},
      slotConsumers: {},
    },
    determinism: {
      allowedOrderingInputs: [],
      topoTieBreak: "nodeIdLex",
    },
    caching: {
      stepCache: {},
      materializationCache: {},
    },
    // Initialize domain slots with Domain handles
    // Batch lists are now embedded in the renderAssemble step (compile-time config)
    initialSlotValues: {
      ...Object.fromEntries(
        builderIR.domains.map((d) => {
          const elementIds = (d as { elementIds?: readonly string[] }).elementIds;
          return [
            d.slot,
            {
              kind: "domain",
              count: d.count,
              elementIds,
            } as DomainHandle,
          ];
        })
      ),
      ...initialSlotValues,
    },
  };

  console.log('[buildSchedule] Done. Schedule has', steps.length, 'steps:', steps.map(s => s.kind));
  console.log('[buildSchedule] instance2dBatches:', instance2dBatches.length, 'pathBatches:', pathBatches.length);

  // Validate that all steps produce slots that have slotMeta
  validateScheduleSlotMeta(slots.getSlotMeta(), steps);

  return {
    schedule,
    frameOutSlot: SLOT_FRAME_OUT,
    scheduleSlotMeta: slots.getSlotMeta(),
  };
}

/**
 * Validate that all schedule step outputs have slotMeta.
 *
 * Throws a clear error if any step writes to a slot without metadata.
 * This is a fail-fast check during compilation to catch slot allocation bugs.
 *
 * @param slotMeta - Schedule-allocated slot metadata
 * @param steps - All schedule steps
 * @throws Error if a step output slot has no slotMeta
 */
function validateScheduleSlotMeta(
  slotMeta: readonly SlotMetaEntry[],
  steps: readonly StepIR[],
): void {
  const metaSlots = new Set(slotMeta.map(m => m.slot));

  for (const step of steps) {
    const outputSlots: ValueSlot[] = [];

    // Extract output slots based on step kind
    switch (step.kind) {
      case 'materialize':
        outputSlots.push(step.materialization.outBufferSlot);
        break;
      case 'materializeColor':
        outputSlots.push(step.outRSlot, step.outGSlot, step.outBSlot, step.outASlot);
        break;
      case 'materializePath':
        outputSlots.push(
          step.outCmdsSlot,
          step.outParamsSlot,
          step.outCmdStartSlot,
          step.outCmdLenSlot,
          step.outPointStartSlot,
          step.outPointLenSlot
        );
        break;
      case 'Instances3DProjectTo2D':
        outputSlots.push(step.outSlot);
        break;
      case 'renderAssemble':
        outputSlots.push(step.outFrameSlot);
        break;
      // Other step kinds don't allocate schedule slots
    }

    // Check each output slot has metadata
    for (const slot of outputSlots) {
      if (!metaSlots.has(slot)) {
        throw new Error(
          `ScheduleSlotMetaMissing: Step '${step.id}' (${step.kind}) writes to slot ${slot} ` +
          `without slotMeta. All schedule-allocated slots must have metadata.`
        );
      }
    }
  }
}

function materializeColorField(
  label: string,
  fieldSlot: ValueSlot | undefined,
  domainSlot: ValueSlot,
  sinkIdx: number,
  slots: SlotAllocator,
  steps: StepIR[],
  sigSlotToId: Map<ValueSlot, number>,
  fieldSlotToId: Map<ValueSlot, number>,
  stepIds: string[],
): ValueSlot | undefined {
  if (fieldSlot === undefined) {
    return undefined;
  }

  const fieldId = fieldSlotToId.get(fieldSlot);
  if (fieldId !== undefined) {
    const bufferType = createTypeDesc('config', 'matBuffer', 'internal', false);
    const outSlot = slots.allocWithMeta(bufferType, `schedule:mat-${label}-${sinkIdx}`);
    const stepId = `step-mat-${label}-${sinkIdx}`;
    steps.push({
      kind: "materialize",
      id: stepId,
      deps: ["step-time-derive"],
      label: `Materialize ${label} for sink ${sinkIdx}`,
      materialization: {
        id: `mat-${label}-${sinkIdx}`,
        fieldExprId: String(fieldId),
        domainSlot,
        outBufferSlot: outSlot,
        format: { components: 4, elementType: "u8" },
        policy: "perFrame",
      },
    });
    stepIds.push(stepId);
    return outSlot;
  }

  if (!sigSlotToId.has(fieldSlot)) {
    throw new Error(`processPaths2DSink: ${label} slot ${fieldSlot} has no signal or field expression`);
  }

  return fieldSlot;
}

function materializeScalarField(
  label: string,
  fieldSlot: ValueSlot | undefined,
  domainSlot: ValueSlot,
  sinkIdx: number,
  slots: SlotAllocator,
  steps: StepIR[],
  sigSlotToId: Map<ValueSlot, number>,
  fieldSlotToId: Map<ValueSlot, number>,
  stepIds: string[],
): ValueSlot | undefined {
  if (fieldSlot === undefined) {
    return undefined;
  }

  const fieldId = fieldSlotToId.get(fieldSlot);
  if (fieldId !== undefined) {
    const bufferType = createTypeDesc('config', 'matBuffer', 'internal', false);
    const outSlot = slots.allocWithMeta(bufferType, `schedule:mat-${label}-${sinkIdx}`);
    const stepId = `step-mat-${label}-${sinkIdx}`;
    steps.push({
      kind: "materialize",
      id: stepId,
      deps: ["step-time-derive"],
      label: `Materialize ${label} for sink ${sinkIdx}`,
      materialization: {
        id: `mat-${label}-${sinkIdx}`,
        fieldExprId: String(fieldId),
        domainSlot,
        outBufferSlot: outSlot,
        format: { components: 1, elementType: "f32" },
        policy: "perFrame",
      },
    });
    stepIds.push(stepId);
    return outSlot;
  }

  if (!sigSlotToId.has(fieldSlot)) {
    throw new Error(`processPaths2DSink: ${label} slot ${fieldSlot} has no signal or field expression`);
  }

  return fieldSlot;
}

/**
 * Process an instances2d render sink.
 * Allocates buffer slots and emits materializeColor step + test geometry step.
 *
 * Per 12-ValueSlotPerNodeOutput.md:
 * - Schedule allocates only materialization buffer slots (step outputs)
 * - Batch descriptor is compile-time config, not a slot value
 *
 * @returns Batch descriptor (compile-time config) and step IDs for dependencies
 */
function processInstances2DSink(
  sink: RenderSinkIR,
  sinkIdx: number,
  slots: SlotAllocator,
  steps: StepIR[],
  sigSlotToId: Map<ValueSlot, number>,
  fieldSlotToId: Map<ValueSlot, number>,
): { batch: Instance2DBatch; stepIds: string[] } {
  const stepIds: string[] = [];

  // Get input slots from sink
  const domainSlot = sink.inputs.domain;
  const colorSlot = sink.inputs.color;
  const positionsSlot = sink.inputs.positions;
  const radiusSlot = sink.inputs.radius;
  if (sink.inputs.opacity === undefined) {
    throw new Error("processInstances2DSink: missing opacity input");
  }
  const opacitySlot = sink.inputs.opacity;

  const positionsFieldId = fieldSlotToId.get(positionsSlot);
  if (positionsFieldId === undefined) {
    throw new Error(`processInstances2DSink: positions slot ${positionsSlot} has no field expression`);
  }

  const colorFieldId = fieldSlotToId.get(colorSlot);
  if (colorFieldId === undefined) {
    throw new Error(`processInstances2DSink: color slot ${colorSlot} has no field expression`);
  }

  const radiusSigId = sigSlotToId.get(radiusSlot);
  const radiusFieldId = fieldSlotToId.get(radiusSlot);
  if (radiusSigId === undefined && radiusFieldId === undefined) {
    throw new Error(`processInstances2DSink: radius slot ${radiusSlot} has no signal or field expression`);
  }

  // Allocate output buffer slots for positions and size/color with metadata
  const posBufferType = createTypeDesc('config', 'matBuffer', 'internal', false);
  const colorBufferType = createTypeDesc('config', 'matBuffer', 'internal', false);

  const posXYSlot = slots.allocWithMeta(posBufferType, `schedule:mat-pos-${sinkIdx}`);
  const sizeOutSlot = radiusFieldId !== undefined
    ? slots.allocWithMeta(posBufferType, `schedule:mat-size-${sinkIdx}`)
    : radiusSlot;
  const colorOutSlot = slots.allocWithMeta(colorBufferType, `schedule:mat-color-${sinkIdx}`);

  // Emit StepMaterialize for positions (vec2f32)
  const posStepId = `step-mat-pos-${sinkIdx}`;
  steps.push({
    kind: "materialize",
    id: posStepId,
    deps: ["step-time-derive"],
    label: `Materialize positions for sink ${sinkIdx}`,
    materialization: {
      id: `mat-pos-${sinkIdx}`,
      fieldExprId: String(positionsFieldId),
      domainSlot,
      outBufferSlot: posXYSlot,
      format: { components: 2, elementType: "f32" },
      policy: "perFrame",
    },
  });
  stepIds.push(posStepId);

  // Emit StepMaterialize for radius if needed
  if (radiusFieldId !== undefined) {
    const radiusStepId = `step-mat-size-${sinkIdx}`;
    steps.push({
      kind: "materialize",
      id: radiusStepId,
      deps: ["step-time-derive"],
      label: `Materialize size for sink ${sinkIdx}`,
      materialization: {
        id: `mat-size-${sinkIdx}`,
        fieldExprId: String(radiusFieldId),
        domainSlot,
        outBufferSlot: sizeOutSlot,
        format: { components: 1, elementType: "f32" },
        policy: "perFrame",
      },
    });
    stepIds.push(radiusStepId);
  }

  // Emit StepMaterialize for color (rgba8)
  const colorStepId = `step-mat-color-${sinkIdx}`;
  steps.push({
    kind: "materialize",
    id: colorStepId,
    deps: ["step-time-derive"],
    label: `Materialize color for sink ${sinkIdx}`,
    materialization: {
      id: `mat-color-${sinkIdx}`,
      fieldExprId: String(colorFieldId),
      domainSlot,
      outBufferSlot: colorOutSlot,
      format: { components: 4, elementType: "u8" },
      policy: "perFrame",
    },
  });
  stepIds.push(colorStepId);

  // Create batch descriptor (compile-time configuration)
  // References materialization buffer slots allocated above
  const batch: Instance2DBatch = {
    kind: "instance2d",
    count: 0, // Will be determined at runtime from domain
    domainSlot,
    posXYSlot,
    sizeSlot: sizeOutSlot,
    colorRGBASlot: colorOutSlot,
    opacitySlot,
  };

  return { batch, stepIds };
}

/**
 * Process an instances3d render sink.
 * Allocates buffer slots, materializes color field as RGBA channels,
 * and emits StepInstances3DProjectTo2D for 3D→2D projection.
 *
 * Per design-docs/13-Renderer/07-3d-Canonical.md:
 * - Color field is split into separate R,G,B,A materialization slots
 * - Projection step transforms 3D positions to 2D screen space
 * - Output is Instance2DBufferRef (same as instances2d for rendering)
 *
 * @returns Batch descriptor (pointing to projection output) and step IDs for dependencies
 */
function processInstances3DSink(
  sink: RenderSinkIR,
  sinkIdx: number,
  slots: SlotAllocator,
  steps: StepIR[],
  sigSlotToId: Map<ValueSlot, number>,
  fieldSlotToId: Map<ValueSlot, number>,
): { batch: Instance2DBatch; stepIds: string[] } {
  const stepIds: string[] = [];

  // Get input slots from sink
  const domainSlot = sink.inputs.domain;
  const positions3dSlot = sink.inputs.positions3d;
  const colorSlot = sink.inputs.color;
  const radiusSlot = sink.inputs.radius;
  const opacitySlot = sink.inputs.opacity;
  const cameraSlot = sink.inputs.camera; // May be undefined (default camera injection by pass8)

  if (opacitySlot === undefined) {
    throw new Error("processInstances3DSink: missing opacity input");
  }

  // Validate positions3d field
  const positions3dFieldId = fieldSlotToId.get(positions3dSlot);
  if (positions3dFieldId === undefined) {
    throw new Error(`processInstances3DSink: positions3d slot ${positions3dSlot} has no field expression`);
  }

  // Validate color field
  const colorFieldId = fieldSlotToId.get(colorSlot);
  if (colorFieldId === undefined) {
    throw new Error(`processInstances3DSink: color slot ${colorSlot} has no field expression`);
  }

  // Validate radius (field or signal)
  const radiusSigId = sigSlotToId.get(radiusSlot);
  const radiusFieldId = fieldSlotToId.get(radiusSlot);
  if (radiusSigId === undefined && radiusFieldId === undefined) {
    throw new Error(`processInstances3DSink: radius slot ${radiusSlot} has no signal or field expression`);
  }

  // Materialize 3D positions (vec3f32) with metadata
  const pos3dBufferType = createTypeDesc('config', 'matBuffer', 'internal', false);
  const pos3dSlot = slots.allocWithMeta(pos3dBufferType, `schedule:mat-pos3d-${sinkIdx}`);
  const pos3dStepId = `step-mat-pos3d-${sinkIdx}`;
  steps.push({
    kind: "materialize",
    id: pos3dStepId,
    deps: ["step-time-derive"],
    label: `Materialize 3D positions for sink ${sinkIdx}`,
    materialization: {
      id: `mat-pos3d-${sinkIdx}`,
      fieldExprId: String(positions3dFieldId),
      domainSlot,
      outBufferSlot: pos3dSlot,
      format: { components: 3, elementType: "f32" },
      policy: "perFrame",
    },
  });
  stepIds.push(pos3dStepId);

  // Materialize color as separate RGBA channels (Field<color> → 4 Float32Array buffers)
  // One step emits all 4 channels - allocate with metadata
  const channelBufferType = createTypeDesc('config', 'matBuffer', 'internal', false);
  const colorRSlot = slots.allocWithMeta(channelBufferType, `schedule:mat-color-r-${sinkIdx}`);
  const colorGSlot = slots.allocWithMeta(channelBufferType, `schedule:mat-color-g-${sinkIdx}`);
  const colorBSlot = slots.allocWithMeta(channelBufferType, `schedule:mat-color-b-${sinkIdx}`);
  const colorASlot = slots.allocWithMeta(channelBufferType, `schedule:mat-color-a-${sinkIdx}`);
  const colorStepId = `step-mat-color-${sinkIdx}`;
  steps.push({
    kind: "materializeColor",
    id: colorStepId,
    deps: ["step-time-derive"],
    label: `Materialize color channels for sink ${sinkIdx}`,
    domainSlot,
    colorExprSlot: colorSlot,
    outRSlot: colorRSlot,
    outGSlot: colorGSlot,
    outBSlot: colorBSlot,
    outASlot: colorASlot,
  });
  stepIds.push(colorStepId);

  // Materialize radius if it's a field (if signal, use slot directly)
  const radiusOutSlot = radiusFieldId !== undefined
    ? slots.allocWithMeta(channelBufferType, `schedule:mat-radius-${sinkIdx}`)
    : radiusSlot;
  if (radiusFieldId !== undefined) {
    const radiusStepId = `step-mat-radius-${sinkIdx}`;
    steps.push({
      kind: "materialize",
      id: radiusStepId,
      deps: ["step-time-derive"],
      label: `Materialize radius for sink ${sinkIdx}`,
      materialization: {
        id: `mat-radius-${sinkIdx}`,
        fieldExprId: String(radiusFieldId),
        domainSlot,
        outBufferSlot: radiusOutSlot,
        format: { components: 1, elementType: "f32" },
        policy: "perFrame",
      },
    });
    stepIds.push(radiusStepId);
  }

  // Allocate output slot for Instance2DBufferRef (projection result) with metadata
  const projectionOutputType = createTypeDesc('config', 'matBuffer', 'internal', false);
  const projectionOutSlot = slots.allocWithMeta(projectionOutputType, `schedule:project3d-${sinkIdx}`);

  // Emit StepInstances3DProjectTo2D
  const projectionStepId = `step-project3d-${sinkIdx}`;
  const projectionStep: StepInstances3DProjectTo2D = {
    kind: "Instances3DProjectTo2D",
    id: projectionStepId,
    deps: stepIds, // Depends on all materialization steps
    label: `Project 3D instances to 2D for sink ${sinkIdx}`,
    domainSlot,
    cameraEvalSlot: cameraSlot ?? 0 as ValueSlot, // TODO: Pass8 should inject default camera slot
    positionSlot: pos3dSlot,
    colorRSlot,
    colorGSlot,
    colorBSlot,
    colorASlot,
    radiusSlot: radiusOutSlot,
    zSort: true,
    cullMode: "frustum",
    clipMode: "discard",
    sizeSpace: "px",
    outSlot: projectionOutSlot,
  };
  steps.push(projectionStep);
  stepIds.push(projectionStepId);

  // Create batch descriptor pointing to projection output
  // The projection step produces an Instance2DBufferRef with x,y,r,g,b,a,s,z,alive arrays
  // We reference the output slot as the posXY slot (it contains the full Instance2DBufferRef)
  const batch: Instance2DBatch = {
    kind: "instance2d",
    count: 0, // Will be determined at runtime from domain
    domainSlot,
    posXYSlot: projectionOutSlot, // Projection output (Instance2DBufferRef)
    sizeSlot: projectionOutSlot,  // Same ref (contains size data)
    colorRGBASlot: projectionOutSlot, // Same ref (contains color data)
    opacitySlot,
  };

  return { batch, stepIds };
}

function processPaths2DSink(
  sink: RenderSinkIR,
  sinkIdx: number,
  slots: SlotAllocator,
  steps: StepIR[],
  sigSlotToId: Map<ValueSlot, number>,
  fieldSlotToId: Map<ValueSlot, number>,
  initialSlotValues: Record<number, unknown>,
): { batch: PathBatch; stepIds: string[] } {
  const stepIds: string[] = [];

  const domainSlot = sink.inputs.domain;
  const pathSlot = sink.inputs.paths;
  if (pathSlot === undefined) {
    throw new Error("processPaths2DSink: missing paths input");
  }

  if (sink.inputs.opacity === undefined) {
    throw new Error("processPaths2DSink: missing opacity input");
  }
  const opacitySlot = sink.inputs.opacity;

  const pathFieldId = fieldSlotToId.get(pathSlot);
  if (pathFieldId === undefined) {
    throw new Error(`processPaths2DSink: paths slot ${pathSlot} has no field expression`);
  }

  initialSlotValues[pathSlot] = { kind: "fieldExpr", exprId: String(pathFieldId) };

  // Allocate path buffer slots with metadata
  const pathBufferType = createTypeDesc('config', 'matBuffer', 'internal', false);
  const outCmdsSlot = slots.allocWithMeta(pathBufferType, `schedule:mat-path-cmds-${sinkIdx}`);
  const outParamsSlot = slots.allocWithMeta(pathBufferType, `schedule:mat-path-params-${sinkIdx}`);
  const outCmdStartSlot = slots.allocWithMeta(pathBufferType, `schedule:mat-path-cmdstart-${sinkIdx}`);
  const outCmdLenSlot = slots.allocWithMeta(pathBufferType, `schedule:mat-path-cmdlen-${sinkIdx}`);
  const outPointStartSlot = slots.allocWithMeta(pathBufferType, `schedule:mat-path-pointstart-${sinkIdx}`);
  const outPointLenSlot = slots.allocWithMeta(pathBufferType, `schedule:mat-path-pointlen-${sinkIdx}`);

  const pathStepId = `step-mat-path-${sinkIdx}`;
  steps.push({
    kind: "materializePath",
    id: pathStepId,
    deps: ["step-time-derive"],
    label: `Materialize paths for sink ${sinkIdx}`,
    domainSlot,
    pathExprSlot: pathSlot,
    outCmdsSlot,
    outParamsSlot,
    outCmdStartSlot,
    outCmdLenSlot,
    outPointStartSlot,
    outPointLenSlot,
  });
  stepIds.push(pathStepId);

  const fillColorSlot = materializeColorField(
    "fill-color",
    sink.inputs.fillColor,
    domainSlot,
    sinkIdx,
    slots,
    steps,
    sigSlotToId,
    fieldSlotToId,
    stepIds,
  );

  const strokeColorSlot = materializeColorField(
    "stroke-color",
    sink.inputs.strokeColor,
    domainSlot,
    sinkIdx,
    slots,
    steps,
    sigSlotToId,
    fieldSlotToId,
    stepIds,
  );

  const strokeWidthSlot = materializeScalarField(
    "stroke-width",
    sink.inputs.strokeWidth,
    domainSlot,
    sinkIdx,
    slots,
    steps,
    sigSlotToId,
    fieldSlotToId,
    stepIds,
  );

  const resolvedOpacitySlot = materializeScalarField(
    "opacity",
    opacitySlot,
    domainSlot,
    sinkIdx,
    slots,
    steps,
    sigSlotToId,
    fieldSlotToId,
    stepIds,
  );

  const drawFill = fillColorSlot !== undefined;
  const drawStroke = strokeColorSlot !== undefined;

  if (!drawFill && !drawStroke) {
    throw new Error("processPaths2DSink: expected fillColor or strokeColor input");
  }

  if (drawStroke && strokeWidthSlot === undefined) {
    throw new Error("processPaths2DSink: strokeColor requires strokeWidth input");
  }

  const batch: PathBatch = {
    kind: "path",
    count: 0,
    domainSlot,
    cmdsSlot: outCmdsSlot,
    paramsSlot: outParamsSlot,
    cmdStartSlot: outCmdStartSlot,
    cmdLenSlot: outCmdLenSlot,
    pointStartSlot: outPointStartSlot,
    pointLenSlot: outPointLenSlot,
    fillColorSlot,
    strokeColorSlot,
    strokeWidthSlot,
    opacitySlot: resolvedOpacitySlot,
    draw: { fill: drawFill, stroke: drawStroke },
  };

  return { batch, stepIds };
}
