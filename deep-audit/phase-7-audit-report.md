# Audit Report: Phase 7 - Debug Infrastructure

**Audit Date:** 2025-12-28

## Summary

Phase 7 is further along than the roadmap indicates. Key components for debug data collection are implemented, though not fully enabled by default.

## Topic Analysis (Sprint 1)

### 1. `debug-index-compile`
- **Roadmap Status:** `IN PROGRESS`
- **Code Status:** **Implemented**
- **Evidence:**
  - `src/editor/compiler/compileBusAware.ts`'s `attachIR` function creates a `DebugIndex` instance.
  - It then calls `internBlock`, `internBus`, and `internPort` to populate the index with all relevant identifiers from the patch.
  - The populated `debugIndex` is attached to the `CompileResult`.
- **Conclusion:** The creation and population of `DebugIndex` during compilation is fully implemented.

### 2. `execute-debug-probe`
- **Roadmap Status:** `IN PROGRESS`
- **Code Status:** **Implemented**
- **Evidence:**
  - `src/editor/runtime/executor/steps/executeDebugProbe.ts` contains the `executeDebugProbe` function.
  - The function correctly checks `TraceController.mode` for an early exit if debugging is off.
  - It reads values from the `ValueStore`, converts them to `ValueRecord32`, and writes them to the `ValueRing` via `controller.writeValue`.
- **Conclusion:** The step executor for debug probes is implemented as described in the plan.

### 3. `schedule-probe-insertion`
- **Roadmap Status:** `PROPOSED`
- **Code Status:** **Partially Implemented (but disabled)**
- **Evidence:**
  - `src/editor/compiler/ir/buildSchedule.ts` contains a helper function `maybeInsertProbe`.
  - This function is called at various points in the schedule building process (e.g., after time derivation, after signal evaluation).
  - However, the insertion of `StepDebugProbe` steps is conditional on a `probeMode` flag which defaults to `'off'`.
- **Conclusion:** The logic for inserting debug probes into the schedule is present but not enabled by default. This aligns with a `PROPOSED` or "not yet fully integrated" status.

## Overall Recommendation

The roadmap for Phase 7 needs updating. The core data collection mechanisms (`DebugIndex` and `executeDebugProbe`) are implemented. The next logical step would be to expose the `probeMode` setting in the UI to enable `schedule-probe-insertion` and begin building the UI components (`Debug HUD`, `Probe Mode`, etc.) that consume this data.
