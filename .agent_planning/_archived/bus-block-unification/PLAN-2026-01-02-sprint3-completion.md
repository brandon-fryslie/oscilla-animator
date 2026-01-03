# Sprint 3 Completion Plan - Bus Block Unification

**Generated**: 2026-01-02-060000
**Topic**: bus-block-unification
**Source STATUS**: STATUS-2026-01-02-p1-type-cleanup.md
**Git Commit**: 0a18884 (HEAD → bmf_new_compiler)

---

## Executive Summary

**Sprint 3 P1 Status**: 🟢 **95% COMPLETE** - All compiler `kind === 'bus'` checks removed

**Critical Finding**: The P1 work is essentially DONE. Eight systematic commits between Dec 31 - Jan 2 removed all target locations. However, **unrelated TypeScript compilation errors** in transform definitions block test verification.

**This Sprint Focus**:
1. **P0**: Fix transform definition TypeErrors (busEligible fields) - **UNBLOCKS TESTS**
2. **P1**: Verify Sprint 3 completion via test suite
3. **P2**: Investigate store legacy checks - determine removal safety

**Total Estimated Effort**: 4-6 hours

---

## Backlog by Priority

---

## [P0] Fix Transform Definition Compilation Errors

**Status**: Not Started (BLOCKING)
**Effort**: Small (1-2 hours)
**Dependencies**: None
**Spec Reference**: N/A (unrelated technical debt)
**Status Reference**: STATUS-2026-01-02-p1-type-cleanup.md § Current Test Failures

### Description

TypeScript compilation is blocked by 45 errors in transform definitions. These are NOT bus-unification issues - they're missing `busEligible` fields in TypeDesc objects and outdated test imports. This work unblocks all test verification.

**Root Cause**: TypeDesc interface now requires `busEligible: boolean` field, but transform definitions use shorthand objects without this field.

**Files Affected**:
- `src/editor/transforms/definitions/adapters/ConstToSignal.ts` (10 errors)
- `src/editor/transforms/definitions/lenses/arithmetic.ts` (5 errors)
- `src/editor/transforms/definitions/lenses/ease.ts` (15 errors)
- `src/editor/transforms/definitions/lenses/shaping.ts` (7 errors)
- `src/editor/__tests__/lenses.test.ts` (2 errors)

### Acceptance Criteria

- [ ] All TypeDesc literals in `ConstToSignal.ts` include `busEligible: true` field
- [ ] All TypeDesc literals in `arithmetic.ts` include `busEligible: true` field
- [ ] All TypeDesc literals in `ease.ts` include `busEligible: true` field
- [ ] All TypeDesc literals in `shaping.ts` include `busEligible: true` field
- [ ] Enum values in `ease.ts` lines 34-39 use `{ value: string; label: string }` objects
- [ ] Artifact type errors in `ConstToSignal.ts` lines 74, 96 resolved
- [ ] Widget type error in `shaping.ts` line 161 resolved ("toggle" → valid widget type)
- [ ] Deleted lens test imports removed from `lenses.test.ts` (applyLens, isValidLensType)
- [ ] Command `just typecheck` completes with 0 errors
- [ ] Command `just build` completes successfully

### Technical Notes

**Fix Pattern**:
```typescript
// BEFORE (causes error)
inputType: { world: 'scalar', domain: 'float', category: 'core' }

// AFTER (correct)
inputType: { world: 'scalar', domain: 'float', category: 'core', busEligible: true }
```

**Enum Fix Pattern** (ease.ts):
```typescript
// BEFORE
enum: ['linear', 'easeIn', 'easeOut', ...]

// AFTER
enum: [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease In' },
  ...
]
```

**Locations**: ~30 TypeDesc literals need `busEligible: true` added

**Validation**: Run `just typecheck` after each file to verify errors decrease

---

## [P1] Verify Compiler Bus Check Removal

**Status**: Not Started (BLOCKED BY P0)
**Effort**: Small (30 minutes)
**Dependencies**: P0 (compilation must succeed)
**Spec Reference**: design-docs/spec/ § Bus Block architecture
**Status Reference**: STATUS-2026-01-02-p1-type-cleanup.md § What Changed

### Description

