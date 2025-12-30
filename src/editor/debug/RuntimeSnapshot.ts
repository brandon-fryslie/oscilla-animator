/**
 * Runtime Snapshot Capture
 *
 * Captures complete runtime state for debugging compiler/runtime internals.
 * Snapshots include:
 * - All ValueStore slots with values, types, and source metadata
 * - StateBuffer state (stateful operation accumulators)
 * - Frame metadata (frameId, timestamp)
 *
 * Snapshots are JSON-serializable for export/analysis.
 *
 * References:
 * - .agent_planning/debug-export/PLAN-2025-12-30-031000.md Sprint 8
 * - .agent_planning/debug-export/DOD-2025-12-30-031000.md Deliverable 8.1
 */

import type { RuntimeState } from "../runtime/executor/RuntimeState";
import type { SlotMeta } from "../compiler/ir/stores";

// ============================================================================
// Snapshot Types
// ============================================================================

/**
 * Complete runtime state snapshot
 */
export interface RuntimeSnapshot {
  /** Snapshot metadata */
  metadata: SnapshotMetadata;

  /** ValueStore snapshot (per-frame slot values) */
  valueStore: ValueStoreSnapshot;

  /** StateBuffer snapshot (cross-frame persistent state) */
  stateBuffer: StateBufferSnapshot;
}

/**
 * Snapshot metadata
 */
export interface SnapshotMetadata {
  /** Frame ID when snapshot was captured */
  frameId: number;

  /** Timestamp when snapshot was captured (ISO 8601) */
  timestamp: string;

  /** Total number of slots in ValueStore */
  slotCount: number;

  /** Total number of state cells in StateBuffer */
  stateCellCount: number;
}

/**
 * ValueStore snapshot
 */
export interface ValueStoreSnapshot {
  /** All slot snapshots */
  slots: SlotSnapshot[];
}

/**
 * Individual slot snapshot
 */
export interface SlotSnapshot {
  /** Slot index */
  slot: number;

  /** Storage type */
  storage: "f64" | "f32" | "i32" | "u32" | "object";

  /** Offset within typed array */
  offset: number;

  /** Type descriptor */
  type: {
    world: string;
    domain: string;
  };

  /** Slot value (serialized for JSON compatibility) */
  value: unknown;
}

/**
 * StateBuffer snapshot
 */
export interface StateBufferSnapshot {
  /** All state cell snapshots */
  cells: StateCellSnapshot[];
}

/**
 * Individual state cell snapshot
 */
export interface StateCellSnapshot {
  /** State ID */
  stateId: number;

  /** Storage type */
  storage: "f64" | "f32" | "i32";

  /** Offset within typed array */
  offset: number;

  /** Number of elements (1 for scalar, N for ring buffers) */
  size: number;

  /** Node that owns this state */
  nodeId: string;

  /** Role/purpose of this state */
  role: string;

  /** State values (array for ring buffers) */
  values: number[];
}

// ============================================================================
// Snapshot Capture
// ============================================================================

/**
 * Capture a complete runtime state snapshot.
 *
 * Captures all ValueStore slots with values and types, and all StateBuffer
 * state cells with values. The snapshot is JSON-serializable.
 *
 * @param runtime - RuntimeState to capture
 * @returns Complete runtime snapshot
 *
 * @example
 * ```typescript
 * const snapshot = captureRuntimeSnapshot(runtime);
 * console.log(snapshot.metadata.frameId); // Current frame ID
 * console.log(snapshot.valueStore.slots.length); // Number of slots
 * ```
 */
export function captureRuntimeSnapshot(runtime: RuntimeState): RuntimeSnapshot {
  const metadata = captureMetadata(runtime);
  const valueStore = captureValueStore(runtime);
  const stateBuffer = captureStateBuffer(runtime);

  return {
    metadata,
    valueStore,
    stateBuffer,
  };
}

/**
 * Capture snapshot metadata
 */
function captureMetadata(runtime: RuntimeState): SnapshotMetadata {
  return {
    frameId: runtime.frameId,
    timestamp: new Date().toISOString(),
    slotCount: runtime.values.slotMeta.length,
    stateCellCount: runtime.state.f64.length + runtime.state.f32.length + runtime.state.i32.length,
  };
}

