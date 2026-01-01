# Sprint 3 Plan: Compiler Code Path Unification & Cleanup
**Generated**: 2026-01-01-082134
**Source**: STATUS-2026-01-01-sprint34.md
**Topic**: bus-block-unification
**Sprint**: 3 of 4
**Depends on**: Sprint 2 complete ✅

---

## Executive Summary

**Sprint Goal**: Remove ALL `kind === 'bus'` checks from compiler and stores, unify edge processing so everything flows through port-to-port paths.

**Current State**: Sprint 2 completed - compiler uses BusBlocks in Pass 7/8, but legacy bus checks remain scattered across 8 files.

**Critical Blocker**: 43 failing tests must be fixed FIRST before any Sprint 3 work begins.

**Scope Changes from Original Sprint 3**:
- **Original**: Full type cleanup (remove Endpoint union, Bus types, BusStore deletion)
- **This Sprint**: Focus on **compiler code path unification only** - remove bus branching logic
- **Deferred to Future**: Full type cleanup (Endpoint union, BusStore deletion) - too risky without passing tests

---

## Scope

### In Scope (This Sprint)
1. **P0**: Fix 43 failing tests (prerequisite - gate for all other work)
2. **P1**: Remove compiler bus branching (5 files with `kind === 'bus'` checks)
3. **P2**: Remove store bus branching (publisherEdges/listenerEdges computed helpers)

### Explicitly Out of Scope
- Endpoint type union removal (leave discriminated union for now)
- Bus/Publisher/Listener type removal (mark as deprecated only)
- BusStore deletion (keep facade for now)
- UI component adaptation (works through existing facade)
- Full type system cleanup (too risky without green tests)

**Rationale for Scope Reduction**: The STATUS report shows 43 failing tests across 11 test files. These are transaction/ops validation tests that appear to have setup issues. Attempting major type refactoring while tests are red is extremely risky. This sprint focuses on removing functional bus branching logic while keeping types intact for safety.

---

## Work Items

### P0: Fix Failing Tests (PREREQUISITE)

**Status**: Blocking
**Effort**: Small (2-4 hours)
**Dependencies**: None
**Spec Reference**: N/A • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Risk 4: Test Failures"

#### Description
43 tests failing across 11 test files, primarily in transaction and ops validation areas. These appear to be test setup issues (default buses being created unexpectedly) rather than bus-unification bugs. Must achieve green test suite before any Sprint 3 refactoring work begins.

#### Acceptance Criteria
- [ ] All tests in TxBuilder.test.ts pass (transaction validation tests)
- [ ] All tests in ops.test.ts pass (op validation assertion messages fixed)
- [ ] removeBlockCascade test passes (block count mismatch resolved: expects 2, gets 9)
- [ ] Zero failing tests: `just test` exits with code 0
- [ ] Root cause identified: document why default buses were being created
- [ ] Commit message references this sprint plan

#### Technical Notes
**Failing Test Breakdown** (from STATUS):
```
TxBuilder.test.ts: Transaction validation tests (expected errors)
ops.test.ts: Op validation tests (assertion message mismatches)
removeBlockCascade: Block count mismatch (9 vs 2 expected)
```

**Hypothesis**: Default buses may be created by block initialization code, inflating block counts. Check:
- Block creation factories
- Patch initialization logic
- Test fixture setup

**Investigation Steps**:
1. Run `just test` to see full failure output
2. Check if BusBlock creation is happening implicitly
3. Update test expectations or fix setup code
4. Verify no regression in bus-related tests

**Gate**: This item MUST be completed and committed before starting any P1/P2 work.

---

### P1-A: Remove Compiler Bus Branching - Pass 6

**Status**: Not Started
**Effort**: Small (1 hour)
**Dependencies**: P0 complete
**Spec Reference**: CLAUDE.md § "No bus entity paths" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Compiler: `kind === 'bus'` Checks"

#### Description
Remove the bus writer check in Pass 6 (block lowering) that returns `null` for bus writers. After Sprint 2, buses are BusBlocks with ports, so all writers should follow the standard port-based path.

#### Acceptance Criteria
- [ ] `pass6-block-lowering.ts:417` bus check removed
- [ ] Writer resolution handles BusBlock ports uniformly (no special case)
- [ ] Bus-connected blocks still resolve correctly (verify with test)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (regression check)
- [ ] Commit references Sprint 3 P1-A