Verify that all P1 work is complete: confirm `kind === 'bus'` checks removed from compiler passes, and tests pass. This is a VERIFICATION task, not implementation - the work was already done in 8 commits.

**Commits to Verify**:
- 181ef11: Pass 6 bus writer check removed
- 096d4a0: Pass 7 legacy edge functions removed
- 5377b27: Pass 8 comments updated
- d64f76b: resolveWriters bus classification removed

### Acceptance Criteria

- [ ] Read pass1-normalize.ts lines 63, 72 - confirm NO `kind === 'bus'` filtering
- [ ] Read pass6-block-lowering.ts line 417 - confirm NO bus writer null return
- [ ] Read pass7-bus-lowering.ts lines 167, 274 - confirm legacy functions removed
- [ ] Read pass8-link-resolution.ts line 546 - confirm comment updated (no bus edges)
- [ ] Grep compiler/passes/ for `kind === 'bus'` - only migration code and comments found
- [ ] Command `just test -- compiler` passes all tests
- [ ] Command `just test -- pass7` passes (bus lowering specific)
- [ ] Command `just test -- resolveWriters` passes (writer resolution)
- [ ] No new compiler errors introduced during Sprint 3

### Technical Notes

**Expected Grep Output**: Should find:
- Comments referencing old bus behavior (EXPECTED)
- Migration utilities in `edgeMigration.ts` (EXEMPT from scope)
- NO active runtime checks in compiler passes

**Test Validation**: Focus on tests that compile patches with BusBlocks - verify they produce correct IR and schedules without special-casing bus edges.

---

## [P1] Manual BusBlock Functionality Verification

**Status**: Not Started (BLOCKED BY P0)
**Effort**: Small (30 minutes)
**Dependencies**: P0 (compilation), P1-A (compiler verification)
**Spec Reference**: design-docs/spec/ § Bus Block runtime behavior
**Status Reference**: STATUS-2026-01-02-p1-type-cleanup.md § Success Metrics

### Description

Manual end-to-end test of BusBlock creation, edge connection, and compilation to verify Sprint 2-3 changes work correctly in actual usage. Use Chrome DevTools MCP to verify UI behavior.

**Why Manual Tests**: Automated tests may pass while UI is broken. Real user workflow validation catches integration issues.

### Acceptance Criteria

- [ ] Create new BusBlock via UI - verify it appears on canvas
- [ ] Inspect created BusBlock - verify `block.type === 'BusBlock'` (not legacy Bus entity)
- [ ] Inspect edges in DevTools - verify shape is `{ from: PortRef, to: PortRef }` (NO `kind: 'bus'`)
- [ ] Compile patch with BusBlock - verify compilation succeeds
- [ ] Verify runtime execution: values flow through bus correctly
- [ ] Test bus combine modes (latest, merge, array) - verify behavior matches spec
- [ ] Create type mismatch on bus - verify diagnostic appears in panel
- [ ] Verify diagnostic targets BusBlock (not legacy bus entity)

### Technical Notes

**Test Patch Setup**:
1. Create Oscillator block (Signal:float output)
2. Create BusBlock (type: Signal:float)
3. Connect Oscillator → BusBlock.in
4. Create RenderBox block
5. Connect BusBlock.out → RenderBox.x input
6. Compile and run - verify smooth animation

**Diagnostic Test**:
1. Change BusBlock type to Signal:boolean
2. Verify compile error appears
3. Check error message references BusBlock (not "bus ID xyz")

**DevTools Verification**:
```javascript
// In browser console
patch.edges.forEach(e => {
  console.log('Edge:', {
    from: e.from,  // Should be { kind: 'port', blockId, slotId }
    to: e.to       // Should be { kind: 'port', blockId, slotId }
  })
})
```

---

## [P2] Investigate Store Legacy Bus Checks

**Status**: Not Started
**Effort**: Medium (2-3 hours)
**Dependencies**: P0, P1 (understand system before modifying stores)
**Spec Reference**: design-docs/spec/ § Store architecture
**Status Reference**: STATUS-2026-01-02-p1-type-cleanup.md § What Needs to Change § P2

### Description

Determine if `kind === 'bus'` checks in PatchStore, SelectionStore, and DiagnosticStore are:
1. **Dead code** (unreachable with BusBlocks) → remove safely
2. **Migration compatibility** (handle old patches) → keep temporarily
3. **Active code** (needs refactoring) → plan refactor work

