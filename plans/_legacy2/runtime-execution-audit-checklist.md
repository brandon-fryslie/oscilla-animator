# Runtime Execution Audit Checklist (New IR Runtime)

Goal: Remove runtime churn by fixing execution blockers and hard‑failing on missing IR requirements.

## 1) SlotMeta Reliability (Blocker)
- [ ] Make compiler‑emitted `slotMeta` mandatory for runtime.
  - Enforce in `src/editor/runtime/executor/RuntimeState.ts`:
    - If `program.slotMeta` is empty and schedule has steps that write/read slots, throw a fatal error.
  - Acceptance: No runtime uses schedule inference for real runs.
- [ ] Fix inference fallback (if retained for tests only).
  - In `inferSlotMetaFromSchedule`, treat any slot that can hold buffers OR scalars as `object`.
  - Add overlay batch slots (`overlayInstance2dBatches`, `overlayPathBatches`) if not already handled.
  - Acceptance: `ValueStore.write` never throws “slot not found” for any slot used in `renderAssemble`.

## 2) SignalEval Hard‑Fail (Blocker)
- [ ] In `src/editor/runtime/executor/steps/executeSignalEval.ts`, throw if:
  - `program.signalTable` is missing AND `step.outputs.length > 0`.
  - Reason: skipping evaluation leaves required slots uninitialized.
- [ ] Acceptance: Missing signal table causes a visible compile/runtime error, not a silent blank frame.

## 3) Pure IR Output Path (Blocker)
- [ ] Ensure the render path uses `executeAndGetFrame()` (IR renderer), not `Program.signal()` when in pure IR mode.
  - Audit `src/editor/runtime/executor/IRRuntimeAdapter.ts` and any player integration.
  - Remove or clearly gate the “empty GroupNode” stub path.
- [ ] Acceptance: Pure IR mode returns `RenderFrameIR` and renderer consumes it directly.

## 4) Time Wrap Event Correctness
- [ ] In `src/editor/runtime/executor/timeResolution.ts`, remove the fake `tAbsMs - 16.67` wrap detection.
  - Track previous `tModelMs` in runtime state.
  - Compare actual previous to detect wrap/bounce.
- [ ] Acceptance: Wrap events are deterministic under variable frame rate and scrubbing.

## 5) MaterializeColor Compatibility
- [ ] Decide: `executeMaterializeColor` either:
  - Produces interleaved `u8` RGBA for Instances2D, or
  - Is never used by Instances2D (and compiler must enforce that).
- [ ] If used by Instances2D, update to emit `Uint8Array` with `count * 4`.
- [ ] Acceptance: Instances2D receives a valid color buffer in all patches.

## 6) Validation Checks (Smoke)
- [ ] DevTools compile + execute a simple patch with:
  - TimeRoot -> Phase -> Instances2D render.
  - Field domain positions + constant color/size.
- [ ] Confirm:
  - No `ValueStore.* slot not found` errors.
  - `renderAssemble` outputs a non‑empty `RenderFrameIR`.
