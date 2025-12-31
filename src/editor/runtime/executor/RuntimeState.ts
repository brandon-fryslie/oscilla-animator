/**
 * Runtime State - Per-Frame Execution State
 *
 * Container for all runtime state needed during frame execution.
 *
 * Contains:
 * - ValueStore: per-frame slot-based value storage
 * - StateBuffer: cross-frame persistent state
 * - EventStore: discrete event trigger storage
 * - FrameCache: memoization cache with signal/field caches
 * - frameId: monotonic frame counter
 * - timeState: persistent time state for wrap detection
 * - 3D stores: CameraStore, MeshStore
 * - viewport: ViewportInfo for 3D projection
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor)
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §8
 * - .agent_planning/scheduled-runtime/PLAN-2025-12-26-092613.md (Phase 6 Sprint 2)
 * - .agent_planning/time-event-semantics/PLAN-2025-12-31-013758.md (P1 EventStore)
 */

import type { ValueStore, StateBuffer } from "../../compiler/ir";
import {
  createValueStore,
  createStateBuffer,
  initializeState,
} from "../../compiler/ir/stores";
import type { SlotMeta } from "../../compiler/ir/stores";
import type { CompiledProgramIR } from "../../compiler/ir/program";
import type { FieldHandle } from "../field/types";
import { preserveState } from "./StateSwap";
import { CameraStore } from "../camera/CameraStore";
import { MeshStore } from "../mesh/MeshStore";
import type { ViewportInfo } from "../camera/evaluateCamera";
import { createTimeState, type TimeState } from "./timeResolution";
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
import { EventStore } from "./EventStore";
=======
import { asTypeDesc } from "../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
import { asTypeDesc } from "../../compiler/ir/types";
=======
import { EventStore } from "./EventStore";
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
import { asTypeDesc } from "../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
import { asTypeDesc } from "../../compiler/ir/types";
=======
import { EventStore } from "./EventStore";
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
import { EventStore } from "./EventStore";
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
import { EventStore } from "./EventStore";
=======
import { asTypeDesc } from "../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)

// ============================================================================
// RuntimeState Interface
// ============================================================================

/**
 * RuntimeState - Frame Execution State Container
 *
 * Holds all mutable state during frame execution.
 *
 * Lifecycle:
 * - Created once per program
 * - Reused across frames
 * - Updated via hot-swap when program changes
 */
export interface RuntimeState {
  /** Per-frame value storage (slot-based) */
  values: ValueStore;

  /** Persistent state storage (cross-frame) */
  state: StateBuffer;

  /** Discrete event trigger storage (per-frame, resets each frame) */
  events: EventStore;

  /** Frame cache (per-frame memoization) */
  frameCache: FrameCache;

  /** Monotonic frame counter */
  frameId: number;

  /** Time state for wrap detection (persistent across frames) */
  timeState: TimeState;

  /** Camera evaluation cache (3D rendering) */
  cameraStore: CameraStore;

  /** Mesh materialization cache (3D rendering) */
  meshStore: MeshStore;

  /** Viewport info for 3D projection */
  viewport: ViewportInfo;

  /**
   * Hot-swap to a new program while preserving state and time continuity.
   *
   * This is the core jank-free live editing primitive. It creates a new
   * RuntimeState from the new program and preserves matching state cells
   * from the old runtime.
   *
   * State Preservation Contract:
   * - Matching state cells (by nodeId:role) are copied
   * - New state cells are initialized with defaults
   * - Removed state cells are dropped
   * - Layout changes (size/storage type) trigger re-initialization
   *
   * Time Continuity:
   * - frameId preserved (not reset to 0)
   * - FrameCache.frameId preserved
   * - timeState preserved (for wrap detection continuity)
   *
   * Cache Policy:
   * - Per-frame caches invalidated (stamps zeroed, buffer pool cleared)
   * - New caches allocated for new runtime
   *
   * @param newProgram - New compiled program to swap to
   * @returns New RuntimeState with preserved state/time
   *
   * @example
   * ```typescript
   * // Execute frame with old program
   * executor.executeFrame(oldProgram, runtime, tMs);
   *
   * // Compile new program (user edited patch)
   * const newProgram = compile(editedPatch);
   *
   * // Hot-swap (preserves state)
   * runtime = runtime.hotSwap(newProgram);
   *
   * // Continue execution with new program (no visual jank)
   * executor.executeFrame(newProgram, runtime, tMs);
   * ```
   */
  hotSwap(newProgram: CompiledProgramIR): RuntimeState;
}