**Key Question**: After Sprint 2 migration, do any code paths construct Endpoints with `kind: 'bus'`?

### Acceptance Criteria

- [ ] Read PatchStore.ts `addEdgeEndpoints` (lines 1368, 1378) - understand event emission logic
- [ ] Read PatchStore.ts `removeEdgeEndpoints` (lines 1416, 1426) - understand cleanup logic
- [ ] Verify: UI components do NOT check `endpoint.kind === 'bus'` in event handlers
- [ ] Read SelectionStore.ts line 79 - determine if `selection.kind === 'bus'` is reachable
- [ ] Grep for `setSelection({ kind: 'bus' })` calls - verify none exist outside migration
- [ ] Read DiagnosticStore.ts line 186 - check if diagnostics use `{ kind: 'bus' }` targets
- [ ] Grep for diagnostic creation with `target: { kind: 'bus' }` - verify none exist
- [ ] Document findings in STATUS file with recommendation (remove/defer/refactor)

### Technical Notes

**Investigation Checklist**:

1. **Event Emission Analysis**:
   - What data shape do `EdgeEndpointAdded`/`Removed` events carry?
   - Can we remove bus branches without breaking reactivity?

2. **Selection Analysis**:
   - How does UI select BusBlocks currently?
   - Does it use `kind: 'block'` with type check or `kind: 'bus'`?
   - Is `kind === 'bus'` branch dead code?

3. **Diagnostic Analysis**:
   - How are BusBlock diagnostics created?
   - Do they use `{ kind: 'block'; blockId }` or `{ kind: 'bus'; busId }`?
   - Are legacy paths reachable?

**Outcome**: Create follow-up work items based on findings:
- If dead code → add to Sprint 3 scope (quick wins)
- If migration compat → defer to Sprint 4 (after migration period)
- If needs refactor → create detailed task breakdown

---

## [P2] Remove Store Bus Checks (CONDITIONAL)

**Status**: Not Started (CONDITIONAL ON P2-A FINDINGS)
**Effort**: Small (1-2 hours) OR Medium (3-4 hours) depending on findings
**Dependencies**: P2-A (investigation must confirm safe)
**Spec Reference**: design-docs/spec/ § Store architecture
**Status Reference**: STATUS-2026-01-02-p1-type-cleanup.md § What Needs to Change § P2

### Description

**ONLY execute if P2-A investigation confirms safe**. Remove `kind === 'bus'` branches from store files and update event emission to use BusBlock detection.

**WARNING**: Do NOT proceed if:
- UI components depend on `endpoint.kind === 'bus'`
- Migration code relies on legacy event shapes
- Uncertainty about reachability of branches

### Acceptance Criteria

- [ ] Remove `kind === 'bus'` branches from PatchStore.ts event emission (if safe)
- [ ] Update event emission to detect BusBlocks via `block.type === 'BusBlock'`
- [ ] Remove `kind === 'bus'` check from SelectionStore.ts (if safe)
- [ ] Remove `kind === 'bus'` check from DiagnosticStore.ts (if safe)
- [ ] Command `just test -- PatchStore` passes
- [ ] Command `just test -- SelectionStore` passes
- [ ] Command `just test -- DiagnosticStore` passes
- [ ] Manual test: Select BusBlock - verify inspector works
- [ ] Manual test: Create bus diagnostic - verify panel displays correctly
- [ ] Grep stores/ for `kind === 'bus'` - only migration code remains

### Technical Notes

**Replacement Pattern**:
```typescript
// BEFORE
if (edge.from.kind === 'port' && edge.to.kind === 'bus') {
}

// AFTER (detect BusBlock via port lookup)
const toBlock = this.patch.blocks.find(b => b.id === edge.to.blockId);
if (toBlock?.type === 'BusBlock') {
}
```

**Validation**: After changes, verify:
1. UI reactivity still works (selection, diagnostics)
2. Events emit correct data shape
3. No runtime errors in browser console

**Rollback Plan**: If issues found during manual testing, revert commits and defer P2 to next sprint.

---

## [P3] Type Cleanup - Mark Endpoint Bus Variant Deprecated

