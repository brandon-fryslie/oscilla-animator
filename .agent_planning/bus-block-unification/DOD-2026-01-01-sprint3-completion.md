# Definition of Done: Sprint 3 - Compiler Code Path Unification
**Generated**: 2026-01-01-082134
**Plan**: PLAN-2026-01-01-sprint3-completion.md
**Topic**: bus-block-unification

---

## Sprint Scope
This sprint delivers: Removal of ALL compiler and store bus branching logic, unified port-to-port edge processing.

Deferred: Endpoint type union removal, BusStore deletion, full type cleanup (future sprint).

---

## Acceptance Criteria

### P0: Fix Failing Tests (GATE - Required Before Any Other Work)

- [ ] All tests in TxBuilder.test.ts pass
- [ ] All tests in ops.test.ts pass
- [ ] removeBlockCascade test passes (block count mismatch resolved)
- [ ] Zero failing tests: `just test` exits with code 0
- [ ] Root cause documented: why default buses were being created
- [ ] Committed with reference to Sprint 3 plan

---

### P1-A: Remove Pass 6 Bus Branching

- [ ] `pass6-block-lowering.ts:417` bus check removed
- [ ] Writer resolution handles BusBlock ports uniformly (no special case)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] Committed with reference "Sprint 3 P1-A"

---

### P1-B: Remove Pass 7 Legacy Edge Support

- [ ] `getPublishersFromLegacyEdges()` function deleted
- [ ] `hasLegacyEdges` check deleted
- [ ] All publisher lookups use `getEdgesToBusBlock()` (port→port edges only)
- [ ] Comment updated explaining BusBlock-only support
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (bus combining verified)
- [ ] Committed with reference "Sprint 3 P1-B"

---

### P1-C: Update Pass 8 Documentation

- [ ] Comment at pass8-link-resolution.ts:546 updated
- [ ] Comment explains all edges are port→port (migration complete)
- [ ] Committed with reference "Sprint 3 P1-C"

---

### P1-D: Remove resolveWriters Bus Kind

- [ ] Bus listener classification removed (resolveWriters.ts:162-169)
- [ ] All writers classified as 'wire' or 'default' only (no 'bus' kind)
- [ ] BusBlock outputs treated like regular block outputs
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (listeners verified working)
- [ ] Committed with reference "Sprint 3 P1-D"

---

### P1-E: Remove Pass 1 Publisher Sorting

- [ ] Publisher edge filter removed (pass1-normalize.ts:63)
- [ ] Non-publisher filter removed (pass1-normalize.ts:72)
- [ ] All edges sorted uniformly by sortKey
- [ ] Deterministic bus combine order preserved (verified with test)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (especially bus combine tests)
- [ ] Committed with reference "Sprint 3 P1-E"

---

### P2-A: Update PatchStore Bus Helpers

- [ ] `publisherEdges` getter updated to query edges to `*.in` on BusBlocks OR removed
- [ ] `listenerEdges` getter updated to query edges from `*.out` on BusBlocks OR removed
- [ ] Edge update helpers updated (addEdgeEndpoints, removeEdgeEndpoints)
- [ ] UI components using these getters still work
- [ ] MobX reactivity preserved
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] Committed with reference "Sprint 3 P2-A"

---

### P2-B: Update SelectionStore

- [ ] `selection.kind === 'bus'` check removed (SelectionStore.ts:71)
- [ ] BusBlock selections identified by `block.type === 'BusBlock'`
- [ ] Selected bus ID retrieved from `block.params.busId`
- [ ] TypeScript compilation succeeds
- [ ] Selection tests pass
- [ ] UI correctly shows BusBlock as selected
- [ ] Committed with reference "Sprint 3 P2-B"

---

### P2-C: Update DiagnosticStore

- [ ] `target.kind === 'bus'` check removed or updated (DiagnosticStore.ts:177)
- [ ] Diagnostics targeting BusBlocks match by block.id
- [ ] Bus-related diagnostics display correctly
- [ ] TypeScript compilation succeeds
- [ ] Diagnostic tests pass
- [ ] Committed with reference "Sprint 3 P2-C"

---

## Integration Acceptance Criteria

### Compilation
- [ ] TypeScript compilation succeeds: `just typecheck` exits with code 0
- [ ] Zero `kind === 'bus'` checks in compiler (Pass 1, 6, 7, 8, resolveWriters)
- [ ] Zero `edge.from.kind === 'bus'` checks in compiler
- [ ] Zero `edge.to.kind === 'bus'` checks in compiler (except migration utils)

### Testing
- [ ] All tests pass: `just test` exits with code 0
- [ ] Bus combine tests pass (latest, merge, array modes)
- [ ] Bus connection tests pass (publisher, listener)
- [ ] Writer resolution tests pass

### Manual UI Verification (in `just dev`)
- [ ] Create new bus → BusBlock created
- [ ] Connect publisher to bus → edge to BusBlock.in
- [ ] Connect listener from bus → edge from BusBlock.out
- [ ] Bus combine modes work (latest, merge, array)
- [ ] Bus inspector shows correct info
- [ ] Bus board displays BusBlocks
- [ ] Delete bus → BusBlock removed
- [ ] Compile patch with buses → no errors
- [ ] Scrub timeline → bus values update correctly

---

## Code Quality Metrics

- [ ] ~110-140 lines of bus branching code deleted
- [ ] No new technical debt introduced
- [ ] All commits reference Sprint 3 work items
- [ ] Git history is clean (no fixup commits)

---

## Sprint NOT Complete Until

1. P0 (test fixes) committed and all tests green
2. All P1 items (A-E) committed with passing tests
3. All P2 items (A-C) committed with passing tests
4. Manual UI testing checklist complete
5. Zero TypeScript errors
6. Zero test failures

---

## Explicitly NOT Required (Deferred)

- Endpoint type union simplified ❌
- Bus/Publisher/Listener types removed ❌
- BusStore deleted ❌
- Patch.buses/publishers/listeners arrays removed ❌
- Full UI component adaptation ❌

**Reason**: Test suite instability (43 failures) makes major type refactoring too risky. Focus on functional unification only.

---

## Definition of Done Summary

**Sprint 3 is complete when:**
- Zero failing tests
- Zero bus branching code in compiler
- Stores use BusBlock ports for bus operations
- All acceptance criteria checked
- Manual UI testing passes
- Code committed with clean git history

**Next Sprint**: Sprint 4 (Lens Parameter Bindings) can begin after Sprint 3 DOD satisfied.
