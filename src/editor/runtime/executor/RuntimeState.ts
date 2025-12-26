/**
 * Runtime State - Per-Frame Execution State
 *
 * Container for all runtime state needed during frame execution.
 *
 * Contains:
 * - ValueStore: per-frame slot-based value storage
 * - StateBuffer: cross-frame persistent state
 * - FrameCache: memoization cache (placeholder for Sprint 2)
 * - frameId: monotonic frame counter
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor)
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §8
 */

import type { ValueStore, StateBuffer } from "../../compiler/ir";
import {
  createValueStore,
  createStateBuffer,
  initializeState,
} from "../../compiler/ir/stores";
import type { SlotMeta } from "../../compiler/ir/stores";
import type { CompiledProgramIR } from "../../compiler/ir/program";

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

  /** Frame cache (per-frame memoization) - placeholder for Sprint 2 */
  frameCache: FrameCache;

  /** Monotonic frame counter */
  frameId: number;
}

// ============================================================================
// FrameCache Interface (Placeholder for Sprint 2)
// ============================================================================

/**
 * FrameCache - Per-Frame Memoization
 *
 * Caches signal values, field handles, and materialized buffers per frame.
 * Full implementation deferred to Phase 6 Sprint 2.
 *
 * References:
 * - HANDOFF.md Topic 4 (FrameCache System)
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §8
 */
export interface FrameCache {
  /** Current frame ID */
  frameId: number;

  /**
   * Start a new frame.
   * Increments frameId and invalidates per-frame caches.
   */
  newFrame(): void;

  /**
   * Invalidate all caches.
   * Used during hot-swap or debug reset.
   */
  invalidate(): void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract slot metadata from program schedule.
 *
 * This is a placeholder implementation for Sprint 1.
 * In future sprints, the compiler will emit slotMeta directly in CompiledProgramIR.
 *
 * Current strategy:
 * - Scan all steps for inputSlots and outputSlots
 * - Assign f64 storage to all slots by default (conservative)
 * - Use dense offset allocation (offset = slot index)
 *
 * @param program - Compiled program
 * @returns Slot metadata array
 */
function extractSlotMeta(program: CompiledProgramIR): SlotMeta[] {
  const slotSet = new Set<number>();

  // Guard against incomplete program objects (used in some tests)
  if (!program.schedule || !program.schedule.steps) {
    return [];
  }

  // Collect all slot indices from schedule steps
  for (const step of program.schedule.steps) {
    switch (step.kind) {
      case "timeDerive":
        slotSet.add(step.tAbsMsSlot);
        slotSet.add(step.out.tModelMs);
        if (step.out.phase01 !== undefined) slotSet.add(step.out.phase01);
        if (step.out.wrapEvent !== undefined) slotSet.add(step.out.wrapEvent);
        if (step.out.progress01 !== undefined) slotSet.add(step.out.progress01);
        break;

      case "nodeEval":
        for (const slot of step.inputSlots) slotSet.add(slot);
        for (const slot of step.outputSlots) slotSet.add(slot);
        break;

      case "busEval":
        slotSet.add(step.outSlot);
        for (const pub of step.publishers) {
          slotSet.add(pub.srcSlot);
        }
        break;

      case "materialize":
        slotSet.add(step.materialization.domainSlot);
        slotSet.add(step.materialization.outBufferSlot);
        break;

      case "renderAssemble":
        slotSet.add(step.outSlot);
        break;

      case "debugProbe":
        for (const slot of step.probe.slots) slotSet.add(slot);
        break;
    }
  }

  // Convert to sorted array and build metadata
  const slots = Array.from(slotSet).sort((a, b) => a - b);
  const slotMeta: SlotMeta[] = slots.map((slot) => ({
    slot,
    storage: "f64", // Conservative default for Sprint 1
    offset: slot, // Dense allocation: offset = slot index
    type: {
      // Default type - will be refined in future sprints
      world: "signal",
      domain: "number",
    },
  }));

  return slotMeta;
}

/**
 * Create a stub FrameCache for Sprint 1.
 *
 * Full implementation deferred to Sprint 2.
 *
 * @returns Stub FrameCache
 */
function createFrameCache(): FrameCache {
  return {
    frameId: 0,
    newFrame(): void {
      this.frameId++;
    },
    invalidate(): void {
      // Stub: no-op
    },
  };
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
 * @returns Initialized RuntimeState
 */
export function createRuntimeState(program: CompiledProgramIR): RuntimeState {
  // Extract slot metadata (placeholder extraction for Sprint 1)
  const slotMeta = extractSlotMeta(program);

  // Create ValueStore with real implementation
  const values = createValueStore(slotMeta);

  // Create StateBuffer with real implementation
  // Guard against incomplete program objects (used in some tests)
  const stateLayout = program.stateLayout || {
    cells: [],
    f64Size: 0,
    f32Size: 0,
    i32Size: 0,
  };
  const state = createStateBuffer(stateLayout);

  // Initialize state cells with values from const pool
  const constPool = program.constants || {
    json: [],
    f64: new Float64Array([]),
    f32: new Float32Array([]),
    i32: new Int32Array([]),
    constIndex: [],
  };
  initializeState(state, stateLayout, constPool);

  // Create stub FrameCache (Sprint 2 will implement full cache)
  const frameCache = createFrameCache();

  return {
    values,
    state,
    frameCache,
    frameId: 0,
  };
}