**Status**: Not Started (DEFERRED)
**Effort**: Small (30 minutes)
**Dependencies**: P1, P2 complete and verified
**Spec Reference**: design-docs/spec/ § Type system
**Status Reference**: STATUS-2026-01-02-p1-type-cleanup.md § Risks & Ambiguities § Risk 2

### Description

Mark the `{ kind: 'bus' }` variant in Endpoint union as deprecated to prevent accidental usage, without breaking existing migration code. This is a safety measure, not functional change.

**Deferred Rationale**: Focus Sprint 3 on verification. Type cleanup can happen in Sprint 4 after confidence builds.

### Acceptance Criteria

- [ ] Add JSDoc `@deprecated` comment to Endpoint type in types.ts
- [ ] Document migration path in comment (use PortRef instead)
- [ ] Add comment explaining why variant still exists (migration compatibility)
- [ ] Consider adding ESLint rule to warn on `kind: 'bus'` construction (optional)
- [ ] Update documentation referencing Endpoint type (if any)

### Technical Notes

```typescript
/**
 * Reference to an edge endpoint.
 *
 * @deprecated The `kind: 'bus'` variant is legacy - use `kind: 'port'` for BusBlocks.
 * The bus variant remains for migration compatibility only.
 */
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };  // Migration only
```

**Future Work**: In Sprint 5+, after migration period:
- Remove bus variant entirely
- Replace `Endpoint` with `PortRef` alias
- Update all type imports

---

## Dependency Graph

```
P0 (Fix Compilation)
  ↓
P1-A (Verify Compiler) ←──┐
  ↓                        │
P1-B (Manual Tests) ──────┤
  ↓                        │
P2-A (Investigate Stores)  │
  ↓                        │
P2-B (Remove Store Checks) │ [CONDITIONAL]
  ↓                        │
P3 (Type Cleanup) ←────────┘ [DEFERRED]
```

**Critical Path**: P0 → P1-A → P1-B (4-6 hours to Sprint 3 verification complete)

**Optional Path**: P2-A → P2-B (add 3-5 hours if investigation permits)

---

## Recommended Sprint Execution

### Session 1: Unblock Tests (2-3 hours)

**Goal**: Fix compilation errors and verify P1 work

1. **Fix transform definitions** (1-2 hours)
   - Start with `ConstToSignal.ts` (validate pattern)
   - Apply pattern to `arithmetic.ts`, `ease.ts`, `shaping.ts`
   - Fix lens test imports
   - Run `just typecheck` after each file

2. **Verify compiler changes** (30 minutes)
   - Read compiler pass files (confirm deletions)
   - Run `just test -- compiler`
   - Document any unexpected findings

3. **Manual BusBlock tests** (30 minutes)
   - Follow acceptance criteria checklist
   - Use Chrome DevTools to inspect data structures
   - Verify compilation and runtime work

**Checkpoint**: If P1 verified successfully, Sprint 3 P1 is COMPLETE ✅

---

### Session 2: Store Investigation (2-3 hours) [OPTIONAL]

**Goal**: Determine P2 removal safety

1. **Event emission analysis** (1 hour)
   - Read PatchStore event code
   - Check UI component dependencies

2. **Selection/diagnostic analysis** (1 hour)
   - Read SelectionStore and DiagnosticStore
   - Grep for `kind: 'bus'` construction
   - Test UI interactions manually

3. **Document findings** (30 minutes)
   - Update STATUS file with conclusions
   - Create follow-up tasks if needed
   - Decide: proceed with P2-B or defer

**Checkpoint**: If P2-A confirms safe removal, continue to P2-B. Otherwise, defer P2 to Sprint 4.

---

### Session 3: Store Cleanup (1-2 hours) [CONDITIONAL]

**Goal**: Remove store bus checks (only if P2-A approves)

1. **Remove legacy branches** (1 hour)
   - Update PatchStore event emission
   - Update SelectionStore bus detection
   - Update DiagnosticStore targeting
   - Run tests after each change

2. **Manual verification** (30 minutes)
   - Test BusBlock selection
   - Test diagnostic display
   - Verify no console errors

**Checkpoint**: If manual tests pass, P2 is COMPLETE ✅

---

## Risk Assessment

