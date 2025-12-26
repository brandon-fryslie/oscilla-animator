/**
 * StateSwap - Hot-swap State Preservation
 *
 * Implements jank-free program hot-swap with state preservation across
 * recompilation. This is a core live editing UX requirement - program
 * swaps must preserve state and time continuity to avoid visual jank.
 *
 * State Preservation Contract (from spec §9.2):
 * - Compute stable keys for old and new state layouts
 * - Preserve state cells where (stableKey, layout) match
 * - Initialize new cells with defaults from const pool
 * - Drop removed cells (no action, no error)
 *
 * StableKey Definition:
 * - Derived from: nodeId + role
 * - Uniquely identifies state cell across program versions
 * - Example: "node-integrate-1:accumulator"
 *
 * References:
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §9
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-102151.md §2A
 */

import type { RuntimeState } from "./RuntimeState";
import type { CompiledProgramIR, StateLayout, StateCellLayout, ConstPool } from "../../compiler/ir";

// ============================================================================
// StableKey Types
// ============================================================================

/**
 * StableKey - Unique identifier for state cells across program versions
 *
 * Format: "{nodeId}:{role}"
 *
 * Examples:
 * - "node-integrate-1:accumulator"
 * - "delay-reverb:ringBuffer"
 * - "osc-main:phase"
 */
type StableKey = string;

/**
 * Cell Metadata - State cell information for hot-swap matching
 */
interface CellMetadata {
  stateId: string;
  storage: "f64" | "f32" | "i32";
  offset: number;
  size: number;
  initialConstId?: number;
}

// ============================================================================
// StableKey Construction
// ============================================================================

/**
 * Build stable key for a state cell.
 *
 * Stable key format: "{nodeId}:{role}"
 *
 * This uniquely identifies a state cell across program versions.
 * If nodeId or role changes, the cell is treated as new (re-initialized).
 *
 * @param cell - State cell layout
 * @returns Stable key string
 */
function buildStableKey(cell: StateCellLayout): StableKey {
  return `${cell.nodeId}:${cell.role}`;
}

/**
 * Build map of stable keys to cell metadata.
 *
 * Creates a Map<StableKey, CellMetadata> for O(1) lookup during hot-swap.
 * Used to match old and new state cells by stable key.
 *
 * @param stateLayout - State layout from compiled program
 * @returns Map from stable key to cell metadata
 *
 * @example
 * ```typescript
 * const layout: StateLayout = {
 *   cells: [
 *     { stateId: "s1", storage: "f64", offset: 0, size: 1,
 *       nodeId: "node-1", role: "accumulator" }
 *   ],
 *   f64Size: 1, f32Size: 0, i32Size: 0
 * };
 * const map = buildStableKeyMap(layout);
 * // map.get("node-1:accumulator") → { stateId: "s1", storage: "f64", ... }
 * ```
 */
export function buildStableKeyMap(stateLayout: StateLayout): Map<StableKey, CellMetadata> {
  const map = new Map<StableKey, CellMetadata>();

  for (const cell of stateLayout.cells) {
    const key = buildStableKey(cell);
    const metadata: CellMetadata = {
      stateId: cell.stateId,
      storage: cell.storage,
      offset: cell.offset,
      size: cell.size,
      initialConstId: cell.initialConstId,
    };
    map.set(key, metadata);
  }

  return map;
}

// ============================================================================
// State Cell Operations
// ============================================================================

/**
 * Copy state cells from old buffer to new buffer.
 *
 * Copies all elements of a state cell (for ring buffers, size > 1).
 * Handles typed array copies for f64, f32, i32 storage.
 *
 * @param oldBuffer - Old state buffer
 * @param newBuffer - New state buffer
 * @param oldCell - Old cell metadata
 * @param newCell - New cell metadata
 *
 * @throws Error if storage type mismatch (should not happen if layout matches)
 */
function copyStateCells(
  oldBuffer: RuntimeState["state"],
  newBuffer: RuntimeState["state"],
  oldCell: CellMetadata,
  newCell: CellMetadata,
): void {
  // Verify storage types match
  if (oldCell.storage !== newCell.storage) {
    throw new Error(
      `StateSwap: storage type mismatch for matching cells - old: ${oldCell.storage}, new: ${newCell.storage}`
    );
  }

  const storage = oldCell.storage;
  const oldArray = oldBuffer[storage];
  const newArray = newBuffer[storage];

  // Copy all elements (handles multi-element cells like ring buffers)
  const copySize = Math.min(oldCell.size, newCell.size);
  for (let i = 0; i < copySize; i++) {
    newArray[newCell.offset + i] = oldArray[oldCell.offset + i];
  }

  // If new cell is larger, remaining elements keep their initialized values
  // If new cell is smaller, extra old elements are dropped (intentional)
}

