/**
 * Build Schedule - Convert BuilderProgramIR to CompiledProgramIR
 *
 * This is a simple transformation that takes the output of IRBuilder and converts
 * it into the executable CompiledProgramIR format with a basic execution schedule.
 *
 * This is NOT the full pass9-codegen implementation - it's a minimal converter
 * that gets the IR pipeline working end-to-end.
 *
 * The schedule is simple:
 * 1. StepTimeDerive - derive time signals from tAbsMs
 * 2. StepBusEval - evaluate each bus (if any)
 * 3. StepMaterializeColor - materialize color fields to RGBA buffers
 * 4. StepMaterializeTestGeometry - populate test position/radius buffers (temporary)
 * 5. StepRenderAssemble - final render tree assembly
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md
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
  OutputSpec,
  ProgramMeta,
  TypeTable,
  ValueSlot,
} from "./index";
import { randomUUID } from "../../crypto";

/**
 * Instance2D batch descriptor - stored in ValueStore at instance2dListSlot.
 * References slots containing materialized buffers.
 */
interface Instance2DBatchDescriptor {
  kind: "instance2d";
  count: number;
  xSlot: ValueSlot;
  ySlot: ValueSlot;
  radiusSlot: ValueSlot;
  rSlot: ValueSlot;
  gSlot: ValueSlot;
  bSlot: ValueSlot;
  aSlot: ValueSlot;
}

/**
 * Instance2D batch list - stored in ValueStore
 */
interface Instance2DBatchList {
  batches: Instance2DBatchDescriptor[];
}

/**
 * Path batch descriptor
 */
interface PathBatchDescriptor {
  kind: "path";
  cmdsSlot: ValueSlot;
  paramsSlot: ValueSlot;
}

/**
 * Path batch list
 */