/**
 * Capture ValueStore snapshot
 */
function captureValueStore(runtime: RuntimeState): ValueStoreSnapshot {
  const slots: SlotSnapshot[] = [];

  for (const meta of runtime.values.slotMeta) {
    const slotSnapshot = captureSlot(runtime, meta);
    slots.push(slotSnapshot);
  }

  return { slots };
}

/**
 * Capture a single slot snapshot
 */
function captureSlot(runtime: RuntimeState, meta: SlotMeta): SlotSnapshot {
  // Read value from appropriate storage
  let rawValue: unknown;
  switch (meta.storage) {
    case "f64":
      rawValue = runtime.values.f64[meta.offset];
      break;
    case "f32":
      rawValue = runtime.values.f32[meta.offset];
      break;
    case "i32":
      rawValue = runtime.values.i32[meta.offset];
      break;
    case "u32":
      rawValue = runtime.values.u32[meta.offset];
      break;
    case "object":
      rawValue = runtime.values.objects[meta.offset];
      break;
    default: {
      const exhaustiveCheck: never = meta.storage;
      throw new Error(`Unknown storage type: ${String(exhaustiveCheck)}`);
    }
  }

  // Serialize value for JSON compatibility
  const value = serializeValue(rawValue);

  return {
    slot: meta.slot,
    storage: meta.storage,
    offset: meta.offset,
    type: {
      world: meta.type.world,
      domain: meta.type.domain,
    },
    value,
  };
}

/**
 * Capture StateBuffer snapshot
 *
 * NOTE: StateBuffer doesn't currently expose its layout in RuntimeState,
 * so we return an empty cell array. This will be enhanced when StateLayout
 * becomes accessible from RuntimeState.
 */
function captureStateBuffer(_runtime: RuntimeState): StateBufferSnapshot {
  const cells: StateCellSnapshot[] = [];

  // TODO: When StateLayout is accessible from RuntimeState, iterate over
  // cells and capture their values from state.f64/f32/i32 arrays

  return { cells };
}

/**
 * Serialize a value for JSON compatibility
 *
 * Handles:
 * - Primitives (numbers, strings, booleans) → pass through
 * - Typed arrays (Float32Array, etc.) → convert to regular arrays
 * - Objects → summarize structure (avoid circular refs)
 * - undefined/null → preserve
 */
function serializeValue(value: unknown): unknown {
  // Primitives
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  // Typed arrays → regular arrays
  if (value instanceof Float32Array) {
    return {
      _type: "Float32Array",
      length: value.length,
      values: Array.from(value.slice(0, Math.min(value.length, 100))), // Limit to first 100 for performance
    };
  }
  if (value instanceof Float64Array) {
    return {
      _type: "Float64Array",
      length: value.length,
      values: Array.from(value.slice(0, Math.min(value.length, 100))),
    };
  }
  if (value instanceof Uint16Array) {
    return {
      _type: "Uint16Array",
      length: value.length,
      values: Array.from(value.slice(0, Math.min(value.length, 100))),
    };
  }
  if (value instanceof Uint32Array) {
    return {
      _type: "Uint32Array",
      length: value.length,
      values: Array.from(value.slice(0, Math.min(value.length, 100))),
    };
  }
  if (value instanceof Int32Array) {
    return {
      _type: "Int32Array",
      length: value.length,
      values: Array.from(value.slice(0, Math.min(value.length, 100))),
    };
  }

  // Arrays → serialize elements
  if (Array.isArray(value)) {
    return {
      _type: "Array",
      length: value.length,
      values: value.slice(0, Math.min(value.length, 10)).map(serializeValue),
    };
  }

  // Objects → summarize structure (avoid deep serialization)
  if (typeof value === "object") {
    return {
      _type: "Object",
      constructor: value.constructor?.name ?? "Unknown",
      keys: Object.keys(value).slice(0, 10), // First 10 keys
    };
  }

  // Fallback
  return String(value);
}