#### Technical Notes
**Current Code** (pass6-block-lowering.ts:417):
```typescript
if (writer.kind === 'bus') {
  // Bus: Will be resolved in Pass 7 (bus lowering)
  return null;
}
```

**After Removal**: Delete this entire conditional. BusBlock outputs are regular ports after Sprint 2, so writer resolution should handle them like any other port.

**Risk**: If edges aren't fully migrated to BusBlock ports, writer resolution might fail. Mitigation: P0 ensures tests pass first, catching any edge migration issues.

---

### P1-B: Remove Compiler Bus Branching - Pass 7

**Status**: Not Started
**Effort**: Small (1 hour)
**Dependencies**: P0 complete
**Spec Reference**: CLAUDE.md § "Unified edge processing" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Compiler: `kind === 'bus'` Checks"

#### Description
Remove the legacy edge format detection in Pass 7 (bus lowering). The `getPublishersFromLegacyEdges()` function and `hasLegacyEdges` check are backward compatibility code that can be deleted now that all edges use BusBlock ports.

#### Acceptance Criteria
- [ ] `getPublishersFromLegacyEdges()` function deleted (pass7-bus-lowering.ts:167)
- [ ] `hasLegacyEdges` check deleted (pass7-bus-lowering.ts:274)
- [ ] All publisher lookups use `getEdgesToBusBlock()` (port→BusBlock.in edges)
- [ ] Comment updated explaining only BusBlock edges are supported
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (verify bus combining still works)
- [ ] Commit references Sprint 3 P1-B

#### Technical Notes
**Current Code** (pass7-bus-lowering.ts):
```typescript
// Line 167: getPublishersFromLegacyEdges() - DEPRECATED function
function getPublishersFromLegacyEdges(patch: Patch, busId: string): Edge[] {
  return patch.edges.filter(e => e.to.kind === "bus" && e.to.busId === busId);
}

// Line 274: hasLegacyEdges check
const hasLegacyEdges = edges.some(e => e.to.kind === 'bus' && e.to.busId === busBlock.id);
```

**After Removal**: Delete both. Pass 7 already has `getEdgesToBusBlock()` which uses port→port edges. Legacy path is dead code after Sprint 2 migration.

**Verification**: Run bus-related tests to ensure combine modes (latest, merge, array) still work correctly.

---

### P1-C: Remove Compiler Bus Branching - Pass 8 Comment

**Status**: Not Started
**Effort**: Trivial (15 minutes)
**Dependencies**: P0 complete
**Spec Reference**: N/A • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Compiler: `kind === 'bus'` Checks"

#### Description
Update documentation comment in Pass 8 to reflect that only port-to-port edges exist (no legacy bus edges).

#### Acceptance Criteria
- [ ] Comment at pass8-link-resolution.ts:546 updated
- [ ] Comment explains all edges are port→port (migration complete)
- [ ] No code changes (documentation only)
- [ ] Commit references Sprint 3 P1-C

#### Technical Notes
**Current Comment** (pass8-link-resolution.ts:546):
```typescript
* have been migrated by migrateEdgesToPortOnly(). Bus edges (edge.from.kind === 'bus')
```

**Updated Comment**:
```typescript
* have been migrated to port-only format (edge.from/to are always PortRef).
* All bus connections use BusBlock ports (busBlock.in / busBlock.out).
```

---

### P1-D: Remove Compiler Bus Branching - resolveWriters

**Status**: Not Started
**Effort**: Small (1 hour)
**Dependencies**: P0 complete
**Spec Reference**: CLAUDE.md § "Unified edge processing" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Compiler: `kind === 'bus'` Checks"

#### Description
Remove the bus listener writer classification in `resolveWriters.ts`. After Sprint 2, bus listeners are edges from `BusBlock.out` to target ports, so they're classified as regular 'wire' writers, not a special 'bus' kind.

#### Acceptance Criteria
- [ ] Bus listener classification removed (resolveWriters.ts:162-169)
- [ ] All writers are classified as 'wire' or 'default' only (no 'bus' kind)
- [ ] BusBlock outputs treated like regular block outputs
- [ ] Writer type union updated to remove 'bus' kind (if safe)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (verify listeners still work)
- [ ] Commit references Sprint 3 P1-D

#### Technical Notes
**Current Code** (resolveWriters.ts:162-169):
```typescript
} else if (edge.from.kind === 'bus') {
  // Bus listener: bus → port
  writers.push({
    kind: 'bus',
    listenerId: edge.id,
    busId: edge.from.busId,
  });
}
```

