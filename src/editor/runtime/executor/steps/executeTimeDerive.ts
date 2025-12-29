/**
 * Execute Time Derive Step
 *
 * Writes derived time values to well-known slots.
 *
 * This is the ONLY step kind with a full implementation in Sprint 1.
 * It reads tAbsMs from input slot and writes derived time signals to output slots.
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Time Derive)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 1
 */

import type { StepTimeDerive } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import type { EffectiveTime } from "../timeResolution";

/**
 * Execute TimeDerive step.
 *
 * Writes derived time values to their designated slots.
 *
 * Inputs:
 * - tAbsMs: from effectiveTime (already resolved)
 *
 * Outputs (written to slots per step.out):
 * - tModelMs: model time (always written)
 * - phase01: phase 0..1 (cyclic models only)
 * - wrapEvent: wrap event (cyclic models only)
 * - progress01: progress 0..1 (finite models only)
 *
 * @param step - TimeDerive step specification
 * @param runtime - Runtime state (provides ValueStore)
 * @param time - Effective time (pre-computed by resolveTime)
 */
export function executeTimeDerive(
  step: StepTimeDerive,
  runtime: RuntimeState,
  time: EffectiveTime,
): void {
  // Track which slots we've already written to avoid double-writes.
  // This can happen when multiple time signals share the same slot
  // (e.g., InfiniteTimeRoot sets tAbsMs === tModelMs === systemTime).
  const written = new Set<number>();

  // Write tAbsMs to its slot so downstream nodes can read it
  // This is the input slot that the runtime provides
  runtime.values.write(step.tAbsMsSlot, time.tAbsMs);
  written.add(step.tAbsMsSlot);

  // Write tModelMs (always present, but skip if same slot as tAbsMs)
  if (!written.has(step.out.tModelMs)) {
    runtime.values.write(step.out.tModelMs, time.tModelMs);
    written.add(step.out.tModelMs);
  }

  // Write optional derived signals (skip if slot already written)
  if (step.out.phase01 !== undefined && time.phase01 !== undefined) {
    if (!written.has(step.out.phase01)) {
      runtime.values.write(step.out.phase01, time.phase01);
      written.add(step.out.phase01);
    }
  }

  if (step.out.wrapEvent !== undefined && time.wrapEvent !== undefined) {
    if (!written.has(step.out.wrapEvent)) {
      runtime.values.write(step.out.wrapEvent, time.wrapEvent);
      written.add(step.out.wrapEvent);
    }
  }

  if (step.out.progress01 !== undefined && time.progress01 !== undefined) {
    if (!written.has(step.out.progress01)) {
      runtime.values.write(step.out.progress01, time.progress01);
      written.add(step.out.progress01);
    }
  }
}
