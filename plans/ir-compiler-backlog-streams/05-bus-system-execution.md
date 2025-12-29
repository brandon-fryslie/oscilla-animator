# Workstream 5: Bus System Execution

**Goal:** Make bus evaluation deterministic and functional in IR, including event buses and non-numeric combine behavior.

## Scope

- Emit bus evaluation steps in the schedule.
- Add event bus evaluation and edge detection.
- Support non-numeric combine (vec2/vec3/color) and field buses.
- Enforce publisher ordering.

## Dependencies

- Depends on Workstream 1 (builder plumbing + TypeDesc).
- Depends on Workstream 2 for event store semantics.

## Primary References

- `plans/SPEC-07-bus-system.md`
- `plans/SPEC-09-compiler-passes.md`

## Key Files + Line Anchors

- `src/editor/compiler/ir/buildSchedule.ts:6-15` (KNOWN GAPS - bus eval not emitted)
- `src/editor/runtime/executor/steps/executeBusEval.ts:42-179` (bus eval runtime; numeric only)
- `src/editor/runtime/executor/ScheduleExecutor.ts:196-200` (bus eval step dispatch)

## Plan

### 1) Thread bus roots into schedule

**Goal:** Pass 7 produces bus roots; schedule builder emits StepBusEval per bus.

Steps:

1. Add busRoots to `BuilderProgramIR` (check `src/editor/compiler/ir/builderTypes.ts`).
2. Update pass7 output to include busRoots and thread through pass8 output.
3. In `src/editor/compiler/ir/buildSchedule.ts:6-15`, emit StepBusEval before signal evaluation.

### 2) Support non-numeric bus combine

**Goal:** Combine vec2/vec3/color bus values deterministically.

Steps:

1. Extend `executeBusEval` (`src/editor/runtime/executor/steps/executeBusEval.ts:42-179`) to branch on TypeDesc domain:
   - vec2/vec3: component-wise combine.
   - color: alpha composite for layer, blend for average, sum for additive.

2. Add silent value policies for non-numeric domains.

### 3) Event bus evaluation

**Goal:** Event buses combine triggers and expose edge detection.

Steps:

1. Add a new StepEventBusEval type (compiler IR schedule).
2. Implement executor in runtime (parallel to executeBusEval) to combine events.
3. Wire event listeners to use EventStore rather than ValueStore.

### 4) Field buses

**Goal:** Combine field values element-wise across publishers.

Steps:

1. Add field bus eval step that:
   - Materializes each publisher field.
   - Combines element-wise based on combine mode.

2. Ensure domain count is derived from domain slot (as in materialize steps).

### 5) Publisher ordering

**Goal:** “layer/last” semantics are deterministic.

Steps:

1. Enforce deterministic ordering in compiler (sortKey + publisherId).
2. In runtime, assume ordering is already sorted and never re-sort.

## Deliverables

- Bus evaluation runs in schedule with correct ordering.
- Event buses and field buses behave deterministically.
- Non-numeric combines are supported in runtime.

## Validation (No Tests)

- Use Chrome DevTools MCP to:
  - Publish multiple signals to a bus and verify combine semantics.
  - Use pulse/event buses and confirm triggers are edge-based.

