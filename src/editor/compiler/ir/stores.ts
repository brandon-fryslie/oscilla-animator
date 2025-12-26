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
import type { ConstPool } from "./program";

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
 * Allocates typed arrays based on slot metadata and provides slot-based
 * read/write operations with single-writer enforcement.
 *
 * @param slotMeta - Array of slot metadata
 * @returns Initialized ValueStore
 */
export function createValueStore(slotMeta: SlotMeta[]): ValueStore {
  // Calculate required array sizes by finding max offset for each storage type
  const sizes = {
    f64: 0,
    f32: 0,
    i32: 0,
    u32: 0,
    object: 0,
  };

  for (const meta of slotMeta) {
    const requiredSize = meta.offset + 1;
    sizes[meta.storage] = Math.max(sizes[meta.storage], requiredSize);
  }

  // Validate sizes before allocation
  for (const [key, size] of Object.entries(sizes)) {
    if (!Number.isFinite(size) || size < 0) {
      console.error(`[ValueStore] Invalid size for ${key}:`, size, 'slotMeta:', slotMeta);
      throw new Error(`Invalid ValueStore size for ${key}: ${size}`);
    }
  }

  // Allocate typed arrays
  const f64 = new Float64Array(sizes.f64);
  const f32 = new Float32Array(sizes.f32);
  const i32 = new Int32Array(sizes.i32);
  const u32 = new Uint32Array(sizes.u32);
  const objects = new Array(sizes.object).fill(undefined);

  // Track which slots have been written in current frame
  const writeLog = new Set<ValueSlot>();

  // Build lookup map from slot to metadata for O(1) access
  const slotLookup = new Map<ValueSlot, SlotMeta>();
  for (const meta of slotMeta) {
    slotLookup.set(meta.slot, meta);
  }

  return {
    f64,
    f32,
    i32,
    u32,
    objects,
    slotMeta,

    read(slot: ValueSlot): unknown {
      const meta = slotLookup.get(slot);
      if (!meta) {
        throw new Error(`ValueStore.read: slot ${slot} not found in slotMeta`);
      }

      // Read from appropriate storage based on metadata
      switch (meta.storage) {
        case "f64":
          return f64[meta.offset];
        case "f32":
          return f32[meta.offset];
        case "i32":
          return i32[meta.offset];
        case "u32":
          return u32[meta.offset];
        case "object":
          return objects[meta.offset];
        default:
          throw new Error(`ValueStore.read: unknown storage type ${meta.storage}`);
      }
    },

    write(slot: ValueSlot, value: unknown): void {
      // Enforce single-writer invariant
      if (writeLog.has(slot)) {
        throw new Error(`ValueStore.write: slot ${slot} already written this frame`);
      }
      writeLog.add(slot);

      const meta = slotLookup.get(slot);
      if (!meta) {
        throw new Error(`ValueStore.write: slot ${slot} not found in slotMeta`);
      }

      // Write to appropriate storage based on metadata
      switch (meta.storage) {
        case "f64":
          f64[meta.offset] = value as number;
          break;
        case "f32":
          f32[meta.offset] = value as number;
          break;
        case "i32":
          i32[meta.offset] = value as number;
          break;
        case "u32":
          u32[meta.offset] = value as number;
          break;
        case "object":
          objects[meta.offset] = value;
          break;
        default:
          throw new Error(`ValueStore.write: unknown storage type ${meta.storage}`);
      }
    },

    clear(): void {
      // Reset write tracking for new frame
      // Note: We don't clear the actual values - they persist until overwritten
      // This is an optimization: old values will be overwritten on next write
      writeLog.clear();
    },
  };
}

/**
 * Create a StateBuffer from state layout.
 *
 * Allocates typed arrays for persistent state storage based on layout sizes.
 *
 * @param layout - State layout specification
 * @returns Initialized StateBuffer with allocated typed arrays
 */
export function createStateBuffer(layout: StateLayout): StateBuffer {
  return {
    f64: new Float64Array(layout.f64Size),
    f32: new Float32Array(layout.f32Size),
    i32: new Int32Array(layout.i32Size),
  };
}

/**
 * Initialize state cells with default values.
 *
 * Populates state cells with initial values from the constant pool.
 * If no initialConstId is specified, cells default to zero.
 *
 * @param buffer - StateBuffer to initialize
 * @param layout - State layout
 * @param constPool - Constant pool for initial values
 */
export function initializeState(
  buffer: StateBuffer,
  layout: StateLayout,
  constPool: ConstPool,
): void {
  for (const cell of layout.cells) {
    // Determine initial value
    let initialValue = 0; // Default to zero

    if (cell.initialConstId !== undefined) {
      // Lookup value in const pool
      const constEntry = constPool.constIndex[cell.initialConstId];
      if (!constEntry) {
        throw new Error(
          `initializeState: constId ${cell.initialConstId} not found in constPool for state cell ${cell.stateId}`,
        );
      }

      // Read value from appropriate const pool storage
      switch (constEntry.k) {
        case "f64":
          initialValue = constPool.f64[constEntry.idx];
          break;
        case "f32":
          initialValue = constPool.f32[constEntry.idx];
          break;
        case "i32":
          initialValue = constPool.i32[constEntry.idx];
          break;
        default:
          throw new Error(
            `initializeState: invalid const type ${constEntry.k} for state cell ${cell.stateId}`,
          );
      }
    }

    // Write initial value to state buffer
    const targetArray = buffer[cell.storage];
    const startOffset = cell.offset;
    const endOffset = startOffset + cell.size;

    // Fill all elements (for ring buffers, size > 1)
    for (let i = startOffset; i < endOffset; i++) {
      targetArray[i] = initialValue;
    }
  }
}
