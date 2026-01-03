Workstream 01: Schedule Slot Meta and Output Typing (P0)

Goal
- Ensure every slot written by schedule steps has slotMeta so ValueStore writes never hit unknown slots.
- Add explicit internal TypeDesc for schedule-allocated slots (buffers and render frame).

Scope
- src/editor/compiler/ir/buildSchedule.ts only.
- Optional: add internal domains in src/core/types.ts if needed for buffer/frame typing.

Out of scope
- Block lowerers or default source handling.
- Render sink lowering policy.

Why this is P0
- The runtime currently writes to schedule-allocated slots without slotMeta, which can throw at runtime.

Parallel safety
- This stream only edits buildSchedule (and possibly core/types for new internal domains).
- Avoid touching block lowerers or pass6/pass8 logic to prevent conflicts.

Implementation steps
1. Decide canonical TypeDesc for schedule-only slots.
   - Option A (preferred): add internal domains like "bufferHandle" and "renderFrame" in src/core/types.ts.
   - Option B: reuse "renderTree" for frame output and "unknown" for buffers if adding domains is not desired.
2. Add a helper in buildSchedule to allocate slots with slotMeta:
   - allocScheduleSlot(type: TypeDesc, debugName: string): ValueSlot
   - Append SlotMetaEntry with storage "object".
3. Update schedule allocations to use the helper:
   - materialization buffers (posXY, size, color, path buffers)
   - render frame output slot
4. Add debugName labels for schedule slots (e.g., "schedule:mat-pos-0").
5. Add a validation check in buildSchedule:
   - For each step output slot, assert slotMeta contains the slot.
   - Throw a clear error if missing (fail-fast during compilation).

Verification (DevTools, no tests)
- Load a steel-thread patch with emitIR enabled.
- Verify console has no ValueStore slotMeta errors.
- Use the debug Schedule panel to confirm schedule slots appear and have debug names.

Done criteria
- No runtime errors from ValueStore.write/read for schedule slots.
- SlotMeta includes schedule-allocated slots with object storage.