**After Removal**: Delete this branch. Edges from `BusBlock.out` are already handled by the 'wire' case (port→port edges).

**Type Update Consideration**: If Writer type has a `{ kind: 'bus'; ... }` variant, consider marking it deprecated or removing if safe. Check all Writer consumers first.

---

### P1-E: Remove Compiler Bus Branching - Pass 1

**Status**: Not Started
**Effort**: Small (30 minutes)
**Dependencies**: P0 complete
**Spec Reference**: CLAUDE.md § "Deterministic compilation" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Compiler: `kind === 'bus'` Checks"

#### Description
Remove publisher edge detection in Pass 1 (normalize) that sorts publisher edges by sortKey for deterministic bus combines. After Sprint 2, publisher edges are regular port→port edges to `BusBlock.in`, so they're sorted with all other edges.

#### Acceptance Criteria
- [ ] Publisher edge filter removed (pass1-normalize.ts:63)
- [ ] Non-publisher filter removed (pass1-normalize.ts:72)
- [ ] All edges sorted uniformly by sortKey (no special bus handling)
- [ ] Deterministic bus combine order preserved (verify with test)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass (especially bus combine tests)
- [ ] Commit references Sprint 3 P1-E

#### Technical Notes
**Current Code** (pass1-normalize.ts:63, 72):
```typescript
// Line 63: Filter publisher edges
.filter(e => e.from.kind === 'port' && e.to.kind === 'bus')

// Line 72: Filter non-publishers
const nonPublishers = enabled.filter(e => !(e.from.kind === 'port' && e.to.kind === 'bus'));
```

**After Removal**: Delete both filters. All edges are port→port now, so sorting logic applies uniformly.

**Verification**: Critical to verify that bus combine order is still deterministic. Check that edges to `BusBlock.in` are sorted correctly by sortKey.

**STATUS Note**: Marked as "BACKWARD COMPATIBILITY - can remain during migration". Since migration is complete (Sprint 2), safe to remove now.

---

### P2-A: Remove Store Bus Branching - PatchStore Helpers

**Status**: Not Started
**Effort**: Small (1 hour)
**Dependencies**: P1-A through P1-E complete
**Spec Reference**: CLAUDE.md § "Unified architecture" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Stores: `kind === 'bus'` Checks"

#### Description
Remove or update `publisherEdges` and `listenerEdges` computed helpers in PatchStore. After Sprint 2, these are edges to/from BusBlock ports, not special bus edges.

#### Acceptance Criteria
- [ ] `publisherEdges` getter updated to query edges to `*.in` on BusBlocks OR removed entirely
- [ ] `listenerEdges` getter updated to query edges from `*.out` on BusBlocks OR removed entirely
- [ ] Edge update helpers (addEdgeEndpoints, removeEdgeEndpoints) updated to remove bus checks
- [ ] UI components using these getters still work (if kept) or updated (if removed)
- [ ] MobX reactivity preserved
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] Commit references Sprint 3 P2-A

#### Technical Notes
**Current Code** (PatchStore.ts):
```typescript
// Lines 155-156: publisherEdges getter
get publisherEdges(): Edge[] {
  return this.edges.filter(e => e.from.kind === 'port' && e.to.kind === 'bus');
}

// Lines 163-165: listenerEdges getter
get listenerEdges(): Edge[] {
  return this.edges.filter(e => e.from.kind === 'bus' && e.to.kind === 'port');
}

// Lines 1338-1358: Edge update helpers (addEdgeEndpoints, removeEdgeEndpoints)
```

**Option 1: Update Getters** (safer):
```typescript
get publisherEdges(): Edge[] {
  const busBlockIds = new Set(this.busBlocks.map(b => b.id));
  return this.edges.filter(e =>
    busBlockIds.has(e.to.blockId) && e.to.slotId === 'in'
  );
}

get listenerEdges(): Edge[] {
  const busBlockIds = new Set(this.busBlocks.map(b => b.id));
  return this.edges.filter(e =>
    busBlockIds.has(e.from.blockId) && e.from.slotId === 'out'
  );
}
```

**Option 2: Remove Getters** (cleaner, requires UI updates):
- Check all UI components using `publisherEdges` / `listenerEdges`
- Update to query `busBlocks` and edges directly
- Remove getters entirely

