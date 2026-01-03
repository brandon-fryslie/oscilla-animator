Workstream 04: Render Sink Emission Policy (P0)

Goal
- Ensure render sinks are emitted exactly once.
- Avoid duplicate render sink registration from pass6 and pass8.

Scope
- src/editor/compiler/passes/pass8-link-resolution.ts

Out of scope
- buildSchedule or render pipeline logic.
- Slot typing (Workstream 01 and 02).

Why this is P0
- Duplicate render sinks can produce duplicate materialization steps and undefined render behavior.

Parallel safety
- Touches only pass8-link-resolution.
- No overlap with pass6, schedule, or block lowerers.

Decision (proposed)
- Keep render lowering in pass6 and disable render lowering in pass8.
- Keep camera lowering in pass8 (camera outputs are needed for render sinks).

Implementation steps
1. Split applyRenderLowering into:
   - applyCameraLowering (current camera block logic)
   - applyRenderLowering (render blocks)
2. In pass8LinkResolution, call applyCameraLowering only.
3. Add a guard log or debug warning if render blocks are encountered in pass8.
4. Optional: add a builder helper to query renderSinks count for diagnostics.

Verification (DevTools, no tests)
- Compile a patch with RenderInstances2D and confirm builderIR.renderSinks length equals the number of render blocks.
- Ensure only one set of materialization steps is emitted in the schedule.

Done criteria
- Render sinks are emitted exactly once per render block.
