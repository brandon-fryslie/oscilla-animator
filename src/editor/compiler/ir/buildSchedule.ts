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
 * 3. StepMaterialize - materialize field outputs (if any)
 * 4. StepRenderAssemble - final render tree assembly
 */

import type { BuilderProgramIR } from "./builderTypes";
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
  TimeModelIR,
} from "./index";
import { randomUUID } from "../../crypto";

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

  // Build schedule
  const schedule = buildSchedule(builderIR.timeModel);

  // Create empty outputs (will be populated when we implement render lowering)
  const outputs: OutputSpec[] = [];

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
 * Build a basic execution schedule.
 *
 * The schedule is minimal but follows the correct evaluation order:
 * 1. Time derivation
 * 2. Bus evaluation (if any)
 * 3. Field materialization (if any)
 * 4. Render assembly
 *
 * Slot allocation (dense numeric indices):
 * - 0: tAbsMs (input)
 * - 1: tModelMs (derived)
 * - 2: progress01 (derived)
 * - 3: render output (object)
 */
function buildSchedule(timeModel: TimeModelIR): ScheduleIR {
  const steps: StepIR[] = [];

  // Numeric slot allocation
  const SLOT_T_ABS_MS = 0;
  const SLOT_T_MODEL_MS = 1;
  const SLOT_PROGRESS_01 = 2;
  const SLOT_RENDER_OUT = 3;

  // Step 1: Time Derive
  // This step derives time-related signals from the absolute time (tAbsMs)
  steps.push({
    kind: "timeDerive",
    id: "step-time-derive",
    label: "Derive time signals",
    tAbsMsSlot: SLOT_T_ABS_MS,
    timeModel,
    out: {
      tModelMs: SLOT_T_MODEL_MS,
      progress01: SLOT_PROGRESS_01,
    },
  });

  // Step 2: Bus Eval (placeholder - we'll add buses when they're implemented)
  // [No bus steps in minimal implementation]

  // Step 3: Materialize (placeholder - we'll add field materialization when implemented)
  // [No materialize steps in minimal implementation]

  // Step 4: Render Assemble (placeholder - we'll add when render lowering is implemented)
  steps.push({
    kind: "renderAssemble",
    id: "step-render-assemble",
    label: "Assemble render tree",
    rootNodeIndex: 0, // Placeholder - no nodes yet
    outSlot: SLOT_RENDER_OUT,
  });

  // Build step index map
  const stepIdToIndex: Record<string, number> = Object.fromEntries(
    steps.map((s, i) => [s.id, i])
  );

  return {
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
  };
}
