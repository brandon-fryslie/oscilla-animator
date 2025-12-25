/**
 * Execute Bus Eval Step (STUB)
 *
 * Combines publisher values into a single bus value.
 *
 * STUB IMPLEMENTATION: This is a placeholder for Sprint 1.
 * Full implementation requires Phase 4 (bus combine logic) and Phase 5 (field combine).
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Bus Eval)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 3
 */

import type { StepBusEval, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Execute BusEval step (STUB).
 *
 * Stub implementation:
 * - Iterates publishers in deterministic order (sortKey, then publisherId)
 * - Reads source slots (stub - just passes through)
 * - Applies transforms (stub - no-op)
 * - Combines values (stub - returns first value or silent value)
 * - Writes to outSlot
 *
 * TODO: Phase 4 - Full bus combine logic
 * - Implement transform chain application (adapters/lenses)
 * - Implement proper combine modes (sum, average, max, min, etc.)
 * - Handle signal vs field bus types correctly
 * - Apply silent value policy when no publishers
 *
 * @param step - BusEval step specification
 * @param _program - Compiled program (not used in stub)
 * @param runtime - Runtime state
 */
export function executeBusEval(
  step: StepBusEval,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Filter enabled publishers (already sorted by compiler)
  const enabledPublishers = step.publishers.filter((pub) => pub.enabled);

  // If no enabled publishers, write silent value
  if (enabledPublishers.length === 0) {
    const silentValue = getSilentValue();
    runtime.values.write(step.outSlot, silentValue);
    return;
  }

  // Read publisher values (stub - just pass through, no transforms)
  const publisherValues = enabledPublishers.map((pub) => runtime.values.read(pub.srcSlot));

  // Combine values (stub - simple passthrough of first value)
  // TODO: Implement actual combine modes (sum, average, max, min, product, last)
  const combinedValue = combineValuesStub(publisherValues, step.combine.mode);

  // Write combined value to bus slot
  runtime.values.write(step.outSlot, combinedValue);
}

/**
 * Get silent value for bus (STUB).
 *
 * Returns the appropriate silent value when no publishers are enabled.
 *
 * TODO: Phase 4 - Implement proper silent value handling
 * - Read from constant pool for "const" kind
 * - Use type-specific defaults for "default" kind
 *
 * @returns Silent value (stub: always 0)
 */
function getSilentValue(): unknown {
  // Stub: always return 0
  // TODO: Handle step.silent.kind ("zero" | "default" | "const")
  return 0;
}

/**
 * Combine publisher values (STUB).
 *
 * Stub implementation returns first value.
 *
 * TODO: Phase 4 - Implement all combine modes:
 * - "last": return last value
 * - "sum": sum all values
 * - "average": average all values
 * - "max": maximum value
 * - "min": minimum value
 * - "product": product of all values
 *
 * @param values - Publisher values to combine
 * @param _mode - Combine mode (not used in stub)
 * @returns Combined value (stub: first value or 0)
 */
function combineValuesStub(values: unknown[], _mode: string): unknown {
  // Stub: return first value, or 0 if no values
  return values.length > 0 ? values[0] : 0;
}