// ============================================================================
// FrameCache Interface
// ============================================================================

/**
 * FrameCache - Per-Frame Memoization
 *
 * Caches signal values, field handles, and materialized buffers per frame.
 * Implements stamp-based cache invalidation (no array clearing on newFrame).
 *
 * Cache Strategy:
 * - Stamp-based invalidation: stamp[id] === frameId → cache hit
 * - newFrame() increments frameId (stamps < frameId are stale)
 * - invalidate() zeros stamps (forces recomputation)
 * - Buffer pool is cleared on newFrame() (new frame = new materializations)
 *
 * References:
 * - HANDOFF.md Topic 4 (FrameCache System)
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §8
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 1
 */
export interface FrameCache {
  /** Current frame ID (monotonic, starts at 1) */
  frameId: number;

  /** Cached signal values (indexed by SigExprId) */
  sigValue: Float64Array;

  /** Frame stamps for signal cache validation */
  sigStamp: Uint32Array;

  /** Validity mask for non-number signal types */
  sigValidMask: Uint8Array;

  /** Cached field handles - lazy recipes (indexed by FieldExprId) */
  fieldHandle: FieldHandle[];

  /** Frame stamps for field cache validation */
  fieldStamp: Uint32Array;

  /**
   * Materialized buffer pool (per-frame cache).
   *
   * Stores complete buffer handles (including format metadata) from materialize steps.
   * These handles are written to the ValueStore and may be read by downstream steps.
   *
   * Type is `unknown` to accommodate different handle types (BufferHandle, etc.)
   * without creating circular dependencies.
   */
  fieldBuffers: Map<string, unknown>;

  /**
   * Start a new frame.
   * Increments frameId and clears buffer pool.
   * Does NOT clear stamp arrays (stamp comparison handles invalidation).
   */
  newFrame(): void;

  /**
   * Invalidate all caches.
   * Zeros stamp arrays and clears buffer pool.
   * Used during hot-swap or debug reset.
   */
  invalidate(): void;
}

// ============================================================================
// FrameCache Factory
// ============================================================================

/**
 * Create a FrameCache with specified capacities.
 *
 * Allocates typed arrays for signal/field caches.
 * FrameId starts at 1 to avoid collision with initial Uint32Array values (0).
 *
 * @param sigCapacity - Number of signal expressions (max SigExprId + 1)
 * @param fieldCapacity - Number of field expressions (max FieldExprId + 1)
 * @returns Initialized FrameCache
 *
 * @example
 * ```typescript
 * const cache = createFrameCache(1024, 512);
 * console.log(cache.frameId); // 1 (NOT 0)
 * console.log(cache.sigValue.length); // 1024
 * console.log(cache.fieldHandle.length); // 512
 * ```
 */
