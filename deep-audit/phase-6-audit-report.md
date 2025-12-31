# Audit Report: Phase 6 - Full Scheduled Runtime

**Audit Date:** 2025-12-28

## Summary

Phase 6 is significantly more complete than the roadmap indicates. Key features listed as `PARTIAL` or `PROPOSED` have full or near-full implementations in the codebase.

## Topic Analysis

### 1. `schedule-executor`
- **Roadmap Status:** `PARTIAL`
- **Code Status:** **Implemented**
- **Evidence:**
  - `src/editor/runtime/executor/ScheduleExecutor.ts` contains a complete `executeFrame` loop that dispatches to various step executors.
  - The roadmap claims `executeNodeEval` and `executeRenderAssemble` are "Remaining". However, these files exist and are imported and called by `ScheduleExecutor.ts`.
  - `src/editor/runtime/executor/steps/executeNodeEval.ts` has a full implementation for evaluating opcodes.
  - `src/editor/runtime/executor/steps/executeRenderAssemble.ts` has a full implementation for assembling `RenderFrameIR` from instance and path batches.
- **Conclusion:** The roadmap is out of date. `schedule-executor` appears to be fully implemented.

### 2. `hot-swap-semantics`
- **Roadmap Status:** `PROPOSED`
- **Code Status:** **Implemented**
- **Evidence:**
  - `src/editor/runtime/executor/RuntimeState.ts` implements a `hotSwap` method.
  - `src/editor/runtime/executor/StateSwap.ts` implements the `preserveState` function, which handles copying state between old and new runtimes based on stable keys. The implementation appears to match the logic described in the design documents (matching cells, new cells, dropped cells).
- **Conclusion:** The roadmap is out of date. `hot-swap-semantics` is implemented.

### 3. `determinism-enforcement`
- **Roadmap Status:** `PROPOSED`
- **Code Status:** **Partially Implemented**
- **Evidence:**
  - `src/editor/compiler/compileBusAware.ts`: `topoSortBlocksWithBuses` uses `queue.sort()` for a stable topological sort.
  - `src/editor/compiler/compileBusAware.ts`: `getSortedPublishers` is used for deterministic publisher ordering.
  - A full audit for non-deterministic iteration (`Map`/`Set`) is out of scope for this initial review, but key areas seem to address determinism.
- **Conclusion:** Key aspects of determinism are implemented. The `PROPOSED` status is likely inaccurate.

### 4. `legacy-runtime-removal`
- **Roadmap Status:** `PROPOSED`
- **Code Status:** **Not Implemented**
- **Evidence:** The codebase still contains the dual-emit logic and the legacy closure-based runtime. This is consistent with the ongoing migration.
- **Conclusion:** The roadmap is accurate for this topic.

## Overall Recommendation

The roadmap for Phase 6 needs to be updated to reflect the actual state of the code. The `schedule-executor` and `hot-swap-semantics` are largely complete. The team should focus on verifying the correctness of these implementations and then move on to the remaining `PROPOSED` items.
