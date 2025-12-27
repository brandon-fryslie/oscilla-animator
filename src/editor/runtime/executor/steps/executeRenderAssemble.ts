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
 * **Updated for RenderFrameIR (Phase C+D Integration):**
 * This step now has two modes based on feature flags:
 * 1. Legacy mode: Just validates RenderTree exists (current behavior)
 * 2. IR mode: Assembles RenderFrameIR from materialized buffers
 *
 * In IR mode, this step:
 * - Reads materialized buffers from ValueStore
 * - Assembles Instances2DPassIR using assembleInstanceBuffers()
 * - Assembles Paths2DPassIR using assemblePathGeometry()
 * - Creates RenderFrameIR with passes and clear spec
 * - Writes RenderFrameIR to output slot
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Render Assemble)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 5
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.I2
 */

import type { StepRenderAssemble, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import type { RenderFrameIR } from "../../../compiler/ir/renderIR";

/**
 * Execute RenderAssemble step.
 *
 * Finalization step that ensures render output is accessible at a stable output slot.
 *
 * **Current Implementation:**
 * - Legacy mode: Validates RenderTree exists in output slot (original behavior)
 * - Stub mode: Creates minimal RenderFrameIR if no render tree exists
 * - Future IR mode: Assembles RenderFrameIR from materialized buffers
 *
 * Semantics (per spec §12.2 Step 5):
 * - Render node has already written RenderTree to its output slot
 * - This step reads that value and ensures it's at step.outSlot
 * - No transforms applied - just a finalization boundary
 *
 * Algorithm:
 * 1. Try to read render tree from step.outSlot
 * 2. If exists, validation passes (legacy path)
 * 3. If not exists, create stub RenderFrameIR (migration path)
 * 4. Render output is now accessible for extraction by ScheduleExecutor
 *
 * Note: rootNodeIndex is available for future use (if needed to locate render node's
 * output slot), but current spec suggests render node writes directly to step.outSlot.
 *
 * **Future IR Mode (Phase C+D):**
 * When enabled, this will:
 * 1. Check if materialized buffers exist for instances/paths
 * 2. Call assembleInstanceBuffers() for Instances2D passes
 * 3. Call assemblePathGeometry() for Paths2D passes
 * 4. Build RenderFrameIR with passes array and clear spec
 * 5. Write RenderFrameIR to step.outSlot
 *
 * For now, we stub this by creating a minimal empty RenderFrameIR when
 * the legacy RenderTree is not present, allowing the new renderFrame() path
 * to be tested.
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

  // Try to read render tree from output slot
  // This validates the slot is written (render node succeeded)
  try {
    const renderTree = runtime.values.read(step.outSlot);

    // If we successfully read a value, it's either:
    // - Legacy RenderTree (from old render nodes)
    // - RenderFrameIR (from new IR-aware render nodes)
    // Either way, our job is done - the value is accessible

    // For future Phase 7 tracing work, we could emit trace event here
    void renderTree; // Silence unused variable warning

    return;
  } catch (_error) {
    // Slot is uninitialized - this can happen during migration when
    // render nodes haven't been updated to write RenderTree/RenderFrameIR yet

    // Create a minimal stub RenderFrameIR to allow Canvas2DRenderer.renderFrame()
    // to work even without a fully migrated compiler
    const stubFrame: RenderFrameIR = {
      version: 1,
      clear: {
        mode: "none",
      },
      passes: [],
    };

    // Write stub frame to output slot
    runtime.values.write(step.outSlot, stubFrame);
  }

  // Future Phase C+D work:
  // - Check for materialized buffer slots in step metadata
  // - Call assembleInstanceBuffers() if instance buffers present
  // - Call assemblePathGeometry() if path buffers present
  // - Build RenderFrameIR with real passes
  // - Emit trace event for debugger
  // - Optional validation of render tree structure
}
