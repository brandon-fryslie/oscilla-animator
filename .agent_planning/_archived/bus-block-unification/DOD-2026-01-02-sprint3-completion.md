# Definition of Done: Sprint 3 Completion - Bus Block Unification

**Generated**: 2026-01-02-060000
**Topic**: bus-block-unification
**Plan**: PLAN-2026-01-02-sprint3-completion.md
**Source STATUS**: STATUS-2026-01-02-p1-type-cleanup.md

---

## Sprint Scope

This sprint delivers:
1. **P0: Unblocked Compilation** - Transform definitions fixed, TypeScript compiles
2. **P1: Verified Sprint 3 Completion** - Compiler bus checks confirmed removed, tests pass
3. **P2: Store Check Investigation** - Documented findings on legacy bus checks in stores

Deferred:
- P2: Store bus check removal (conditional on investigation)
- P3: Type cleanup (deprecated Endpoint variant)
- BusStore deletion (Sprint 4)

---

## Acceptance Criteria

### P0: Fix Transform Definition Compilation Errors

**Deliverable**: TypeScript compilation succeeds (0 errors)

#### Transform Definitions Fixed

- [ ] File `src/editor/transforms/definitions/adapters/ConstToSignal.ts` updated:
  - [ ] All TypeDesc literals include `busEligible: true` field (10 locations)
  - [ ] Line 74 artifact type error resolved (Signal:boolean)
  - [ ] Line 96 artifact type error resolved (Signal:color)

- [ ] File `src/editor/transforms/definitions/lenses/arithmetic.ts` updated:
  - [ ] All TypeDesc literals include `busEligible: true` field (5 locations)

- [ ] File `src/editor/transforms/definitions/lenses/ease.ts` updated:
  - [ ] Line 31 TypeDesc includes `busEligible: true`
  - [ ] Lines 34-39 enum values converted to `{ value, label }` objects (15 values)

- [ ] File `src/editor/transforms/definitions/lenses/shaping.ts` updated:
  - [ ] All TypeDesc literals include `busEligible: true` field (7 locations)
  - [ ] Line 161 widget type error resolved ("toggle" → valid widget type)

- [ ] File `src/editor/__tests__/lenses.test.ts` fixed:
  - [ ] Deleted imports removed (`applyLens`, `isValidLensType`)
  - [ ] OR test file skipped/deleted if lens system deprecated

#### Compilation Verified

- [ ] Command `just typecheck` completes with 0 TypeScript errors
- [ ] Command `just build` completes successfully (production build works)
- [ ] No new compilation warnings introduced

---

### P1: Verify Compiler Bus Check Removal

**Deliverable**: Confirmed all `kind === 'bus'` checks removed from compiler, tests pass

#### Code Inspection Complete

- [ ] File `src/editor/compiler/passes/pass1-normalize.ts` reviewed:
  - [ ] Lines 63, 72 do NOT filter edges by `kind === 'bus'`
  - [ ] Commit bfc2db9 changes verified present

- [ ] File `src/editor/compiler/passes/pass6-block-lowering.ts` reviewed:
  - [ ] Line 417 does NOT return `null` for bus writers
  - [ ] Writer resolution handles all ports uniformly
  - [ ] Commit 181ef11 changes verified present

- [ ] File `src/editor/compiler/passes/pass7-bus-lowering.ts` reviewed:
  - [ ] Lines 167, 274 legacy edge functions removed
  - [ ] Only `getEdgesToBusBlock()` used (port-based queries)
  - [ ] Commit 096d4a0 changes verified present

- [ ] File `src/editor/compiler/passes/pass8-link-resolution.ts` reviewed:
  - [ ] Line 546 comment updated (states "all edges port→port after migration")
  - [ ] No references to bus edges in implementation
  - [ ] Commit 5377b27 changes verified present

- [ ] File `src/editor/compiler/passes/resolveWriters.ts` reviewed:
  - [ ] Only 'wire' and 'default' writer kinds exist (no 'bus' kind)
  - [ ] Line 162 has documentation comment about removed bus check
  - [ ] Commit d64f76b changes verified present

