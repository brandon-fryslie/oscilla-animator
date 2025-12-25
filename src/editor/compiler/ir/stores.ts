/**
 * Storage Interfaces - ValueStore and StateBuffer
 *
 * This module defines the runtime storage interfaces for values and state.
 *
 * ValueStore: Per-frame slot-based typed storage for intermediate values
 * StateBuffer: Cross-frame persistent state storage for stateful nodes
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §18
 * - HANDOFF.md Topic 1 (ValueStore)
 * - HANDOFF.md Topic 2 (StateBuffer)
 */

import type { ValueSlot, StateId, TypeDesc } from "./types";

// ============================================================================
// ValueStore Interface (HANDOFF.md Topic 1)
// ============================================================================

/**
 * ValueStore - Slot-Based Typed Value Storage
 *
 * The ValueStore holds all intermediate values during frame execution.
 * It uses typed arrays for performance and explicit slot addressing.
 *
 * Key invariants:
 * - Single writer per slot per frame (compile-time guarantee)
 * - No reads of uninitialized slots (compile-time guarantee, runtime debug assertion)
 * - Slots are dense indices (0..N-1)
 *
 * Design:
 * - Separate typed arrays for each storage type (f64, f32, i32, u32)
 * - Object array for complex types (FieldHandles, RenderTrees, etc.)
 * - Slot metadata tracks storage type, offset, and TypeDesc
 */
export interface ValueStore {
  // Typed arrays for primitive storage
  /** 64-bit floating point values (numbers, phases, etc.) */
  f64: Float64Array;

  /** 32-bit floating point values */
  f32: Float32Array;

  /** 32-bit signed integers */
  i32: Int32Array;

  /** 32-bit unsigned integers */
  u32: Uint32Array;

  // Object storage for complex types
  /** Object storage (FieldHandles, RenderTrees, buffers, etc.) */
  objects: unknown[];

  // Slot metadata
  /** Metadata for each slot (parallel to slot indices) */
  slotMeta: SlotMeta[];

  // Methods
  /**
   * Read a value from a slot.
   *
   * @param slot - ValueSlot index
   * @returns The value stored in the slot
   * @throws Error if slot is uninitialized (debug builds only)
   */
  read(slot: ValueSlot): unknown;

  /**
   * Write a value to a slot.
   *
   * @param slot - ValueSlot index
   * @param value - Value to write
   * @throws Error if slot already written this frame (debug builds only)
   */
  write(slot: ValueSlot, value: unknown): void;

  /**
   * Clear all slot values for new frame.
   * Resets write tracking but preserves storage arrays.
   */
  clear(): void;
}

/**
 * Slot Metadata
 *
 * Describes how a ValueSlot is stored and what type it holds.
 */
export interface SlotMeta {
  /** Slot index */
  slot: ValueSlot;

  /** Storage type (determines which array to use) */
  storage: "f64" | "f32" | "i32" | "u32" | "object";

  /** Offset within the typed array (or object array) */
  offset: number;

  /** Type descriptor for this slot */
  type: TypeDesc;
}

// ============================================================================
// StateBuffer Interface (HANDOFF.md Topic 2)
// ============================================================================

/**
 * StateBuffer - Persistent State Storage
 *
 * The StateBuffer holds stateful data that persists across frames.
 * Used by nodes like Delay, Integrate, Oscillator, etc.
 *
 * Key invariants:
 * - State is explicit, not hidden in closures
 * - State cells are indexed by StateId
 * - State layout is computed at compile time
 * - Hot-swap preserves compatible state cells (by layout hash)
 *
 * Design:
 * - Separate typed arrays for each storage type (f64, f32, i32)
 * - StateLayout describes allocation and ownership
 * - Each state cell has: stateId, storage type, offset, size, nodeId, role
 */
export interface StateBuffer {
  /** 64-bit floating point state storage */
  f64: Float64Array;

  /** 32-bit floating point state storage */
  f32: Float32Array;

  /** 32-bit signed integer state storage */
  i32: Int32Array;
}

/**
 * State Layout
 *
 * Describes the allocation of all state cells in the StateBuffer.
 * Computed at compile time based on stateful nodes in the patch.
 */
export interface StateLayout {
  /** Array of all state cell allocations */
  cells: StateCellLayout[];

  // Total sizes (used to allocate typed arrays)
  /** Total f64 elements needed */
  f64Size: number;

  /** Total f32 elements needed */
  f32Size: number;

  /** Total i32 elements needed */
  i32Size: number;
}

/**
 * State Cell Layout
 *
 * Describes a single state cell's allocation.
 *
 * Used for:
 * - Runtime state access (offset + size)
 * - Hot-swap matching (nodeId + role + layout hash)
 * - Debugging (nodeId + role labels)
 */
export interface StateCellLayout {
  /** Stable state identifier */
  stateId: StateId;

  /** Storage type */
  storage: "f64" | "f32" | "i32";

  /** Offset within the typed array */
  offset: number;

  /** Number of elements (1 for scalar, N for ring buffers/delay lines) */
  size: number;

  /** Node that owns this state (for hot-swap matching) */
  nodeId: string;

  /** Role/purpose of this state (e.g., 'accumulator', 'ringBuffer', 'phase') */
  role: string;

  /** Optional initial value (constant ID) */
  initialConstId?: number;

  /** State update policy */
  policy?: "frame" | "timeMs"; // frame-based delay vs time-continuous state
}

// ============================================================================
// Factory Functions (Implementation Contracts)
// ============================================================================

/**
 * Create a ValueStore from slot metadata.
 *
 * This is a contract - implementation will be in Phase 6 Sprint 2.
 *
 * @param _slotMeta - Array of slot metadata
 * @returns Initialized ValueStore
 */
export function createValueStore(_slotMeta: SlotMeta[]): ValueStore {
  // Implementation deferred to Phase 6 Sprint 2
  throw new Error("createValueStore: not yet implemented");
}

/**
 * Create a StateBuffer from state layout.
 *
 * This is a contract - implementation will be in Phase 6 Sprint 2.
 *
 * @param _layout - State layout specification
 * @returns Initialized StateBuffer with allocated typed arrays
 */
export function createStateBuffer(_layout: StateLayout): StateBuffer {
  // Implementation deferred to Phase 6 Sprint 2
  throw new Error("createStateBuffer: not yet implemented");
}

/**
 * Initialize state cells with default values.
 *
 * This is a contract - implementation will be in Phase 6 Sprint 2.
 *
 * @param _buffer - StateBuffer to initialize
 * @param _layout - State layout
 * @param _constPool - Constant pool for initial values
 */
export function initializeState(
  _buffer: StateBuffer,
  _layout: StateLayout,
  _constPool: unknown, // ConstPool type from program.ts
): void {
  // Implementation deferred to Phase 6 Sprint 2
  throw new Error("initializeState: not yet implemented");
}
