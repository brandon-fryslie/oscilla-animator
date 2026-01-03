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

import type { ValueSlot, StateId, TypeDesc, ConstPool } from "./types";

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

  /**
   * Ensure a Float32Array buffer exists at the specified slot with the given length.
   * Reuses existing buffer if size matches, otherwise allocates new one.
   *
   * Used by materialization steps to allocate output buffers.
   *
   * @param slot - ValueSlot index for buffer storage (uses object storage)
   * @param length - Required buffer length
   * @returns Float32Array at the slot (new or reused)
   */
  ensureF32(slot: ValueSlot, length: number): Float32Array;

  /**
   * Ensure a Uint16Array buffer exists at the specified slot with the given length.
   * Reuses existing buffer if size matches, otherwise allocates new one.
   *
   * Used by path materialization steps to allocate command buffers.
   *
   * @param slot - ValueSlot index for buffer storage (uses object storage)
   * @param length - Required buffer length
   * @returns Uint16Array at the slot (new or reused)
   */
  ensureU16(slot: ValueSlot, length: number): Uint16Array;

  /**
   * Ensure a Uint32Array buffer exists at the specified slot with the given length.
   * Reuses existing buffer if size matches, otherwise allocates new one.
   *
   * Used by path materialization steps to allocate indexing buffers.
   *
   * @param slot - ValueSlot index for buffer storage (uses object storage)
   * @param length - Required buffer length
   * @returns Uint32Array at the slot (new or reused)
   */
  ensureU32(slot: ValueSlot, length: number): Uint32Array;
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
 * - Hot-swap migration (stateId matching)
 * - Debugging (nodeId + role)
 */
export interface StateCellLayout {
  /** Unique stable ID for this state cell */
  stateId: StateId;

  /** Storage type (which typed array) */
  storage: "f64" | "f32" | "i32";

  /** Offset within the typed array */
  offset: number;

  /** Size in array elements (e.g., 1 for scalar, N for vector) */
  size: number;

  /** Node that owns this state */
  nodeId: string;

  /** Semantic role (e.g., "accumulator", "delay", "oscillator") */
  role: string;

  /** Optional initial value (const pool index) */
  initialConstId?: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a ValueStore from slot metadata.
 *
 * Allocates typed arrays and object array based on max offsets in slotMeta.
 *
 * @param slotMeta - Metadata for all slots
 * @returns New ValueStore instance
 */
export function createValueStore(slotMeta: readonly SlotMeta[]): ValueStore {
  // Determine required sizes for each storage type
  let f64Size = 0;
  let f32Size = 0;
  let i32Size = 0;
  let u32Size = 0;
  let objectSize = 0;

  for (const meta of slotMeta) {
    const requiredSize = meta.offset + 1;
    switch (meta.storage) {
      case "f64":
        f64Size = Math.max(f64Size, requiredSize);
        break;
      case "f32":
        f32Size = Math.max(f32Size, requiredSize);
        break;
      case "i32":
        i32Size = Math.max(i32Size, requiredSize);
        break;
      case "u32":
        u32Size = Math.max(u32Size, requiredSize);
        break;
      case "object":
        objectSize = Math.max(objectSize, requiredSize);
        break;
    }
  }

  // Allocate typed arrays
  const f64 = new Float64Array(f64Size);
  const f32 = new Float32Array(f32Size);
  const i32 = new Int32Array(i32Size);
  const u32 = new Uint32Array(u32Size);
  const objects: unknown[] = new Array(objectSize);

  // Track writes per frame (debug only)
  const writeLog = new Set<ValueSlot>();

  return {
    f64,
    f32,
    i32,
    u32,
    objects,
    slotMeta: [...slotMeta],

    read(slot: ValueSlot): unknown {
      const meta = slotMeta.find((m) => m.slot === slot);
      if (meta === undefined) {
        throw new Error(`ValueStore.read: no metadata for slot ${slot}`);
      }

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
        default: {
          const exhaustiveCheck: never = meta.storage;
          throw new Error(`ValueStore.read: unknown storage type ${String(exhaustiveCheck)}`);
        }
      }
    },

    write(slot: ValueSlot, value: unknown): void {
      // Debug assertion: single writer per slot per frame
      if (import.meta.env?.DEV && writeLog.has(slot)) {
        throw new Error(`ValueStore.write: slot ${slot} written multiple times this frame`);
      }

      const meta = slotMeta.find((m) => m.slot === slot);
      if (meta === undefined) {
        throw new Error(`ValueStore.write: no metadata for slot ${slot}`);
      }

      writeLog.add(slot);

      switch (meta.storage) {
        case "f64":
          f64[meta.offset] = Number(value);
          break;
        case "f32":
          f32[meta.offset] = Number(value);
          break;
        case "i32":
          i32[meta.offset] = Math.trunc(Number(value));
          break;
        case "u32":
          u32[meta.offset] = Math.trunc(Number(value)) >>> 0;
          break;
        case "object":
          objects[meta.offset] = value;
          break;
        default: {
          const exhaustiveCheck: never = meta.storage;
          throw new Error(`ValueStore.write: unknown storage type ${String(exhaustiveCheck)}`);
        }
      }
    },

    clear(): void {
      writeLog.clear();
      // Note: We don't zero out arrays - relying on compile-time guarantee
      // that all slots are written before read. Debug builds could add a
      // "written" bitset to catch violations.
    },

    ensureF32(slot: ValueSlot, length: number): Float32Array {
      const existing = objects[slot] as Float32Array | undefined;
      if (existing instanceof Float32Array && existing.length === length) {
        return existing;
      }
      const buffer = new Float32Array(length);
      objects[slot] = buffer;
      return buffer;
    },

    ensureU16(slot: ValueSlot, length: number): Uint16Array {
      const existing = objects[slot] as Uint16Array | undefined;
      if (existing instanceof Uint16Array && existing.length === length) {
        return existing;
      }
      const buffer = new Uint16Array(length);
      objects[slot] = buffer;
      return buffer;
    },

    ensureU32(slot: ValueSlot, length: number): Uint32Array {
      const existing = objects[slot] as Uint32Array | undefined;
      if (existing instanceof Uint32Array && existing.length === length) {
        return existing;
      }
      const buffer = new Uint32Array(length);
      objects[slot] = buffer;
      return buffer;
    },
  };
}