- [ ] Grep `src/editor/compiler/passes/` for `kind === 'bus'`:
  - [ ] Only migration utilities (`edgeMigration.ts`) contain bus checks
  - [ ] Only documentation comments reference old bus behavior
  - [ ] NO active runtime checks in compiler passes

#### Test Suite Passes

- [ ] Command `just test -- compiler` passes all compiler tests (0 failures)
- [ ] Command `just test -- pass7` passes bus lowering tests (0 failures)
- [ ] Command `just test -- resolveWriters` passes writer resolution tests (0 failures)
- [ ] No new test failures introduced during Sprint 3
- [ ] No skipped tests related to bus functionality (unless lens-related)

---

### P1: Manual BusBlock Functionality Verification

**Deliverable**: End-to-end BusBlock workflow verified in browser

#### BusBlock Creation and Connection

- [ ] Manual test: Create new BusBlock via UI
  - [ ] BusBlock appears on canvas correctly
  - [ ] Inspector shows BusBlock properties
  - [ ] Block has `type === 'BusBlock'` (NOT legacy Bus entity)
  - [ ] Block has valid `params.busId` property

- [ ] Manual test: Connect edges to/from BusBlock
  - [ ] Both edges visible on canvas with correct routing

- [ ] Manual test: Inspect edge data structures (Chrome DevTools)
  - [ ] Edge shape is `{ from: PortRef, to: PortRef }`
  - [ ] `from` field: `{ kind: 'port', blockId, slotId }`
  - [ ] `to` field: `{ kind: 'port', blockId, slotId }`
  - [ ] NO edges with `kind: 'bus'` in either endpoint

#### Compilation and Runtime

- [ ] Manual test: Compile patch with BusBlock
  - [ ] Compilation succeeds (no compile errors)
  - [ ] No console errors during compilation
  - [ ] IR generated correctly (verify in DevTools if possible)

- [ ] Manual test: Runtime execution
  - [ ] Scrubbing timeline shows smooth animation
  - [ ] No runtime errors in browser console

- [ ] Manual test: Bus combine modes
  - [ ] Combine mode "merge" works (object merge)
  - [ ] Combine mode "array" works (collect all values)

#### Diagnostics and Error Handling

- [ ] Manual test: Create type mismatch diagnostic
  - [ ] Change BusBlock type to incompatible type
  - [ ] Compile error appears in diagnostic panel
  - [ ] Error message references BusBlock (not legacy "bus ID xyz")
  - [ ] Diagnostic targets block correctly (clickable in UI)

---

### P2: Investigate Store Legacy Bus Checks

**Deliverable**: Documented findings on store `kind === 'bus'` check safety

#### PatchStore Event Emission Analysis

- [ ] Read `src/editor/stores/PatchStore.ts` method `addEdgeEndpoints` (lines 1368, 1378)
  - [ ] Understand what events are emitted for bus edges
  - [ ] Identify event data shape (EdgeEndpointAdded payload)
  - [ ] Document logic flow in investigation notes

- [ ] Read `src/editor/stores/PatchStore.ts` method `removeEdgeEndpoints` (lines 1416, 1426)
  - [ ] Understand cleanup logic for bus edges
  - [ ] Identify event data shape (EdgeEndpointRemoved payload)
  - [ ] Document logic flow in investigation notes

  - [ ] List all components/stores that listen to this event
  - [ ] Check if any discriminate by `endpoint.kind === 'bus'`
  - [ ] Document findings: dependencies on bus variant

  - [ ] List all components/stores that listen to this event
  - [ ] Check if any discriminate by `endpoint.kind === 'bus'`
  - [ ] Document findings: dependencies on bus variant

#### SelectionStore Analysis

- [ ] Read `src/editor/stores/SelectionStore.ts` line 79-81
  - [ ] Understand when `selection.kind === 'bus'` branch is taken
  - [ ] Check if BusBlocks use `kind: 'block'` instead
  - [ ] Document current selection mechanism for buses

- [ ] Grep for `setSelection({ kind: 'bus' })` calls
  - [ ] List all locations that set bus selection
  - [ ] Verify none exist outside migration utilities
  - [ ] Document findings: is branch dead code?

#### DiagnosticStore Analysis

