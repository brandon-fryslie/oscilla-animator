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
 * Canonical invariants (NO OPTIONS):
 * - program.slotMeta is REQUIRED for any program whose schedule touches slots.
 * - Runtime must NOT infer slot metadata from the schedule.
 * - Offsets are computed by the compiler and emitted in program.slotMeta.
 * - constants are JSON-only (program.constants.json).
 */

import type { CompiledProgramIR } from "../../compiler/ir/program";
import type { ValueStore, StateBuffer } from "../../compiler/ir";
import {
  createValueStore,
  createStateBuffer,
  initializeState,
} from "../../compiler/ir/stores";

import type { FieldHandle } from "../field/types";
import { preserveState } from "./StateSwap";

import { CameraStore } from "../camera/CameraStore";
import { MeshStore } from "../mesh/MeshStore";
import type { ViewportInfo } from "../camera/evaluateCamera";

import { createTimeState, type TimeState } from "./timeResolution";
import { EventStore } from "./EventStore";

// ============================================================================
// Canonical SlotMeta (runtime storage contract)
// ============================================================================

/**
 * SlotMeta - runtime storage mapping for a ValueSlot.
 *
 * offset semantics (canonical):
 * - For numeric stores (f64/f32/i32/u32): offset is the element index into that typed array.
 * - For object store: offset is the index into the object array.
 *
 * Offsets are per-store, NOT global.
 */
export interface SlotMeta {
  slot: number;
  storage: "f64" | "f32" | "i32" | "u32" | "object";
  offset: number;
  type: unknown; // TypeDesc; kept as unknown to avoid circular dependency
  debugName?: string;
}

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
   * Stores complete buffer handles from materialize steps.
   */
  fieldBuffers: Map<string, unknown>;

  /** Start a new frame (increment frameId, clear buffer pool). */
  newFrame(): void;

  /** Invalidate all caches (zero stamps, clear buffer pool). */
  invalidate(): void;
}

// ============================================================================
// FrameCache Factory
// ============================================================================

/**
 * Create a FrameCache with specified capacities.
 *
 * FrameId starts at 1 to avoid collision with initial Uint32Array values (0).
 */
export function createFrameCache(sigCapacity: number, fieldCapacity: number): FrameCache {
  const sigValue = new Float64Array(sigCapacity);
  const sigStamp = new Uint32Array(sigCapacity);
  const sigValidMask = new Uint8Array(sigCapacity);

  const fieldHandle: FieldHandle[] = [];
  fieldHandle.length = fieldCapacity;
  const fieldStamp = new Uint32Array(fieldCapacity);

  const fieldBuffers = new Map<string, unknown>();

  return {
    frameId: 1,
    sigValue,
    sigStamp,
    sigValidMask,
    fieldHandle,
    fieldStamp,
    fieldBuffers,

    newFrame(): void {
      this.frameId++;
      this.fieldBuffers.clear();
      // stamp arrays remain; frameId comparison invalidates stale entries
    },

    invalidate(): void {
      this.sigStamp.fill(0);
      this.fieldStamp.fill(0);
      this.fieldBuffers.clear();
      // frameId remains monotonic
    },
  };
}

// ============================================================================
// Strict slotMeta requirement
// ============================================================================

/**
 * True if schedule contains any steps that read/write slots.
 *
 * This is used ONLY to decide whether slotMeta must be present.
 */
function scheduleHasSlotOperations(program: CompiledProgramIR): boolean {
  const steps = program.schedule?.steps;
  if (steps === undefined || steps.length === 0) return false;

  for (const step of steps) {
    switch (step.kind) {
      case "timeDerive":
      case "signalEval":
      case "nodeEval":
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
        // Debug probes do not affect correctness; ignore them for "required" decision.
        continue;
      default:
        continue;
    }
  }
  return false;
}

/**
 * Extract slot metadata from program (STRICT).
 *
 * Canonical behavior:
 * - If schedule has slot operations, program.slotMeta MUST be present and non-empty.
 * - Runtime never infers slotMeta from the schedule.
 */
function extractSlotMeta(program: CompiledProgramIR): SlotMeta[] {
  const meta = (program.slotMeta ?? []) as unknown as SlotMeta[];
  if (meta.length === 0 && scheduleHasSlotOperations(program)) {
    throw new Error(
      `RuntimeState: program.slotMeta is required for IR execution (schedule touches slots) but is empty/undefined.`
    );
  }
  return [...meta];
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
 * Canonical:
 * - constants are JSON-only: program.constants.json
 * - slotMeta must be present for any slot-touching schedule
 */
export function createRuntimeState(
  program: CompiledProgramIR,
  viewport?: ViewportInfo
): RuntimeState {
  // Slot metadata is required for IR execution (strict).
  const slotMeta = extractSlotMeta(program);

  // Create ValueStore (real allocation uses SlotMeta.offset/storage).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const values = createValueStore(slotMeta as any);

  // Initialize slots with compile-time values from schedule (if any).
  // (Used for batch descriptor lists, etc.)
  const initial = program.schedule?.initialSlotValues;
  if (initial !== undefined) {
    for (const [slotStr, value] of Object.entries(initial)) {
      const slot = Number(slotStr);
      if (!Number.isNaN(slot)) {
        values.write(slot, value);
      }
    }
  }

  // Create StateBuffer (program.stateLayout is required by contract, but keep guard for tests).
  const stateLayout = program.stateLayout ?? {
    cells: [],
    f64Size: 0,
    f32Size: 0,
    i32Size: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const state = createStateBuffer(stateLayout as any);

  // Initialize state from constants (JSON-only).
  const constPool = program.constants ?? { json: [] };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  initializeState(state as any, stateLayout as any, constPool as any);

  // FrameCache capacities MUST be derived from program tables (no guessing).
  const sigCapacity = program.signalExprs?.nodes?.length ?? 0;
  const fieldCapacity = program.fieldExprs?.nodes?.length ?? 0;
  const frameCache = createFrameCache(sigCapacity, fieldCapacity);

  // Time wrap detection state.
  const timeState = createTimeState();

  // Discrete events per frame.
  const events = new EventStore();

  // 3D stores.
  const cameraStore = new CameraStore();
  const meshStore = new MeshStore();

  if (program.cameras !== undefined) {
    cameraStore.setCameraTable(program.cameras);
  }
  if (program.meshes !== undefined) {
    meshStore.setMeshTable(program.meshes);
  }

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

    hotSwap(newProgram: CompiledProgramIR): RuntimeState {
      // Create new runtime from new program (preserve viewport).
      const newRuntime = createRuntimeState(newProgram, this.viewport);

      // Preserve state cells from old to new.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      preserveState(this as any, newRuntime as any, program, newProgram);

      // Preserve time continuity.
      newRuntime.frameId = this.frameId;
      newRuntime.frameCache.frameId = this.frameCache.frameId;
      newRuntime.timeState.prevTModelMs = this.timeState.prevTModelMs;

      // Invalidate caches (preserving frameId).
      newRuntime.frameCache.invalidate();
      newRuntime.cameraStore.invalidateAll();
      newRuntime.meshStore.invalidateAll();

      // EventStore does not need preservation (it resets each frame).
      return newRuntime;
    },
  };

  return runtimeState;
}
