# Workstream 2: Time + Event Semantics

**Goal:** Make TimeRoot the single source of time topology, ensure time derivation is correct under variable delta and scrubbing, and formalize wrap events as discrete triggers.

## Scope

- TimeRoot -> TimeModel wiring through compiler passes.
- TimeDerive runtime semantics with proper delta and wrap detection.
- Event store split from continuous value store.
- Scrub/seek handling without state reset or false wrap triggers.

## Dependencies

- Depends on Workstream 1 for TypeDesc and pass plumbing stability.

## Primary References

- `plans/SPEC-05-time-architecture.md`
- `design-docs/3-Synthesized/02-Time-Architecture.md`

## Key Files + Line Anchors

- `src/editor/compiler/passes/pass3-time.ts:72-219` (TimeRoot extraction, TimeModel generation)
- `src/editor/runtime/executor/timeResolution.ts:92-180` (resolveTime logic)
- `src/editor/runtime/executor/steps/executeTimeDerive.ts:36-77` (writing time slots)
- `src/editor/runtime/executor/RuntimeState.ts:50-115` (timeState storage in runtime)

## Plan

### 1) Confirm TimeRoot is authoritative

**Goal:** Compiler must extract exactly one TimeRoot and build TimeModel from it.

Steps:

1. Review `src/editor/compiler/passes/pass3-time.ts:72-110` to ensure:
   - CycleTimeRoot, FiniteTimeRoot, InfiniteTimeRoot map to TimeModel values specified in the design docs.
   - Error cases (missing/multiple TimeRoot) are hard failures.

2. Confirm pass3 output is threaded into later passes.
   - Ensure pass4/pass5/pass6 already carry `timeModel` (see pass4 at `src/editor/compiler/passes/pass4-depgraph.ts`).
   - If any pass still overrides timeModel, remove or align it.

### 2) Correct runtime time derivation semantics

**Goal:** runtime uses actual frame deltas and true timeModel parameters.

Steps:

1. In `src/editor/runtime/executor/timeResolution.ts:92-180`, verify:
   - wrapEvent uses **actual previous tModelMs** comparison and not fixed delta.
   - phase01 is always computed for cyclic models.
   - finite mode clamps and emits progress01.

2. In `src/editor/runtime/executor/steps/executeTimeDerive.ts:36-77`, ensure:
   - time values are written to output slots, with no duplicate writes.
   - wrapEvent is written as an event trigger (see Step 3).

### 3) Split event storage from continuous values

**Goal:** wrapEvent and other event signals behave like discrete triggers.

Steps:

1. Introduce an EventStore in runtime (new file or adjacent to ValueStore):
   - Add to `RuntimeState` (`src/editor/runtime/executor/RuntimeState.ts:50-115`).
   - Provide reset semantics per frame.

2. Update `executeTimeDerive` (`src/editor/runtime/executor/steps/executeTimeDerive.ts:36-77`):
   - Write wrapEvent to EventStore (triggered boolean + payload) instead of ValueStore.
   - If IR expects numeric signals for compatibility, add a conversion in signal evaluation.

3. Update any signal evaluation nodes that read wrapEvent to consult EventStore.

### 4) Scrub/seek handling

**Goal:** scrubbing does not fire wrap events or corrupt stateful ops.

Steps:

1. Extend `resolveTime` in `src/editor/runtime/executor/timeResolution.ts`:
   - Add an input mode (playback vs scrub) or infer scrub from delta.
   - If scrub, suppress wrapEvent and mark a scrub flag.

2. Expose scrub flag to runtime scheduler (e.g., in ScheduleExecutor).

3. When scrub is detected, signal stateful ops to reset or avoid consuming delta.

## Deliverables

- TimeRoot is the single time topology source.
- wrapEvent is a discrete trigger, not a continuous signal.
- Scrubbing does not cause phantom wrap events or state corruption.

## Validation (No Tests)

- Use Chrome DevTools MCP to:
  - Play a cyclic patch, confirm wrap event occurs once per cycle.
  - Scrub backwards/forwards and confirm wrap event does not spam.
  - Toggle time root type and confirm UI/range changes match TimeModel.

