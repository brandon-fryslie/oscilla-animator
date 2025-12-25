/**
 * Execute Materialize Step (STUB)
 *
 * Materializes a FieldExpr into a buffer.
 *
 * STUB IMPLEMENTATION: This is a placeholder for Sprint 1.
 * Full implementation requires Phase 5 (FieldExpr materialization).
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Materialize)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 4
 */

import type { StepMaterialize, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Execute Materialize step (STUB).
 *
 * Stub implementation:
 * - Returns empty buffer handle
 * - Writes handle to output slot
 *
 * TODO: Phase 5 - Full field materialization
 * - Evaluate FieldExpr DAG
 * - Allocate/reuse buffer from pool
 * - Write elements to buffer
 * - Respect cache policy (perFrame vs onDemand)
 * - Handle buffer format (f32, f64, i32, u8, etc.)
 * - Optimize with fusion/SIMD where applicable
 *
 * @param step - Materialize step specification
 * @param _program - Compiled program (not used in stub)
 * @param runtime - Runtime state
 */
export function executeMaterialize(
  step: StepMaterialize,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Stub: return empty buffer handle
  // TODO: Full materialization requires Phase 5 field evaluator
  const stubBufferHandle = {
    kind: "buffer" as const,
    data: new Float32Array(0), // empty buffer
    format: step.materialization.format,
  };

  // Write buffer handle to output slot
  runtime.values.write(step.materialization.outBufferSlot, stubBufferHandle);
}
