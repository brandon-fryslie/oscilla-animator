/**
 * Execute Bus Eval Step
 *
 * Combines publisher values into a single bus value using specified combine mode.
 *
 * Implementation:
 * - Reads publisher source values from ValueStore
 * - Combines values using combine mode (sum, average, min, max, last, product)
 * - Handles silent value policy when no publishers enabled
 * - Writes combined value to output slot
 *
 * Note: Transform chain application deferred to future sprint when transform
 * chains are wired through schedule IR.
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Bus Eval)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 3
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 2
 */

import type { StepBusEval, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Execute BusEval step.
 *
 * Combines publisher values according to bus combine specification.
 * Publishers are pre-sorted by compiler (sortKey ascending, then publisherId).
 *
 * Algorithm:
 * 1. Filter enabled publishers
 * 2. Read source values from slots
 * 3. Combine values using combine mode
 * 4. Write result to output slot
 *
 * If no enabled publishers, writes silent value according to silent spec.
 *
 * @param step - BusEval step specification
 * @param program - Compiled program (for const pool access)
 * @param runtime - Runtime state (values, frameCache, state)
 */
export function executeBusEval(
  step: StepBusEval,
  program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Filter enabled publishers (already sorted by compiler)
  const enabledPublishers = step.publishers.filter((pub) => pub.enabled);

  // If no enabled publishers, write silent value
  if (enabledPublishers.length === 0) {
    const silentValue = getSilentValue(step.silent, program);
    runtime.values.write(step.outSlot, silentValue);
    return;
  }

  // Read publisher values
  const values: number[] = [];

  for (const pub of enabledPublishers) {
    // Read source value from ValueStore
    const value = runtime.values.read(pub.srcSlot) as number;
    values.push(value);
  }

  // Combine values
  const combinedValue = combineValues(values, step.combine.mode);

  // Write combined value to bus slot
  runtime.values.write(step.outSlot, combinedValue);
}

/**
 * Get silent value for bus when no publishers are enabled.
 *
 * Implements three silent value modes:
 * - "zero": return 0
 * - "default": return type-specific default (0 for numbers)
 * - "const": read from constant pool
 *
 * @param silent - Silent value specification
 * @param program - Compiled program (for const pool access)
 * @returns Silent value
 */
function getSilentValue(
  silent: StepBusEval["silent"],
  program: CompiledProgramIR
): number {
  switch (silent.kind) {
    case "zero":
      return 0;

    case "default":
      // Type-specific default (0 for numbers, vec2(0,0) for vec2, etc.)
      // For now, return 0 (numeric buses only in Sprint 2)
      return 0;

    case "const": {
      // Read from constant pool
      if (silent.constId === undefined) {
        throw new Error("Silent value kind 'const' requires constId");
      }

      const constPool = program.constants || {
        f64: new Float64Array([]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        json: [],
        constIndex: [],
      };

      // Read from f64 pool (primary storage for numeric constants)
      if (silent.constId < 0 || silent.constId >= constPool.f64.length) {
        throw new Error(
          `Invalid silent constId: ${silent.constId} (f64 pool has ${constPool.f64.length} entries)`
        );
      }

      return constPool.f64[silent.constId];
    }

    default: {
      const unknownSilent = silent as { kind: string };
      throw new Error(`Unknown silent value kind: ${unknownSilent.kind}`);
    }
  }
}

/**
 * Combine publisher values using specified combine mode.
 *
 * Implements all combine modes:
 * - "sum": sum all values
 * - "average": mean of all values
 * - "min": minimum value
 * - "max": maximum value
 * - "last": last value (values pre-sorted by compiler)
 * - "product": product of all values
 *
 * PRECONDITION: values.length > 0 (caller handles empty array case)
 *
 * @param values - Array of values to combine (length > 0)
 * @param mode - Combine mode
 * @returns Combined result
 * @throws Error if mode is unknown or values is empty
 */
function combineValues(
  values: number[],
  mode: "last" | "sum" | "average" | "max" | "min" | "product"
): number {
  if (values.length === 0) {
    throw new Error("combineValues requires non-empty values array");
  }

  switch (mode) {
    case "sum":
      return values.reduce((acc, v) => acc + v, 0);

    case "average":
      return values.reduce((acc, v) => acc + v, 0) / values.length;

    case "min":
      return Math.min(...values);

    case "max":
      return Math.max(...values);

    case "last":
      return values[values.length - 1];

    case "product":
      return values.reduce((acc, v) => acc * v, 1);

    default: {
      const unknownMode = mode as string;
      throw new Error(`Unknown combine mode: ${unknownMode}`);
    }
  }
}