**Recommendation**: Start with Option 1 (safer). Option 2 can be done in future cleanup.

---

### P2-B: Remove Store Bus Branching - SelectionStore

**Status**: Not Started
**Effort**: Small (30 minutes)
**Dependencies**: P2-A complete
**Spec Reference**: CLAUDE.md § "BusBlocks are blocks" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Stores: `kind === 'bus'` Checks"

#### Description
Update SelectionStore to recognize BusBlock selections instead of special 'bus' kind selections.

#### Acceptance Criteria
- [ ] `selection.kind === 'bus'` check removed (SelectionStore.ts:71)
- [ ] BusBlock selections identified by `selection.kind === 'block' && block.type === 'BusBlock'`
- [ ] Selected bus ID retrieved from `block.params.busId` (not `selection.id`)
- [ ] TypeScript compilation succeeds
- [ ] Selection tests pass
- [ ] UI correctly shows BusBlock as selected
- [ ] Commit references Sprint 3 P2-B

#### Technical Notes
**Current Code** (SelectionStore.ts:71):
```typescript
return this.selection.kind === 'bus' ? this.selection.id : null;
```

**After Update**:
```typescript
if (this.selection.kind === 'block') {
  const block = patchStore.getBlockById(this.selection.id);
  if (block?.type === 'BusBlock') {
    return block.params.busId as string;
  }
}
return null;
```

**Consideration**: Selection type might still have a 'bus' variant. If so, mark deprecated but keep for backward compatibility. Can remove in future type cleanup sprint.

---

### P2-C: Remove Store Bus Branching - DiagnosticStore

**Status**: Not Started
**Effort**: Small (30 minutes)
**Dependencies**: P2-A complete
**Spec Reference**: CLAUDE.md § "BusBlocks are blocks" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Stores: `kind === 'bus'` Checks"

#### Description
Update DiagnosticStore to match BusBlock diagnostics by block.id or params.busId instead of special bus target kind.

#### Acceptance Criteria
- [ ] `target.kind === 'bus'` check removed or updated (DiagnosticStore.ts:177)
- [ ] Diagnostics targeting BusBlocks match by block.id
- [ ] Bus-related diagnostics still display correctly
- [ ] TypeScript compilation succeeds
- [ ] Diagnostic tests pass
- [ ] Commit references Sprint 3 P2-C

#### Technical Notes
**Current Code** (DiagnosticStore.ts:177):
```typescript
if (target.kind === 'bus') return target.busId === busId;
```

**After Update**:
```typescript
if (target.kind === 'block') {
  const block = patchStore.getBlockById(target.blockId);
  if (block?.type === 'BusBlock') {
    return block.params.busId === busId;
  }
}
```

**Consideration**: DiagnosticTarget type might still have 'bus' variant. Same as SelectionStore - mark deprecated, remove in future cleanup.

---

## Migration Utilities: Keep for Safety

**File**: `src/editor/edgeMigration.ts`

**Action**: NO CHANGES

**Rationale**: Keep migration utilities (`validateEdge`, `isMigrated`) for safety during transition. These provide backward compatibility checks and prevent regressions. Can be removed in future sprint after full type cleanup.

---

## Dependencies & Execution Order

```
Sprint 2 (complete) ✅
         ↓
P0: Fix Tests (GATE) ← MUST complete before ANY other work
         ↓
         ├─→ P1-A: Pass 6 bus check removal
         ├─→ P1-B: Pass 7 legacy edges removal
         ├─→ P1-C: Pass 8 comment update
         ├─→ P1-D: resolveWriters bus kind removal
         └─→ P1-E: Pass 1 publisher sorting removal
                  ↓
         ├─→ P2-A: PatchStore helpers update
         ├─→ P2-B: SelectionStore update
         └─→ P2-C: DiagnosticStore update
```

**Critical Path**: P0 → (P1-A | P1-B | P1-D | P1-E) → P2-A → (P2-B | P2-C)

**Parallelization**: P1 items can be done in parallel after P0. P2 items can be done in parallel after P1 completes.

---

## Risks & Mitigation

### Risk 1: Test Failures Block Sprint (HIGH - CURRENT)
**Description**: 43 failing tests prevent starting any refactoring work
**Impact**: Sprint cannot proceed until P0 completes
**Mitigation**:
- P0 is required gate for all other work
- Timebox P0 to 4 hours; if not resolved, escalate
- Document findings even if not fully resolved
- Consider skipping problematic tests temporarily (mark with .skip) to unblock Sprint 3