/**
 * Initialize state cell with default value from const pool.
 *
 * Used for new state cells that don't exist in the old program.
 * Falls back to zero if no initialConstId specified or lookup fails.
 *
 * @param buffer - State buffer to initialize
 * @param cell - Cell metadata
 * @param constPool - Constant pool for initial values
 */
function initializeStateCell(
  buffer: RuntimeState["state"],
  cell: CellMetadata,
  constPool: ConstPool,
): void {
  let initialValue = 0; // Default to zero

  if (cell.initialConstId !== undefined) {
    // Lookup value in const pool
    const constEntry = constPool.constIndex[cell.initialConstId];

    if (constEntry) {
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
          // Invalid const type - fall back to zero
          console.warn(
            `StateSwap: invalid const type ${constEntry.k} for initialConstId ${cell.initialConstId} - using zero`
          );
          break;
      }
    } else {
      // Missing const pool entry - fall back to zero
      console.warn(
        `StateSwap: constId ${cell.initialConstId} not found in constPool - using zero`
      );
    }
  }

  // Write initial value to all elements (for ring buffers, size > 1)
  const targetArray = buffer[cell.storage];
  const startOffset = cell.offset;
  const endOffset = startOffset + cell.size;

  for (let i = startOffset; i < endOffset; i++) {
    targetArray[i] = initialValue;
  }
}

// ============================================================================
// Hot-Swap Algorithm
// ============================================================================

/**
 * Preserve state from old runtime to new runtime during hot-swap.
 *
 * Implements the state preservation contract from spec §9.2:
 * 1. Build stable key maps for old and new state layouts
 * 2. For each cell in new layout:
 *    - If matching (stableKey, layout) in old: copy state
 *    - If new cell: initialize with defaults
 * 3. Cells in old but not new are implicitly dropped
 *
 * Layout matching rules:
 * - StableKey must match: nodeId + role
 * - Storage type must match: f64, f32, i32
 * - Size must match (for exact layout match)
 * - If any mismatch: treat as new cell (re-initialize)
 *
 * @param oldRuntime - Old runtime state (source)
 * @param newRuntime - New runtime state (destination)
 * @param oldProgram - Old compiled program
 * @param newProgram - New compiled program
 *
 * @example
 * ```typescript
 * // Compile new program
 * const newProgram = compile(editedPatch);
 * const newRuntime = createRuntimeState(newProgram);
 *
 * // Preserve state from old to new
 * preserveState(oldRuntime, newRuntime, oldProgram, newProgram);
 *
 * // Continue execution with new runtime (state preserved)
 * executor.executeFrame(newProgram, newRuntime, tMs);
 * ```
 */
export function preserveState(
  oldRuntime: RuntimeState,
  newRuntime: RuntimeState,
  oldProgram: CompiledProgramIR,
  newProgram: CompiledProgramIR,
): void {
  // 1. Build stable key maps
  const oldKeyMap = buildStableKeyMap(oldProgram.stateLayout);
  const newKeyMap = buildStableKeyMap(newProgram.stateLayout);

  // 2. Process each cell in new layout
  for (const [stableKey, newCell] of newKeyMap.entries()) {
    const oldCell = oldKeyMap.get(stableKey);

    if (oldCell && layoutMatches(oldCell, newCell)) {
      // Matching cell - copy from old to new
      copyStateCells(oldRuntime.state, newRuntime.state, oldCell, newCell);
    } else {
      // New cell or layout changed - initialize with defaults
      initializeStateCell(newRuntime.state, newCell, newProgram.constants);
    }
  }

  // 3. Removed cells (in oldKeyMap but not newKeyMap) are implicitly dropped
  // No action needed - they're not in the new runtime
}

/**
 * Check if two cell layouts match (same storage type and size).
 *
 * Used to determine if state can be copied directly or must be re-initialized.
 *
 * @param oldCell - Old cell metadata
 * @param newCell - New cell metadata
 * @returns True if layouts match (state can be copied)
 */
function layoutMatches(oldCell: CellMetadata, newCell: CellMetadata): boolean {
  return oldCell.storage === newCell.storage && oldCell.size === newCell.size;
}
