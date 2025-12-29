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

import type { BuilderProgramIR, RenderSinkIR } from "./builderTypes";
import type {
  CompiledProgramIR,
  NodeTable,
  BusTable,
  LensTable,
  AdapterTable,
  FieldExprTable,
  ConstPool,
  StateLayout,
  StateCellLayout,
  ScheduleIR,
  StepIR,
  StepDebugProbe,
  OutputSpec,
  ProgramMeta,
  TypeTable,
  ValueSlot,
  Instance2DBatch,
  PathBatch,
} from "./index";
import { randomUUID } from "../../crypto";
import type { StepInstances3DProjectTo2D } from "../../runtime/executor/steps/executeInstances3DProject";
import type { CameraTable, CameraId, CameraIR } from "./types3d";
import { DEFAULT_CAMERA_IR } from "./types3d";

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
  patchRevision: number,
  seed: number,
  debugConfig?: ScheduleDebugConfig,
): CompiledProgramIR {
  // Create empty tables (will be populated as we implement more passes)
  const emptyTypeTable: TypeTable = { typeIds: [] };
  const emptyNodeTable: NodeTable = { nodes: [] };
  const emptyBusTable: BusTable = { buses: [] };
  const emptyLensTable: LensTable = { lenses: [] };
  const emptyAdapterTable: AdapterTable = { adapters: [] };
  const fieldExprTable: FieldExprTable = { nodes: Array.from(builderIR.fieldIR.nodes) };
  const signalTable = { nodes: Array.from(builderIR.signalIR.nodes) };

  // Convert constants from simple array to packed format
  const constPool: ConstPool = {
    json: Array.from(builderIR.constants),
    f64: new Float64Array(0),
    f32: new Float32Array(0),
    i32: new Int32Array(0),
    constIndex: [],
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
      policy: "frame" as const, // Default policy
      initialConstId: entry.initial !== undefined ? 0 : undefined,
    })),
    f64Size: builderIR.stateLayout.length,
    f32Size: 0,
    i32Size: 0,
  };

  // Build schedule (now processes render sinks)
  const { schedule, frameOutSlot } = buildSchedule(builderIR, { debugConfig });

  // Build camera table with selection semantics
  const { cameraTable, defaultCameraId } = buildCameraSelection(builderIR.cameras);

  // Create outputs that reference the frame output slot
  const outputs: OutputSpec[] = frameOutSlot !== undefined
    ? [{
        id: "frame",
        kind: "renderFrame" as const,
        slot: frameOutSlot,
        label: "Render Frame",
      }]
    : [];

  // Create metadata
  const meta: ProgramMeta = {
    sourceMap: {},
    names: {
      nodes: {},
      buses: {},
      steps: Object.fromEntries(
        schedule.steps.map(s => [s.id, s.kind])
      ),
    },
  };

  // Convert SlotMetaEntry to SlotMeta (add offset = slot for dense allocation)
  const slotMeta = builderIR.slotMeta.map((entry) => ({
    slot: entry.slot,
    storage: entry.storage,
    offset: entry.slot, // Dense allocation: offset = slot index
    type: entry.type,
  }));

  return {
    irVersion: 1,
    patchId,
    patchRevision,
    compileId: randomUUID(),
    seed,
    timeModel: builderIR.timeModel,
    types: emptyTypeTable,
    nodes: emptyNodeTable,
    buses: emptyBusTable,
    lenses: emptyLensTable,
    adapters: emptyAdapterTable,
    fields: fieldExprTable,
    signalTable,
    constants: constPool,
    stateLayout,
    slotMeta,
    cameras: cameraTable,
    defaultCameraId,
    schedule,
    outputs,
    meta,
  };
}

/**
 * Slot allocator - tracks next available slot.
 */
class SlotAllocator {
  private nextSlot: number;

  constructor(startSlot = 0) {
    this.nextSlot = startSlot;
  }

  alloc(): ValueSlot {
    return this.nextSlot++;
  }

  peek(): number {
    return this.nextSlot;
  }
}

/**
 * Result of buildSchedule including the schedule and output slot references.
 */
interface BuildScheduleResult {
  schedule: ScheduleIR;
  frameOutSlot: ValueSlot | undefined;
}

/**
 * Options for buildSchedule.
 */
interface BuildScheduleOptions {
  /** Debug configuration (optional) */
  debugConfig?: ScheduleDebugConfig;
}

/**
 * Compute the next available value slot from BuilderProgramIR.
 * Scans all allocated slots to find the maximum + 1.
 */
