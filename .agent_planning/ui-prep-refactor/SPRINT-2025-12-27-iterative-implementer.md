# Sprint: UI Prep Refactor - Foundation Sprint
Generated: 2025-12-27 (iterative-implementer)
Plan: PLAN-2025-12-27-030440.md
DoD: DOD-2025-12-27-030440.md

---

## Sprint Status: IN_PROGRESS

**Current Phase**: Deliverable 1 - Stabilize Test Suite
**Test Status**: 79 failures → Target: 0 failures
**Mode**: TDD (tests exist and define done)

---

## Deliverable 1: Stabilize Test Suite (P0 - Critical)

### Test Failure Categories

After initial analysis, the 79 test failures fall into these categories:

1. **TimeRoot param/input confusion** (13 failures across 2 files)
   - TimeRoot-WP1.test.ts: 6 failures
   - TimeRoot.test.ts: 7 failures
   - **Root cause**: compile() reads from `inputs` but should read from `params`
   - **Files affected**: src/editor/compiler/blocks/domain/TimeRoot.ts

2. **Feature flag defaults** (5 failures in featureFlags.test.ts)
   - Tests expect useUnifiedCompiler=true by default
   - Tests expect IR path enabled by default
   - **Root cause**: Feature flag defaults may have changed

3. **Canonical bus type validation** (2 failures in pass2-types.test.ts)
   - phaseA bus type validation
   - **Root cause**: TBD - needs investigation

4. **Field materialization** (18 failures in executeMaterialize.test.ts)
   - Buffer allocation and materialization
   - **Root cause**: Field system changes during IR migration

5. **Domain pipeline** (12 failures in domain-pipeline.test.ts)
   - Domain creation and field operations
   - **Root cause**: IR migration changed domain handling

6. **IR Runtime** (7 failures across 2 files)
   - IRRuntimeIntegration.test.ts: 4 failures
   - IRRuntimeAdapter.test.ts: 2 failures
   - **Root cause**: Runtime adapter incomplete

7. **Bus compilation** (15 failures across 2 files)
   - bus-compilation.test.ts: 7 failures
   - field-bus-compilation.test.ts: 8 failures
   - **Root cause**: Bus system changes during IR migration

8. **Executor/Schedule** (2 failures across 2 files)
   - stepDispatch.test.ts: 1 failure
   - ScheduleExecutor.test.ts: 1 failure
   - **Root cause**: Step dispatch changes

9. **BufferPool** (1 failure in BufferPool.test.ts)
   - Vector buffer allocation
   - **Root cause**: Buffer size calculation

10. **GridDomain** (4 failures in GridDomain.test.ts)
    - Domain creation and hashing
    - **Root cause**: IR migration changed domain handling

11. **ColorLFO** (1 failure in ColorLFO.test.ts)
    - Default parameter handling
    - **Root cause**: Param reading issue

### Progress Tracker

- [ ] Category 1: TimeRoot param/input (13 failures) - **IN PROGRESS**
- [ ] Category 2: Feature flags (5 failures)
- [ ] Category 3: Canonical bus types (2 failures)
- [ ] Category 4: Field materialization (18 failures)
- [ ] Category 5: Domain pipeline (12 failures)
- [ ] Category 6: IR Runtime (7 failures)
- [ ] Category 7: Bus compilation (15 failures)
- [ ] Category 8: Executor/Schedule (2 failures)
- [ ] Category 9: BufferPool (1 failure)
- [ ] Category 10: GridDomain (4 failures)
- [ ] Category 11: ColorLFO (1 failure)

### Implementation Plan

**Phase 1: Quick Wins** (Est: 1-2 days)
- Fix TimeRoot param/input confusion (13 fixes)
- Fix feature flag defaults (5 fixes)
- Fix ColorLFO params (1 fix)
- **Target**: 19/79 failures resolved

**Phase 2: IR Integration Issues** (Est: 2-3 days)
- Fix domain pipeline (12 fixes)
- Fix GridDomain (4 fixes)
- Fix bus compilation (15 fixes)
- Fix IR Runtime (7 fixes)
- **Target**: 57/79 failures resolved

**Phase 3: Runtime System** (Est: 1-2 days)
- Fix field materialization (18 fixes)
- Fix executor/schedule (2 fixes)
- Fix BufferPool (1 fix)
- Fix canonical bus types (2 fixes)
- **Target**: 79/79 failures resolved

---

## Deliverable 2: Complete Kernel Op Application (P0 - Critical)

**Status**: Not Started
**Dependencies**: Deliverable 1 complete

### Op Types to Implement (26 total)

- [ ] Block Ops (5): BlockAdd, BlockRemove, BlockRetype, BlockSetLabel, BlockPatchParams
- [ ] Wire Ops (3): WireAdd, WireRemove, WireRetarget
- [ ] Bus Ops (3): BusAdd, BusRemove, BusUpdate
- [ ] Binding Ops (6): PublisherAdd/Remove/Update, ListenerAdd/Remove/Update
- [ ] Composite Ops (4): CompositeDefAdd/Remove/Update/ReplaceGraph
- [ ] Time Ops (1): TimeRootSet
- [ ] Settings Ops (1): PatchSettingsUpdate
- [ ] Asset Ops (3): AssetAdd/Remove/Update

---

## Deliverable 3: Wire PatchStore to Kernel Transactions (P0 - Critical)

**Status**: Not Started
**Dependencies**: Deliverable 2 complete

### Migration Checklist

- [ ] Add `kernel: PatchKernel` to PatchStore
- [ ] Replace `addBlock()` with kernel transaction
- [ ] Replace `removeBlock()` with kernel transaction
- [ ] Replace `addWire()` / `connect()` with kernel transaction
- [ ] Replace `removeWire()` / `disconnect()` with kernel transaction
- [ ] Replace `updateBus()` with kernel transaction
- [ ] Replace `addPublisher()` / `addListener()` with kernel transaction
- [ ] Replace `removePublisher()` / `removeListener()` with kernel transaction
- [ ] Add transaction rollback on validation failure
- [ ] Add MobX reactions to kernel state changes
- [ ] Integration test: full UI → Kernel → UI cycle

---

## Commits

*Commits will be listed here as work progresses*

---

## Blockers / Issues

*None currently*

---

## Notes

- Using TDD mode: run tests after each fix
- Committing after each logical chunk (category or group of related fixes)
- Not skipping tests - real fixes only
- Cross-referencing spec docs when behavior is ambiguous
