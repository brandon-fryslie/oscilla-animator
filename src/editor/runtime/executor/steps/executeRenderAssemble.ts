/**
 * Execute Render Assemble Step
 *
 * Assembles final render output from render node.
 *
 * Per spec (design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 5):
 * "Typically trivial: the render node already wrote a RenderTree/RenderCmds to its
 * output slot. This step exists so you have a single stable 'finalization' boundary
 * for hot-swap + tracing."
 *
 * This is a stable finalization boundary - not a transform step. The render node
 * has already computed its output and written it to a slot. This step ensures
 * that output is accessible at step.outSlot for:
 * 1. Hot-swap continuity (stable reference point across program changes)
 * 2. Trace event emission (Phase 7 - deferred)
 * 3. Render output extraction by ScheduleExecutor
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Render Assemble)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 5
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-102151.md §Deliverable 1
 */

import type { StepRenderAssemble, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Execute RenderAssemble step.
 *
 * Finalization step that ensures render tree is accessible at a stable output slot.
 *
 * Semantics (per spec §12.2 Step 5):
 * - Render node has already written RenderTree to its output slot
 * - This step reads that value and ensures it's at step.outSlot
 * - No transforms applied - just a finalization boundary
 *
 * Algorithm:
 * 1. Read render tree from step.outSlot (already written by render node)
 * 2. If outSlot doesn't contain output, this is an error (render node should write first)
 * 3. Render tree is now accessible for extraction by ScheduleExecutor
 *
 * Note: rootNodeIndex is available for future use (if needed to locate render node's
 * output slot), but current spec suggests render node writes directly to step.outSlot.
 *
 * @param step - RenderAssemble step specification
 * @param _program - Compiled program (not used - render tree already in ValueStore)
 * @param runtime - Runtime state (contains ValueStore with render tree)
 */
export function executeRenderAssemble(
  step: StepRenderAssemble,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Per spec: "Typically trivial: the render node already wrote a RenderTree/RenderCmds
  // to its output slot. This step exists so you have a single stable 'finalization'
  // boundary for hot-swap + tracing."

  // Read render tree from output slot to verify it exists
  // This will throw if slot is uninitialized (render node failed to write)
  const renderTree = runtime.values.read(step.outSlot);

  // Render tree is now verified as accessible
  // No further processing needed - this is just a finalization boundary

  // Future Phase 7 work:
  // - Emit trace event for debugger
  // - Optional validation of render tree structure

  // For now, render tree remains in step.outSlot for ScheduleExecutor extraction
  // The read above ensures the slot is written (validation pass)

  // Silence unused variable warning - we're just validating the read works
  void renderTree;
}