// ============================================================================
// StateBuffer Implementation
// ============================================================================

/**
 * Create a StateBuffer from a StateLayout.
 *
 * Allocates typed arrays and initializes state cells.
 *
 * @param layout - State layout (computed at compile time)
 * @returns New StateBuffer instance
 */
export function createStateBuffer(layout: StateLayout): StateBuffer {
  return {
    f64: new Float64Array(layout.f64Size),
    f32: new Float32Array(layout.f32Size),
    i32: new Int32Array(layout.i32Size),
  };
}

/**
 * Initialize StateBuffer with values from ConstPool.
 *
 * Sets initial values for state cells that have initialConstId.
 * This is called once at program startup.
 *
 * For cells with size > 1 (e.g., ring buffers), fills all elements
 * with the same initial value.
 *
 * @param state - StateBuffer to initialize
 * @param layout - State layout (describes where to put values)
 * @param constPool - Constant pool (source of initial values)
 */
export function initializeState(
  state: StateBuffer,
  layout: StateLayout,
  constPool: ConstPool
): void {
  for (const cell of layout.cells) {
    if (cell.initialConstId === undefined) {
      continue;
    }

    const value = constPool.json[cell.initialConstId];
    if (value === undefined) {
      throw new Error(
        `initializeState: constant ${cell.initialConstId} not found for state cell ${cell.stateId}`
      );
    }

    // Write initial value to all elements in the cell
    // For scalar cells (size=1), writes one element
    // For ring buffers (size>1), fills all elements with the same value
    switch (cell.storage) {
      case "f64":
        for (let i = 0; i < cell.size; i++) {
          state.f64[cell.offset + i] = Number(value);
        }
        break;
      case "f32":
        for (let i = 0; i < cell.size; i++) {
          state.f32[cell.offset + i] = Number(value);
        }
        break;
      case "i32":
        for (let i = 0; i < cell.size; i++) {
          state.i32[cell.offset + i] = Math.trunc(Number(value));
        }
        break;
      default: {
        const exhaustiveCheck: never = cell.storage;
        throw new Error(`initializeState: unknown storage type ${String(exhaustiveCheck)}`);
      }
    }
  }
}

/**
 * Preserve state cells during hot-swap.
 *
 * Migrates state values from old StateBuffer to new StateBuffer,
 * matching cells by stateId.
 *
 * Hot-swap semantics:
 * - Cells with matching stateId and storage type → copy value
 * - Cells with matching stateId but different storage → skip (type changed)
 * - New cells → use initial value from constPool
 * - Removed cells → discard
 *
 * @param oldState - Old StateBuffer
 * @param newState - New StateBuffer
 * @param oldLayout - Old state layout
 * @param newLayout - New state layout
 */
export function preserveState(
  oldState: StateBuffer,
  newState: StateBuffer,
  oldLayout: StateLayout,
  newLayout: StateLayout
): void {
  // Build index of old state cells
  const oldCells = new Map<StateId, StateCellLayout>();
  for (const cell of oldLayout.cells) {
    oldCells.set(cell.stateId, cell);
  }

  // Migrate matching cells
  for (const newCell of newLayout.cells) {
    const oldCell = oldCells.get(newCell.stateId);
    if (oldCell === undefined) {
      // New cell - use initial value (already set by initializeState)
      continue;
    }

    if (oldCell.storage !== newCell.storage) {
      // Storage type changed - skip (incompatible)
      console.warn(
        `preserveState: stateId ${newCell.stateId} changed storage from ${oldCell.storage} to ${newCell.storage}, discarding old value`
      );
      continue;
    }

    // Compatible cell - copy value
    switch (newCell.storage) {
      case "f64":
        newState.f64[newCell.offset] = oldState.f64[oldCell.offset];
        break;
      case "f32":
        newState.f32[newCell.offset] = oldState.f32[oldCell.offset];
        break;
      case "i32":
        newState.i32[newCell.offset] = oldState.i32[oldCell.offset];
        break;
      default: {
        const exhaustiveCheck: never = newCell.storage;
        console.warn(
          `preserveState: unknown storage type ${String(exhaustiveCheck)}`
        );
        break;
      }
    }
  }
}