interface PathBatchList {
  batches: PathBatchDescriptor[];
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
  seed: number
): CompiledProgramIR {
  // Create empty tables (will be populated as we implement more passes)
  const emptyTypeTable: TypeTable = { typeIds: [] };
  const emptyNodeTable: NodeTable = { nodes: [] };
  const emptyBusTable: BusTable = { buses: [] };
  const emptyLensTable: LensTable = { lenses: [] };
  const emptyAdapterTable: AdapterTable = { adapters: [] };
  const emptyFieldExprTable: FieldExprTable = { nodes: [] };

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
  const { schedule, frameOutSlot } = buildSchedule(builderIR);

  // Create outputs that reference the frame output slot
  const outputs: OutputSpec[] = frameOutSlot !== undefined
    ? [{
        id: "frame",
        kind: "renderTree" as const,
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
    fields: emptyFieldExprTable,
    constants: constPool,
    stateLayout,
    schedule,
    outputs,
    meta,
  };
}

/**
 * Slot allocator - tracks next available slot.
 */
class SlotAllocator {
  private nextSlot = 0;

  alloc(): ValueSlot {
    return this.nextSlot++ as ValueSlot;
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
 * Build a basic execution schedule.
 *
 * The schedule is minimal but follows the correct evaluation order:
 * 1. Time derivation
 * 2. Bus evaluation (if any)
 * 3. Field materialization (color, path, etc.)
 * 4. Geometry materialization (test data for now)
 * 5. Render assembly
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §A2
 */
function buildSchedule(builderIR: BuilderProgramIR): BuildScheduleResult {
  const steps: StepIR[] = [];
  const slots = new SlotAllocator();

  // Allocate time-related slots
  const SLOT_T_ABS_MS = slots.alloc();
  const SLOT_T_MODEL_MS = slots.alloc();
  const SLOT_PROGRESS_01 = slots.alloc();

  // Allocate batch list slots
  const SLOT_INSTANCE2D_LIST = slots.alloc();
  const SLOT_PATH_BATCH_LIST = slots.alloc();
  const SLOT_FRAME_OUT = slots.alloc();

  // Step 1: Time Derive
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
    },
  });

  // Step 2: Process render sinks and emit materialization steps
  const instance2dBatches: Instance2DBatchDescriptor[] = [];
  const pathBatches: PathBatchDescriptor[] = [];
  const materializeStepIds: string[] = [];

  for (let sinkIdx = 0; sinkIdx < builderIR.renderSinks.length; sinkIdx++) {
    const sink = builderIR.renderSinks[sinkIdx];

    if (sink.sinkType === "instances2d") {
      const result = processInstances2DSink(sink, sinkIdx, slots, steps);
      instance2dBatches.push(result.batch);
      materializeStepIds.push(...result.stepIds);
    }
    // Future: handle "paths2d" sinks
  }

  // Step 3: Render Assemble
  // Depends on all materialization steps
  const renderAssembleDeps = ["step-time-derive", ...materializeStepIds];

  steps.push({
    kind: "renderAssemble",
    id: "step-render-assemble",
    deps: renderAssembleDeps,
    label: "Assemble render frame",
    instance2dListSlot: SLOT_INSTANCE2D_LIST,
    pathBatchListSlot: SLOT_PATH_BATCH_LIST,
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
    // Store initial slot values for batch lists
    initialSlotValues: {
      [SLOT_INSTANCE2D_LIST]: { batches: instance2dBatches } as Instance2DBatchList,
      [SLOT_PATH_BATCH_LIST]: { batches: pathBatches } as PathBatchList,
    },
  };

  return {
    schedule,
    frameOutSlot: SLOT_FRAME_OUT,
  };
}

/**
 * Process an instances2d render sink.
 * Allocates buffer slots and emits materializeColor step + test geometry step.
 *
 * @returns Batch descriptor and step IDs for dependencies
 */
function processInstances2DSink(
  sink: RenderSinkIR,
  sinkIdx: number,
  slots: SlotAllocator,
  steps: StepIR[]
): { batch: Instance2DBatchDescriptor; stepIds: string[] } {
  const stepIds: string[] = [];

  // Get input slots from sink
  const domainSlot = sink.inputs.domain as ValueSlot;
  const colorSlot = sink.inputs.color as ValueSlot;

  // Allocate output buffer slots for position (x, y)
  const xSlot = slots.alloc();
  const ySlot = slots.alloc();

  // Allocate output buffer slot for radius
  const radiusOutSlot = slots.alloc();

  // Allocate output buffer slots for RGBA
  const rSlot = slots.alloc();
  const gSlot = slots.alloc();
  const bSlot = slots.alloc();
  const aSlot = slots.alloc();

  // Emit StepMaterializeColor for the color field
  const colorStepId = `step-mat-color-${sinkIdx}`;
  steps.push({
    kind: "materializeColor",
    id: colorStepId,
    deps: ["step-time-derive"],
    label: `Materialize color for sink ${sinkIdx}`,
    domainSlot,
    colorExprSlot: colorSlot,
    outRSlot: rSlot,
    outGSlot: gSlot,
    outBSlot: bSlot,
    outASlot: aSlot,
  });
  stepIds.push(colorStepId);

  // Emit StepMaterializeTestGeometry for positions and radius
  // This is a temporary step that creates test data until we implement full field materialization
  const geomStepId = `step-mat-test-geom-${sinkIdx}`;
  steps.push({
    kind: "materializeTestGeometry",
    id: geomStepId,
    deps: ["step-time-derive"],
    label: `Materialize test geometry for sink ${sinkIdx}`,
    domainSlot,
    outXSlot: xSlot,
    outYSlot: ySlot,
    outRadiusSlot: radiusOutSlot,
  });
  stepIds.push(geomStepId);

  // Create batch descriptor that references the output slots
  // The count will be determined at runtime from the domain
  const batch: Instance2DBatchDescriptor = {
    kind: "instance2d",
    count: 0, // Will be set at runtime from domain
    xSlot,
    ySlot,
    radiusSlot: radiusOutSlot,
    rSlot,
    gSlot,
    bSlot,
    aSlot,
  };

  return { batch, stepIds };
}
