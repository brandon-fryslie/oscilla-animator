# IR Compiler Rendering Plan (No Code Changes Yet)

## Current Evaluation (based on repo state)
- RenderFrameIR path exists (render assemble + canvas renderer), but it is not wired to program outputs or the preview.
- Render sinks are collected and materialization steps are emitted, but the frame output is not exposed via `CompiledProgramIR.outputs`.
- `ScheduleExecutor.extractRenderOutput` still expects DrawNode RenderTree, which is incompatible with RenderFrameIR.
- Preview uses `Canvas2DRenderer.render(...)` (cmds-based) instead of `renderFrame(...)` (IR-based).

Bottom line: you have major pieces in place, but the runtime/output wiring is still missing. You are **not close yet** to seeing IR output until these connections are made.

---

## File-by-File Plan

### 1) `src/editor/compiler/ir/buildSchedule.ts`
- Update `buildCompiledProgram(...)` to call the new `buildSchedule(builderIR)` signature and use its returned `frameOutSlot`.
- Populate `CompiledProgramIR.outputs` with a render output pointing to the `frameOutSlot`.
- Decide output `kind` (likely a new `renderFrame` kind) to distinguish from DrawNode `renderTree`.

### 2) `src/editor/compiler/ir/program.ts`
- Extend `OutputSpec.kind` to include `renderFrame` (or formalize a different name for RenderFrameIR output).
- Document what value type is expected in that slot (RenderFrameIR).

### 3) `src/editor/compiler/ir/schedule.ts`
- Confirm `StepRenderAssemble` has `instance2dListSlot`, `pathBatchListSlot`, and `outFrameSlot` fields (already present).
- Keep `ScheduleIR.initialSlotValues` as the channel for batch list and domain handles (already used in RuntimeState).

### 4) `src/editor/runtime/executor/ScheduleExecutor.ts`
- Update `extractRenderOutput` to handle the new output kind:
  - If output kind is `renderFrame`, return the RenderFrameIR from the output slot.
  - If output kind is `renderTree`, keep existing DrawNode handling.
- Consider returning a union (RenderFrameIR | DrawNode) or updating `Program` typing for the IR path only.

### 5) `src/editor/runtime/executor/IRRuntimeAdapter.ts`
- If `ScheduleExecutor` returns RenderFrameIR, adapt `Program.signal(...)` to return RenderFrameIR (or expose runtime state).
- Optional: expose `runtime.values` to the caller so Preview can call `canvasRenderer.renderFrame(frame, valueStore)`.

### 6) `src/editor/PreviewPanel.tsx`
- In IR mode, call `canvasRenderer.renderFrame(frame, valueStore)` instead of `render(...)`.
- Ensure the IR path uses the same time and loop as legacy.
- Keep legacy canvas path intact.

### 7) `src/editor/runtime/canvasRenderer.ts`
- No change needed if Preview routes RenderFrameIR to `renderFrame(...)`.
- If you want a single entrypoint, consider letting `render(...)` detect RenderFrameIR vs cmds.

### 8) `src/editor/compiler/blocks/domain/RenderInstances2D.ts`
- Ensure IR lowering emits a render sink that includes **all slots needed** for instance count.
- The batch descriptor currently has `count: 0`. Add a `domainSlot` to the batch descriptor so `executeRenderAssemble` can compute the count at runtime.

### 9) `src/editor/runtime/executor/steps/executeRenderAssemble.ts`
- Set `instanceCount` using the domain handle (needs `domainSlot` in batch descriptor).
- Use `instanceCount` instead of the static `count` value, or update count in-place before constructing passes.

### 10) `src/editor/runtime/executor/steps/executeMaterializeTestGeometry.ts`
- Verify it uses the domain handle for count and produces buffers with correct lengths.
- Ensure it writes buffers that match the slots referenced by the batch descriptor.

### 11) `src/editor/compiler/ir/renderIR.ts`
- Verify `RenderFrameIR` and pass structures match what `Canvas2DRenderer.renderFrame(...)` expects.
- Keep `_bufferData` as a debug-only field; don’t rely on it for rendering.

---

## Readiness Check (post-fix criteria)
- `compiledIR.outputs.length > 0` and first output points to a slot containing `RenderFrameIR`.
- Preview IR path renders something without fallback to legacy.
- `executeRenderAssemble` produces passes with non-zero instance counts.
- `canvasRenderer.renderFrame(...)` is invoked with a `RenderFrameIR` + ValueStore that contains the referenced buffers.

