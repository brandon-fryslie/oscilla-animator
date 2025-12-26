/**
 * Slot Value Reader - External Input Resolution
 *
 * Provides runtime access to external slot values (wired connections, bus subscriptions).
 * Used by inputSlot nodes during signal evaluation.
 *
 * Interface is minimal - just read-only access to slot values.
 * Real implementation will read from compiled ValueStore arrays.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md §P0 "Implement SlotValueReader Interface"
 * - design-docs/12-Compiler-Final/12-SignalExpr.md §3.2 "InputSlot Nodes"
 */

import type { ValueSlot } from "../../compiler/ir/types";

/**
 * Slot value reader interface.
 *
 * Provides read-only access to external slot values during signal evaluation.
 * Slots are resolved at compile time and read at runtime.
 *
 * Key behaviors:
 * - Missing slots return NaN (allows detection of unconnected inputs)
 * - Slot values don't change during a frame (safe to cache)
 * - O(1) lookup performance (backed by dense arrays)
 */
export interface SlotValueReader {
  /**
   * Read a number from a slot.
   *
   * @param slot - Dense slot index
   * @returns Slot value, or NaN if slot is empty
   *
   * @example
   * ```typescript
   * const reader = createArraySlotReader(new Map([[0, 42]]));
   * console.log(reader.readNumber(0));  // 42
   * console.log(reader.readNumber(99)); // NaN
   * ```
   */
  readNumber(slot: ValueSlot): number;

  /**
   * Check if slot has a value.
   *
   * @param slot - Dense slot index
   * @returns True if slot has a value, false otherwise
   *
   * @example
   * ```typescript
   * const reader = createArraySlotReader(new Map([[0, 42]]));
   * console.log(reader.hasValue(0));  // true
   * console.log(reader.hasValue(99)); // false
   * ```
   */
  hasValue(slot: ValueSlot): boolean;
}

/**
 * Create an array-backed slot reader.
 *
 * Simple Map-based implementation for testing.
 * Real implementation will read from compiled ValueStore arrays.
 *
 * @param values - Map of slot indices to values
 * @returns Slot value reader
 *
 * @example
 * ```typescript
 * const slots = createArraySlotReader(new Map([
 *   [0, 42],
 *   [1, 3.14],
 * ]));
 * console.log(slots.readNumber(0)); // 42
 * console.log(slots.readNumber(2)); // NaN
 * ```
 */
export function createArraySlotReader(
  values: Map<ValueSlot, number>
): SlotValueReader {
  return {
    readNumber(slot: ValueSlot): number {
      return values.get(slot) ?? NaN;
    },
    hasValue(slot: ValueSlot): boolean {
      return values.has(slot);
    },
  };
}

/**
 * Create an empty slot reader.
 *
 * Convenience factory for tests that don't use slots.
 * All reads return NaN, hasValue always returns false.
 *
 * @returns Empty slot reader
 *
 * @example
 * ```typescript
 * const slots = createEmptySlotReader();
 * console.log(slots.readNumber(0)); // NaN
 * console.log(slots.hasValue(0));   // false
 * ```
 */
export function createEmptySlotReader(): SlotValueReader {
  return {
    readNumber(_slot: ValueSlot): number {
      return NaN;
    },
    hasValue(_slot: ValueSlot): boolean {
      return false;
    },
  };
}