export function createFrameCache(
  sigCapacity: number,
  fieldCapacity: number
): FrameCache {
  // Allocate signal cache arrays
  const sigValue = new Float64Array(sigCapacity);
  const sigStamp = new Uint32Array(sigCapacity);
  const sigValidMask = new Uint8Array(sigCapacity);

  // Allocate field cache arrays
  // FieldHandle[] cannot be pre-allocated with type safety, so use empty array with reserved length
  const fieldHandle: FieldHandle[] = [];
  fieldHandle.length = fieldCapacity;
  const fieldStamp = new Uint32Array(fieldCapacity);

  // Initialize buffer pool
  const fieldBuffers = new Map<string, unknown>();

  return {
    frameId: 1, // Start at 1 to avoid collision with initial stamp values (0)
    sigValue,
    sigStamp,
    sigValidMask,
    fieldHandle,
    fieldStamp,
    fieldBuffers,

    newFrame(): void {
      // Increment frameId - this invalidates all cached values
      // (stamps < new frameId are now stale)
      this.frameId++;

      // Clear buffer pool - new frame requires fresh materializations
      this.fieldBuffers.clear();

      // Do NOT zero stamp arrays - stamp comparison is sufficient
      // Do NOT clear sigValue/fieldHandle arrays - stamps invalidate stale entries
    },

    invalidate(): void {
      // Zero all stamp arrays - forces full recomputation
      this.sigStamp.fill(0);
      this.fieldStamp.fill(0);

      // Clear buffer pool
      this.fieldBuffers.clear();

      // Do NOT reset frameId - it's monotonic
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if schedule has any steps that read/write slots.
 *
 * @param program - Compiled program
 * @returns true if schedule contains slot operations
 */
function scheduleHasSlotOperations(program: CompiledProgramIR): boolean {
  if (program.schedule === undefined || program.schedule.steps === undefined) {
    return false;
  }

  // Check if any step reads or writes slots
  for (const step of program.schedule.steps) {
    switch (step.kind) {
      case "timeDerive":
      case "signalEval":
      case "nodeEval":
      case "busEval":
      case "eventBusEval":
      case "materialize":
      case "materializeColor":
      case "materializePath":
      case "materializeTestGeometry":
      case "renderAssemble":
      case "CameraEval":
      case "MeshMaterialize":
      case "Instances3DProjectTo2D":
        return true;
      case "debugProbe":
        // DebugProbe reads slots but doesn't affect correctness
        continue;
      default:
        continue;
    }
  }

  return false;
}

/**
 * Extract slot metadata from program.
 *
 * Per design-docs/13-Renderer/12-ValueSlotPerNodeOutput.md:
 * - Prefer compiler-emitted slotMeta when available
 * - Fall back to inferring from schedule only when slotMeta is missing
 *
 * VALIDATION: If slotMeta is empty AND schedule has slot operations, throw error.
 * This prevents silent runtime failures when the compiler failed to emit metadata.
 *
 * @param program - Compiled program
 * @returns Slot metadata array
 * @throws Error if slotMeta required but missing
 */
function extractSlotMeta(program: CompiledProgramIR): SlotMeta[] {
  const compilerMeta = program.slotMeta !== undefined && program.slotMeta.length > 0
    ? [...program.slotMeta]
    : [];
  const inferred = inferSlotMetaFromSchedule(program);

  // VALIDATION: Fail fast if slotMeta is required but missing
  if (compilerMeta.length === 0 && inferred.length === 0 && scheduleHasSlotOperations(program)) {
    throw new Error(
      `RuntimeState: program.slotMeta is required for IR execution but is empty/undefined. ` +
      `Schedule contains ${program.schedule.steps.length} steps that require slot operations. ` +
      `Ensure compiler emits slotMeta or schedule is empty.`
    );
  }

  if (compilerMeta.length === 0) {
    return inferred;
  }

  const bySlot = new Map<number, SlotMeta>();
  for (const meta of compilerMeta) {
    bySlot.set(meta.slot, meta);
  }
  for (const meta of inferred) {
    if (!bySlot.has(meta.slot)) {
      compilerMeta.push(meta);
      bySlot.set(meta.slot, meta);
    }
  }

  return compilerMeta;
}

/**
 * Infer slot metadata from schedule steps.
 *
 * This is the legacy fallback when compiler-emitted slotMeta is not available.
 * It scans schedule steps to find all referenced slots.
 *
 * @param program - Compiled program
 * @returns Slot metadata array
 */
function inferSlotMetaFromSchedule(program: CompiledProgramIR): SlotMeta[] {
  const numericSlots = new Set<number>();
  const objectSlots = new Set<number>(); // Slots that hold objects (buffers, handles)

  // Guard against incomplete program objects (used in some tests)
  if (program.schedule === undefined || program.schedule.steps === undefined) {
    return [];
  }

  // Collect all slot indices from schedule steps
  for (const step of program.schedule.steps) {
    switch (step.kind) {
      case "timeDerive":
        numericSlots.add(step.tAbsMsSlot);
        numericSlots.add(step.out.tModelMs);
        if (step.out.phase01 !== undefined) numericSlots.add(step.out.phase01);
        if (step.out.wrapEvent !== undefined)
          numericSlots.add(step.out.wrapEvent);
        if (step.out.progress01 !== undefined)
          numericSlots.add(step.out.progress01);
        break;

      case "signalEval":
        for (const output of step.outputs) {
          numericSlots.add(output.slot);
        }
        break;

      case "nodeEval":
        for (const slot of step.inputSlots) numericSlots.add(slot);
        for (const slot of step.outputSlots) numericSlots.add(slot);
        break;

      case "busEval":
        numericSlots.add(step.outSlot);
        for (const pub of step.publishers) {
          numericSlots.add(pub.srcSlot);
        }
        break;

      case "eventBusEval":
        // Event streams are objects (arrays of EventOccurrence), not numeric values
        objectSlots.add(step.outSlot);
        for (const pub of step.publishers) {
          objectSlots.add(pub.srcSlot);
        }
        break;

      case "materialize":
        numericSlots.add(step.materialization.domainSlot);
        // Buffer slots hold objects, not numbers
        objectSlots.add(step.materialization.outBufferSlot);
        break;

      case "materializeColor":
        // MaterializeColor inputs and outputs
        objectSlots.add(step.domainSlot);
        objectSlots.add(step.colorExprSlot);
        objectSlots.add(step.outRSlot);
        objectSlots.add(step.outGSlot);
        objectSlots.add(step.outBSlot);
        objectSlots.add(step.outASlot);
        break;

      case "materializePath":
        // MaterializePath inputs and outputs
        objectSlots.add(step.domainSlot);
        objectSlots.add(step.pathExprSlot);
        objectSlots.add(step.outCmdsSlot);
        objectSlots.add(step.outParamsSlot);
        objectSlots.add(step.outCmdStartSlot);
        objectSlots.add(step.outCmdLenSlot);
        objectSlots.add(step.outPointStartSlot);
        objectSlots.add(step.outPointLenSlot);
        break;

      case "materializeTestGeometry":
        // MaterializeTestGeometry inputs and outputs
        objectSlots.add(step.domainSlot);
        objectSlots.add(step.outXSlot);
        objectSlots.add(step.outYSlot);
        objectSlots.add(step.outRadiusSlot);
        break;

      case "renderAssemble":
        // RenderAssemble inputs and outputs (all objects)
        if (step.instance2dListSlot !== undefined) {
          objectSlots.add(step.instance2dListSlot);
        }
        if (step.pathBatchListSlot !== undefined) {
          objectSlots.add(step.pathBatchListSlot);
        }
        if (step.instance2dBatches !== undefined) {
          for (const batch of step.instance2dBatches) {
            objectSlots.add(batch.domainSlot);
            objectSlots.add(batch.posXYSlot);
            objectSlots.add(batch.sizeSlot);
            objectSlots.add(batch.colorRGBASlot);
            numericSlots.add(batch.opacitySlot);
          }
        }
        if (step.pathBatches !== undefined) {
          for (const batch of step.pathBatches) {
            objectSlots.add(batch.cmdsSlot);
            objectSlots.add(batch.paramsSlot);
            objectSlots.add(batch.cmdStartSlot);
            objectSlots.add(batch.cmdLenSlot);
            objectSlots.add(batch.pointStartSlot);
            objectSlots.add(batch.pointLenSlot);
            if (batch.fillColorSlot !== undefined) objectSlots.add(batch.fillColorSlot);
            if (batch.strokeColorSlot !== undefined) objectSlots.add(batch.strokeColorSlot);
            if (batch.strokeWidthSlot !== undefined) objectSlots.add(batch.strokeWidthSlot);
            if (batch.opacitySlot !== undefined) objectSlots.add(batch.opacitySlot);
            objectSlots.add(batch.domainSlot);
          }
        }
        objectSlots.add(step.outFrameSlot);
        break;

      case "debugProbe":
        for (const slot of step.probe.slots) numericSlots.add(slot);
        break;

      // 3D steps
      case "CameraEval":
        objectSlots.add(step.outSlot);
        break;

      case "MeshMaterialize":
        objectSlots.add(step.outSlot);
        break;

      case "Instances3DProjectTo2D":
        objectSlots.add(step.domainSlot);
        objectSlots.add(step.cameraEvalSlot);
        objectSlots.add(step.positionSlot);
        if (step.rotationSlot !== undefined) objectSlots.add(step.rotationSlot);
        if (step.scaleSlot !== undefined) objectSlots.add(step.scaleSlot);
        objectSlots.add(step.colorRSlot);
        objectSlots.add(step.colorGSlot);
        objectSlots.add(step.colorBSlot);
        objectSlots.add(step.colorASlot);
        objectSlots.add(step.radiusSlot);
        objectSlots.add(step.outSlot);
        break;
    }
  }

  if (program.schedule.initialSlotValues !== undefined) {
    for (const slotStr of Object.keys(program.schedule.initialSlotValues)) {
      const slot = Number(slotStr);
      if (!Number.isNaN(slot)) {
        objectSlots.add(slot);
      }
    }
  }

  // Build metadata for all slots
  const slotMeta: SlotMeta[] = [];

  // Numeric slots get f64 storage
  for (const slot of numericSlots) {
    slotMeta.push({
      slot,
      storage: "f64",
      offset: slot, // Dense allocation: offset = slot index
      type: asTypeDesc({
        world: "signal",
        domain: "float",
      }),
    });
  }

  // Object slots get object storage
  for (const slot of objectSlots) {
    if (numericSlots.has(slot)) {
      continue;
    }
    slotMeta.push({
      slot,
      storage: "object",
      offset: slot, // Dense allocation: offset = slot index
      type: asTypeDesc({
        // Field buffers and render trees are "special" world objects
        world: "config",
        domain: "renderTree", // Generic object domain for buffers/trees
      }),
    });
  }

  // Sort by slot index for consistent ordering
  slotMeta.sort((a, b) => a.slot - b.slot);

  return slotMeta;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create RuntimeState from a compiled program.
 *
 * Allocates ValueStore and StateBuffer based on program metadata,
 * and initializes state cells from the constant pool.
 *
 * @param program - Compiled program
 * @param viewport - Viewport info for 3D projection (optional, defaults to 1920x1080@1)
 * @returns Initialized RuntimeState
 */
export function createRuntimeState(
  program: CompiledProgramIR,
  viewport?: ViewportInfo
): RuntimeState {
  // Extract slot metadata (placeholder extraction for Sprint 1)
  const slotMeta = extractSlotMeta(program);

  // Create ValueStore with real implementation
  const values = createValueStore(slotMeta);

  // Initialize slots with compile-time values from schedule
  // These include batch descriptor lists for render assembly
  if (program.schedule?.initialSlotValues !== undefined) {
    for (const [slotStr, value] of Object.entries(program.schedule.initialSlotValues)) {
      const slot = Number(slotStr);
      values.write(slot, value);
    }
  }

  // Create StateBuffer with real implementation
  // Guard against incomplete program objects (used in some tests)
  const stateLayout = program.stateLayout ?? {
    cells: [],
    f64Size: 0,
    f32Size: 0,
    i32Size: 0,
  };
  const state = createStateBuffer(stateLayout);

  // Initialize state cells with values from const pool
  const constPool = program.constants ?? {
    json: [],
    f64: new Float64Array([]),
    f32: new Float32Array([]),
    i32: new Int32Array([]),
    constIndex: [],
  };
  initializeState(state, stateLayout, constPool);

  // Create real FrameCache with default capacities
  // TODO: Derive capacities from SignalExprTable and FieldExprTable when available
  const sigCapacity = 1024; // Default signal cache capacity
  const fieldCapacity = 512; // Default field cache capacity
  const frameCache = createFrameCache(sigCapacity, fieldCapacity);

  // Create time state for wrap detection
  const timeState = createTimeState();

  // Create EventStore for discrete event triggers
  const events = new EventStore();

  // Create 3D stores
  const cameraStore = new CameraStore();
  const meshStore = new MeshStore();

  // Initialize camera and mesh tables if present in program
  if (program.cameras !== undefined) {
    cameraStore.setCameraTable(program.cameras);
  }
  if (program.meshes !== undefined) {
    meshStore.setMeshTable(program.meshes);
  }

  // Default viewport (1920x1080 @ 1x DPR)
  const defaultViewport: ViewportInfo = viewport ?? {
    width: 1920,
    height: 1080,
    dpr: 1,
  };

  const runtimeState: RuntimeState = {
    values,
    state,
    events,
    frameCache,
    frameId: 0,
    timeState,
    cameraStore,
    meshStore,
    viewport: defaultViewport,

    // Hot-swap implementation
    hotSwap(newProgram: CompiledProgramIR): RuntimeState {
      // Create new runtime from new program (preserve viewport)
      const newRuntime = createRuntimeState(newProgram, this.viewport);

      // Preserve state cells from old to new
      preserveState(this, newRuntime, program, newProgram);

      // Preserve time continuity
      newRuntime.frameId = this.frameId;
      newRuntime.frameCache.frameId = this.frameCache.frameId;
      newRuntime.timeState.prevTModelMs = this.timeState.prevTModelMs;

      // Invalidate caches (preserving frameId)
      newRuntime.frameCache.invalidate();
      newRuntime.cameraStore.invalidateAll();
      newRuntime.meshStore.invalidateAll();

      // EventStore does not need preservation (resets each frame)

      return newRuntime;
    },
  };

  return runtimeState;
}