### High-Risk Items

**None** - P1 work already complete, only verification remains

### Medium-Risk Items

1. **Transform definition fixes may reveal deeper issues**
   - **Mitigation**: Fix files one at a time, run typecheck incrementally
   - **Likelihood**: Low (errors are straightforward missing fields)

2. **Store legacy checks may be actively used by UI**
   - **Mitigation**: Thorough investigation (P2-A) before removal
   - **Likelihood**: Medium (commits suggest partial migration)

### Low-Risk Items

3. **Manual tests may find integration bugs**
   - **Mitigation**: Document and create follow-up tasks
   - **Likelihood**: Low (compiler changes are well-tested)

---

## Success Metrics

### Sprint 3 P1 Completion (PRIMARY GOAL)

- [x] Zero `kind === 'bus'` checks in Pass 1-8 (done in commits)
- [x] Zero `kind === 'bus'` checks in resolveWriters (done in commits)
- [ ] TypeScript compilation succeeds (0 errors)
- [ ] Compiler test suite passes (0 failures)
- [ ] Manual BusBlock workflow verified (end-to-end)
- [ ] P1 STATUS updated with "VERIFIED ✅" status

### Sprint 3 P2 Completion (STRETCH GOAL)

- [ ] Store legacy check investigation documented
- [ ] Decision made: remove/defer/refactor
- [ ] If remove: store tests pass, UI works correctly
- [ ] If defer: follow-up tasks created with rationale

### Code Quality

- [ ] No new TypeScript errors introduced
- [ ] No test regressions (failing tests that previously passed)
- [ ] No runtime errors in browser console during manual tests
- [ ] All commits have clear messages explaining changes

---

## Deferred Work (Out of Scope)

### Not in This Sprint

1. **BusStore deletion** (originally P3)
   - Verify all UI uses PatchStore, not BusStore
   - Remove RootStore.busStore property
   - **Reason for Deferral**: Focus on verification, not refactoring

2. **Full type removal** (Sprint 4+)
   - **Reason for Deferral**: Needs careful migration planning

3. **Endpoint type replacement** (Sprint 4+)
   - Replace Endpoint union with PortRef alias
   - Update all imports and usage sites
   - **Reason for Deferral**: After store cleanup verified stable

---

## Blockers and Questions

### Current Blockers

1. **TypeScript compilation errors** (P0)
   - Status: 🔴 BLOCKING all test verification
   - Owner: Next implementer
   - ETA: 1-2 hours to fix

### Open Questions

1. **Are store `kind === 'bus'` checks reachable?**
   - Investigation: P2-A
   - Decision needed: Remove now vs. defer
   - Risk: Medium (may break UI if not careful)

2. **Should lens tests be updated or deleted?**
   - Current: Import errors for deleted exports
   - Options: Fix imports OR skip/delete test file
   - Decision: Check if lens system is deprecated

3. **What's the migration timeline for old patches?**
   - Affects: How long to keep legacy compatibility code
   - Impact: Determines when we can remove Endpoint bus variant
   - Follow-up: Discuss with stakeholders

---

## Estimated Timeline

| Task | Effort | Dependencies |
|------|--------|--------------|
| P0: Fix compilation | 1-2 hours | None |
| P1-A: Verify compiler | 30 min | P0 |
| P1-B: Manual tests | 30 min | P0, P1-A |
| **Sprint 3 P1 Complete** | **2-3 hours** | - |
| P2-A: Investigate stores | 2-3 hours | P1 |
| P2-B: Remove checks (if safe) | 1-2 hours | P2-A |
| **Sprint 3 P2 Complete** | **3-5 hours** | - |
| **Total Sprint 3** | **5-8 hours** | - |

**Recommended Approach**: Complete P1 first (2-3 hours), then decide if P2 fits in sprint.

---

## Files Generated

- `.agent_planning/bus-block-unification/PLAN-2026-01-02-sprint3-completion.md` (this file)
- `.agent_planning/bus-block-unification/DOD-2026-01-02-sprint3-completion.md` (next)

---

**Planner**: status-planner
**Timestamp**: 2026-01-02-060000
**Source**: STATUS-2026-01-02-p1-type-cleanup.md
**Confidence**: HIGH (verified via git history and code inspection)