- [ ] Read `src/editor/stores/DiagnosticStore.ts` line 186-187
  - [ ] Understand when `target.kind === 'bus'` branch is taken
  - [ ] Check if BusBlock diagnostics use `kind: 'block'` instead
  - [ ] Document current diagnostic targeting for buses

- [ ] Grep for diagnostic creation with `target: { kind: 'bus' }`
  - [ ] List all locations that create bus-targeted diagnostics
  - [ ] Verify none exist outside migration utilities
  - [ ] Document findings: is branch dead code?

#### Investigation Report

- [ ] Document findings in STATUS file update
  - [ ] Summary: are store checks dead code, migration compat, or active?
  - [ ] Recommendation: remove now, defer, or refactor?
  - [ ] Rationale: evidence supporting recommendation
  - [ ] Risk assessment: what breaks if we remove checks?

- [ ] Create follow-up tasks if needed
  - [ ] If dead code: add P2-B "Remove store checks" to this sprint
  - [ ] If migration compat: defer to Sprint 4 after migration period
  - [ ] If needs refactor: create detailed task breakdown

---

## Sprint Success Criteria

### Must Have (Sprint 3 P1 Complete)

- [ ] All P0 acceptance criteria met (compilation fixed)
- [ ] All P1 acceptance criteria met (compiler verified, tests pass)
- [ ] Manual BusBlock workflow verified working end-to-end
- [ ] No regressions introduced (existing functionality still works)

### Should Have (Sprint 3 P2 Investigation)

- [ ] All P2 investigation acceptance criteria met
- [ ] Findings documented with clear recommendation
- [ ] Decision made: proceed with removal or defer

### Could Have (Sprint 3 P2 Removal)

- [ ] Store bus checks removed (if investigation approves)
- [ ] Store tests pass after removal
- [ ] UI verified working after removal

---

## Testing Checklist

### Automated Tests

- [ ] `just typecheck` - 0 TypeScript errors
- [ ] `just build` - production build succeeds
- [ ] `just test` - full test suite passes
- [ ] `just test -- compiler` - compiler tests pass
- [ ] `just test -- pass7` - bus lowering tests pass
- [ ] `just test -- resolveWriters` - writer resolution tests pass
- [ ] `just test -- PatchStore` - store tests pass (if P2 executed)

### Manual Tests (Browser)

- [ ] Create BusBlock via UI
- [ ] Compile patch with BusBlock
- [ ] Run patch, verify animation works
- [ ] Test bus combine modes (latest, merge, array)
- [ ] Create type mismatch, verify diagnostic appears
- [ ] Select BusBlock, verify inspector shows data
- [ ] No console errors during any operation

### Code Inspection

- [ ] Read all modified compiler pass files
- [ ] Grep for remaining `kind === 'bus'` checks
- [ ] Verify only migration code and comments remain
- [ ] Review git diff for Sprint 3 commits

---

## Rollback Criteria

If any of these occur, STOP and rollback changes:

- [ ] ❌ Tests fail that previously passed (regression)
- [ ] ❌ Runtime errors in browser console during manual tests
- [ ] ❌ BusBlock creation/connection broken in UI
- [ ] ❌ Compilation fails for valid patches
- [ ] ❌ Type errors cannot be resolved within estimated effort
- [ ] ❌ Store changes break UI reactivity (if P2 executed)

**Rollback Plan**: Revert commits from this sprint, create follow-up investigation task

---

## Documentation Updates

- [ ] Update STATUS file with "VERIFIED ✅" after P1 complete
- [ ] Document P2 investigation findings in STATUS
- [ ] Update PLAN if scope changes based on P2 findings
- [ ] Create SUMMARY file for sprint completion

---

## Definition of "Done"

Sprint 3 is DONE when:

1. **Compilation succeeds** - No TypeScript errors, build works
2. **P1 verified** - Compiler bus checks confirmed removed via code inspection
3. **Tests pass** - Automated test suite runs successfully
4. **Manual verification complete** - BusBlock workflow tested end-to-end in browser
5. **P2 investigation documented** - Findings and recommendation recorded
6. **No regressions** - Existing functionality still works
7. **Ready for next sprint** - Clear path forward for remaining work

---

**Timestamp**: 2026-01-02-060000
**Planner**: status-planner
**Estimated Effort**: 4-6 hours (P0+P1+P2 investigation)