---

### Risk 2: Writer Resolution Breaks (MEDIUM)
**Description**: Removing bus writer checks might break block input resolution
**Impact**: Blocks connected to buses don't compile
**Mitigation**:
- P0 ensures tests pass first (bus tests should catch this)
- P1-A and P1-D are small, isolated changes
- Verify with bus-connected blocks in dev server
- Run compiler tests after each P1 item

---

### Risk 3: Bus Combine Order Non-Determinism (MEDIUM)
**Description**: Removing publisher sorting might change combine results
**Impact**: Bus output values differ from before
**Mitigation**:
- P1-E specifically verifies deterministic ordering preserved
- Bus combine tests should catch any regression
- Check that sortKey is still used for edge ordering
- Compare golden patch outputs before/after

---

### Risk 4: UI Reactivity Breaks (LOW)
**Description**: Updating PatchStore helpers might break MobX reactivity
**Impact**: UI doesn't update when bus connections change
**Mitigation**:
- P2-A keeps computed getters (just updates implementation)
- Test in dev server with React DevTools
- Verify bus board updates when edges change
- MobX @computed annotation preserves reactivity

---

## Success Metrics

- [ ] All tests passing (0 failures)
- [ ] Zero `kind === 'bus'` checks in compiler passes (Pass 1, 6, 7, 8, resolveWriters)
- [ ] PatchStore bus helpers use BusBlock ports (not Endpoint.kind)
- [ ] Selection and diagnostics work with BusBlocks
- [ ] ~200-300 lines of bus branching code removed
- [ ] TypeScript compilation succeeds (0 errors)
- [ ] Manual verification: bus operations work in dev server

---

## Code Reduction Estimate

### Deletions:
- Pass 1 publisher sorting: ~15 lines
- Pass 6 bus writer check: ~5 lines
- Pass 7 legacy edge functions: ~40 lines
- resolveWriters bus kind: ~10 lines
- PatchStore bus checks: ~30 lines (if removed, less if updated)
- SelectionStore bus check: ~5 lines
- DiagnosticStore bus check: ~5 lines

**Total**: ~110-140 lines deleted (conservative, not including full type cleanup)

### Note on Scope Reduction
Original Sprint 3 planned to delete ~850 lines (including BusStore, type cleanup). This sprint is more conservative, focusing only on removing functional bus branching logic while keeping types intact. Full type cleanup deferred to future sprint when test suite is stable.

---

## Deferred to Future Sprints

These items from original Sprint 3 plan are **explicitly deferred**:

1. **Endpoint type union removal** - Too risky with failing tests
2. **Bus/Publisher/Listener type removal** - Requires extensive refactoring
3. **BusStore deletion** - Requires UI updates and type changes
4. **Patch.buses/publishers/listeners array removal** - Type system change
5. **Full UI component adaptation** - Works through existing facade

**Rationale**: The current test failures indicate instability in the test suite. Attempting major type refactoring while tests are red creates high risk of regression and difficulty debugging. This sprint focuses on removing functional code paths (bus branching logic) which can be done safely with targeted changes and verified by existing tests.

**Next Sprint Recommendation**: After Sprint 3 completes and tests are stable, consider a "Sprint 3.5: Type System Cleanup" that tackles the deferred items above.

---

## Manual Testing Checklist

After all items complete, verify in dev server (`just dev`):

- [ ] Create new bus - works correctly
- [ ] Connect publisher to bus - edge created to BusBlock.in
- [ ] Connect listener from bus - edge created from BusBlock.out
- [ ] Bus combine modes work (latest, merge, array)
- [ ] Bus inspector shows correct info
- [ ] Bus board displays BusBlocks
- [ ] Delete bus - BusBlock removed
- [ ] Compile patch with buses - no errors
- [ ] Scrub timeline - bus values update correctly

---

## Final State After Sprint 3

**Compiler**: No bus-specific code paths. All edges treated uniformly as port→port.

**Stores**: Bus helpers use BusBlock ports instead of Endpoint.kind discrimination.

**Types**: UNCHANGED - Endpoint union, Bus types remain for now (marked deprecated).

**UI**: Works through existing facade, no changes needed.

**Architecture Simplification**: Functional unification complete, structural unification deferred.

---

**Files Generated**: PLAN-2026-01-01-sprint3-completion.md, DOD-2026-01-01-sprint3-completion.md
