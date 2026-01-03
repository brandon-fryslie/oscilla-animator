# Definition of Done: Sprint 4 - Lens Parameter Binding Resolution
**Generated**: 2026-01-01-082134
**Plan**: PLAN-2026-01-01-sprint4-lens-bindings.md
**Topic**: bus-block-unification

---

## Sprint Scope
This sprint delivers: Full lens parameter binding support for wire, default, and bus sources (completes TODO at pass8-link-resolution.ts:469-470).

Deferred: Adapter chain handling (deprecated), lens stack handling (deprecated).

---

## Acceptance Criteria

### P0: Wire Bindings

- [ ] Wire binding case added to lens param loop (pass8-link-resolution.ts)
- [ ] Block output resolved via `blockOutputs.get()` lookup
- [ ] Output converted to `ValueRefPacked` via `artifactToValueRef()`
- [ ] Deprecated fields (`adapterChain`, `lensStack`) ignored with comment
- [ ] Error diagnostic emitted if wire source not found
- [ ] TypeScript compilation succeeds
- [ ] Test added: lens param bound to oscillator output
- [ ] Test added: lens param bound to transform output
- [ ] Test added: error case - wire to non-existent block
- [ ] Test added: error case - wire to non-existent output
- [ ] All new tests pass
- [ ] Manual verification: wire-bound lens param works in dev server
- [ ] Committed with reference "Sprint 4 P0"

---

### P1: Default Bindings

- [ ] Default binding case added to lens param loop
- [ ] Default source definition looked up from patch
- [ ] Default value converted to `ValueRefPacked` (scalar const or expression)
- [ ] Helper function `createDefaultValueRef()` implemented (if needed)
- [ ] Error diagnostic emitted if default source not found
- [ ] TypeScript compilation succeeds
- [ ] Test added: lens param using default source (scalar const)
- [ ] Test added: error case - default source not found
- [ ] All new tests pass
- [ ] Manual verification: default-bound lens param works in dev server
- [ ] Committed with reference "Sprint 4 P1"

---

### P2: Bus Bindings (BLOCKED by Sprint 3)

- [ ] Sprint 3 DOD satisfied (prerequisite)
- [ ] Bus binding case added to lens param loop
- [ ] BusBlock looked up by busId
- [ ] Bus combine result retrieved from `busRoots` map
- [ ] Error diagnostic emitted if bus not found
- [ ] Error diagnostic emitted if busRoots entry missing
- [ ] Deprecated fields (`adapterChain`, `lensStack`) ignored with comment
- [ ] TypeScript compilation succeeds
- [ ] Test added: lens param bound to latest-mode bus
- [ ] Test added: lens param bound to merge-mode bus
- [ ] Test added: lens param bound to array-mode bus
- [ ] Test added: error case - bus not found
- [ ] All new tests pass
- [ ] Manual verification: bus-bound lens param works in dev server
- [ ] Committed with reference "Sprint 4 P2"

---

### P3: Documentation & Cleanup

- [ ] TODO comment removed (pass8-link-resolution.ts:469-470)
- [ ] Comment added explaining all binding kinds supported
- [ ] Comment explains deprecated fields (adapterChain, lensStack) ignored
- [ ] No other TODOs related to lens params remain in codebase
- [ ] Committed with reference "Sprint 4 P3"

---

## Integration Acceptance Criteria

### Compilation
- [ ] TypeScript compilation succeeds: `just typecheck` exits with code 0
- [ ] Golden patch with all binding kinds compiles successfully
- [ ] IR contains correct `ValueRefPacked` references for all bindings
- [ ] No compile errors for valid lens param bindings
- [ ] Clear compile error diagnostics for invalid bindings

### Testing
- [ ] All tests pass: `just test` exits with code 0
- [ ] Test coverage: all four binding kinds (literal, wire, default, bus)
- [ ] Test coverage: error cases (missing sources)
- [ ] Integration test: golden patch with mixed binding kinds

### Manual UI Verification (in `just dev`)
- [ ] Create lens with wire-bound param
- [ ] Connect wire to oscillator output
- [ ] Verify lens receives oscillator value
- [ ] Create lens with default-bound param
- [ ] Verify lens uses default value
- [ ] Create lens with bus-bound param
- [ ] Connect publishers to bus
- [ ] Verify lens receives bus combine value (all modes: latest, merge, array)
- [ ] Scrub timeline → lens params update correctly

---

## Code Quality Metrics

- [ ] ~80-120 lines of implementation code added
- [ ] ~150 lines of test code added
- [ ] All commits reference Sprint 4 work items
- [ ] Git history is clean (no fixup commits)
- [ ] No new TODOs introduced

---

## Test Coverage Requirements

### Unit Tests (lens-param-bindings.test.ts)
- [ ] Test: literal binding (baseline)
- [ ] Test: wire binding to oscillator output
- [ ] Test: wire binding to transform output
- [ ] Test: default binding to scalar constant
- [ ] Test: bus binding to latest-mode bus
- [ ] Test: bus binding to merge-mode bus
- [ ] Test: bus binding to array-mode bus
- [ ] Test: error - wire to non-existent block
- [ ] Test: error - wire to non-existent output
- [ ] Test: error - default source not found
- [ ] Test: error - bus not found

### Integration Tests
- [ ] Golden patch created with all binding kinds
- [ ] Golden patch compiles without errors
- [ ] IR verification: correct ValueRefPacked types
- [ ] Runtime verification: correct values received

---

## Sprint NOT Complete Until

1. P0 (wire bindings) committed with passing tests
2. P1 (default bindings) committed with passing tests
3. P2 (bus bindings) committed with passing tests (Sprint 3 must be complete first)
4. P3 (documentation) committed
5. All test coverage requirements satisfied
6. Manual UI testing checklist complete
7. Zero TypeScript errors
8. Zero test failures

---

## Explicitly NOT Required (Out of Scope)

- Adapter chain handling ❌ (deprecated, Track A.5)
- Lens stack handling ❌ (deprecated, Track A.5)
- New lens types or features ❌
- Performance optimization ❌
- Error recovery or fallback values ❌

**Reason**: Focus on completing the TODO - basic binding resolution only. Advanced features deferred.

---

## Definition of Done Summary

**Sprint 4 is complete when:**
- All lens param binding kinds work (literal, wire, default, bus)
- TODO removed from pass8-link-resolution.ts
- Comprehensive test coverage
- Manual UI verification passes
- All acceptance criteria checked
- Code committed with clean git history

**Next Sprint**: None - Bus-Block Unification complete! Consider Sprint 3.5 (type cleanup) or new feature work.
