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
// Factory Function
// ============================================================================

/**
 * Create RuntimeState from a compiled program.
 *
 * Stub implementation for Sprint 1 - creates placeholder stores.
 * Full implementation in Sprint 2 will allocate properly sized storage.
 *
 * @param _program - Compiled program (not used in stub)
 * @returns Initialized RuntimeState
 */
export function createRuntimeState(
  _program: unknown, // CompiledProgramIR - avoid circular import
): RuntimeState {
  // Stub implementation - Sprint 2 will allocate based on program metadata
  // For Sprint 1, we create a simple stub that allows basic testing
  const stubWriteLog: Set<number> = new Set();

  const stubValueStore: ValueStore = {
    f64: new Float64Array(1024), // stub allocation
    f32: new Float32Array(512),
    i32: new Int32Array(256),
    u32: new Uint32Array(256),
    objects: new Array(256).fill(undefined),
    slotMeta: [],

    read(slot: number): unknown {
      // Stub: read from object array (everything stored there for simplicity)
      return stubValueStore.objects[slot];
    },

    write(slot: number, value: unknown): void {
      // Stub single-writer check (Sprint 1 level)
      if (stubWriteLog.has(slot)) {
        throw new Error(`ValueStore: slot ${slot} written twice in same frame`);
      }
      stubWriteLog.add(slot);

      // Stub: write to object array (simple for Sprint 1)
      stubValueStore.objects[slot] = value;
    },

    clear(): void {
      // Stub: reset write tracking for new frame
      stubWriteLog.clear();
      // Note: We don't clear the actual values - they persist until overwritten
      // This is fine for Sprint 1 testing
    },
  };

  const stubStateBuffer: StateBuffer = {
    f64: new Float64Array(512), // stub allocation
    f32: new Float32Array(256),
    i32: new Int32Array(128),
  };

  const stubFrameCache: FrameCache = {
    frameId: 0,
    newFrame(): void {
      this.frameId++;
    },
    invalidate(): void {
      // Stub: no-op
    },
  };

  return {
    values: stubValueStore,
    state: stubStateBuffer,
    frameCache: stubFrameCache,
    frameId: 0,
  };
}