function computeNextValueSlot(builderIR: BuilderProgramIR): number {
  let maxSlot = -1;

  // Check signal value slots
  for (const slot of builderIR.sigValueSlots) {
    if (slot !== undefined && slot > maxSlot) {
      maxSlot = slot;
    }
  }

  // Check field value slots
  for (const slot of builderIR.fieldValueSlots) {
    if (slot !== undefined && slot > maxSlot) {
      maxSlot = slot;
    }
  }

  // Check time slots
  if (builderIR.timeSlots) {
    const timeSlotValues = [
      builderIR.timeSlots.systemTime,
      builderIR.timeSlots.tAbsMs,
      builderIR.timeSlots.tModelMs,
      builderIR.timeSlots.phase01,
      builderIR.timeSlots.progress01,
      builderIR.timeSlots.wrapEvent,
    ];
    for (const slot of timeSlotValues) {
      if (slot !== undefined && slot > maxSlot) {
        maxSlot = slot;
      }
    }
  }

  // Check domain slots
  for (const domain of builderIR.domains) {
    if (domain.slot > maxSlot) {
      maxSlot = domain.slot;
    }
  }

  return maxSlot + 1;
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
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §A2
 * - design-docs/13-Renderer/12-ValueSlotPerNodeOutput.md
 * - .agent_planning/debugger/PLAN-2025-12-27-005641.md (Phase 7 Debug Infrastructure)
 */
function buildSchedule(
  builderIR: BuilderProgramIR,
  options?: BuildScheduleOptions,
): BuildScheduleResult {
  const steps: StepIR[] = [];
  const slots = new SlotAllocator(computeNextValueSlot(builderIR));
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
  // If no TimeRoot was lowered, we fall back to local allocation
  const timeSlots = builderIR.timeSlots ?? {
    // Fallback for patches without TimeRoot (allocate locally)
    systemTime: slots.alloc(),
    tAbsMs: slots.alloc(),
    tModelMs: slots.alloc(),
    progress01: slots.alloc(),
  };

  const SLOT_T_ABS_MS = timeSlots.tAbsMs ?? timeSlots.systemTime;
  const SLOT_T_MODEL_MS = timeSlots.tModelMs ?? timeSlots.systemTime;
  const SLOT_PROGRESS_01 = timeSlots.progress01 ?? timeSlots.tModelMs ?? timeSlots.systemTime;

  // Allocate frame output slot
  // Per 12-ValueSlotPerNodeOutput.md: schedule allocates only:
  // - Materialization buffer slots (done in processInstances2DSink)
  // - Frame output slot
  // Batch lists are compile-time config embedded in the step, not slots
  const SLOT_FRAME_OUT = slots.alloc();

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
      phase01: timeSlots.phase01 ?? SLOT_PROGRESS_01,
      wrapEvent: timeSlots.wrapEvent ?? SLOT_PROGRESS_01,
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
      busDependsOnSlots: {},
      busProvidesSlot: {},
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

  return {
    schedule,
    frameOutSlot: SLOT_FRAME_OUT,
  };
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
    const outSlot = slots.alloc();
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
    const outSlot = slots.alloc();
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

  // Allocate output buffer slots for positions and size/color
  const posXYSlot = slots.alloc();
  const sizeOutSlot = radiusFieldId !== undefined ? slots.alloc() : radiusSlot;
  const colorOutSlot = slots.alloc();

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

  // Materialize 3D positions (vec3f32)
  const pos3dSlot = slots.alloc();
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
  // One step emits all 4 channels
  const colorRSlot = slots.alloc();
  const colorGSlot = slots.alloc();
  const colorBSlot = slots.alloc();
  const colorASlot = slots.alloc();
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
  const radiusOutSlot = radiusFieldId !== undefined ? slots.alloc() : radiusSlot;
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

  // Allocate output slot for Instance2DBufferRef (projection result)
  const projectionOutSlot = slots.alloc();

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

  const outCmdsSlot = slots.alloc();
  const outParamsSlot = slots.alloc();
  const outCmdStartSlot = slots.alloc();
  const outCmdLenSlot = slots.alloc();
  const outPointStartSlot = slots.alloc();
  const outPointLenSlot = slots.alloc();

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
    sink.inputs.fillColor as ValueSlot | undefined,
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
    sink.inputs.strokeColor as ValueSlot | undefined,
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
    sink.inputs.strokeWidth as ValueSlot | undefined,
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
