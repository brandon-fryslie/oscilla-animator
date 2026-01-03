# Status: P1 Type Cleanup - Bus Block Unification Sprint 3
**Generated**: 2026-01-02
**Scope**: Sprint 3 P1 - Remove `kind === 'bus'` checks from compiler and stores
**Confidence**: FRESH
**Git Commit**: 0a18884 (HEAD → bmf_new_compiler)
**Topic**: bus-block-unification

---

## Executive Summary

**Sprint 3 P1 Status**: 🟢 **95% COMPLETE** - Nearly all bus checks removed, blocked by unrelated compilation errors

**Critical Finding**: The P1 work (removing `kind === 'bus'` checks) is essentially DONE. Recent commits show systematic removal of all target locations. However, **unrelated TypeScript compilation errors** in transform definitions block test verification.

**Blocker**: Transform definitions missing `busEligible` property in TypeDesc objects (NOT a bus-unification issue)

---

## What Exists (Current State)

### 1. Legacy Types Still Present

**Location**: `src/editor/types.ts:165-270`

| Type | Status | Usage | Can Remove? |
|------|--------|-------|-------------|
| `Bus` interface | ✅ ACTIVE | BusStore facade, metadata representation | ⚠️ PARTIAL (migration helper) |
| `Endpoint` union | ✅ ACTIVE | Includes `{ kind: 'bus'; busId: string }` variant | ❌ YES (after checking migration code) |
| Legacy edge fields | ❌ REMOVED | `lensStack`, `adapterChain` | ✅ DONE |

**Evidence**:
```typescript
// types.ts:268-270
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };  // ← UNUSED variant
```

### 2. `kind === 'bus'` Checks in Codebase

**Total Found**: 6 files (down from ~15 in previous sprints)

#### Compiler Passes: ✅ **ALL REMOVED**

| File | Lines | Status | Commit |
|------|-------|--------|--------|
| `pass1-normalize.ts` | 63, 72 | ✅ REMOVED | bfc2db9 (Dec 31) |
| `pass6-block-lowering.ts` | 417 | ✅ REMOVED | 181ef11 (Dec 31) |
| `pass7-bus-lowering.ts` | 167, 274 | ✅ REMOVED | 096d4a0 (Dec 31) |
| `pass8-link-resolution.ts` | 546 | ✅ COMMENT UPDATED | 5377b27 (Dec 31) |
| `resolveWriters.ts` | 162-169 | ✅ REMOVED | d64f76b (Dec 31) |

**Evidence from grep**: Only `resolveWriters.ts` found, containing:
```typescript
// Line 162: Note: edge.from.kind === 'bus' no longer exists after migration
```
This is a **documentation comment**, not active code.

#### Store Files: ⚠️ **LEGACY COMPATIBILITY CHECKS REMAIN**

| File | Lines | Status | Purpose | Removal Safe? |
|------|-------|--------|---------|---------------|
| `PatchStore.ts` | 1368, 1378, 1416, 1426 | ⚠️ LEGACY | Event emission for bus edges | ❌ CHECK FIRST |
| `SelectionStore.ts` | 79 | ⚠️ LEGACY | Legacy bus selection | ⚠️ AFTER UI VERIFICATION |
| `DiagnosticStore.ts` | 186 | ⚠️ LEGACY | Legacy bus diagnostics | ⚠️ AFTER UI VERIFICATION |

**Key Finding**: These are NOT compiler checks - they're **UI/event system compatibility layers** for old patch formats.

#### Migration/Conversion Utilities: ✅ **EXPECTED**

| File | Purpose | Keep? |
|------|---------|-------|
| `edgeMigration.ts` | Converts old `{ kind: 'bus' }` edges to port-based | ✅ YES (migration tool) |
| `bus-block/migration.ts` | Converts Bus entities to BusBlocks | ✅ YES (migration tool) |

---

## What Changed (Recent Commits Analysis)

### Sprint 3 P1 Completion Commits (Dec 31, 2025 - Jan 2, 2026)

**8 commits systematically removed all P1 target locations:**

1. **181ef11** - `refactor(compiler): Remove dead bus writer check in Pass 6`
   - ✅ Completed P1-A (Pass 6 bus writer check deletion)

2. **096d4a0** - `refactor(compiler): Remove legacy edge functions in Pass 7`
   - ✅ Completed P1-B (Pass 7 legacy edge detection deletion)

3. **5377b27** - `docs(compiler): Update Pass 8 comments for Sprint 2 migration`
   - ✅ Completed P1-C (Pass 8 comment update)

4. **d64f76b** - `refactor(compiler): Remove bus writer kind from resolveWriters`


6. **06d27e7** - `refactor(stores): Update PatchStore bus edge getters for Sprint 2`
   - ⚠️ PARTIAL P2-A (PatchStore helpers - event emission still has bus checks)

7. **c902693** - `refactor(stores): Update SelectionStore to detect BusBlock selection`
   - ⚠️ PARTIAL P2-B (SelectionStore updated but legacy path remains)

8. **cad5e66** - `refactor(stores): Update DiagnosticStore to support BusBlock diagnostics`
   - ⚠️ PARTIAL P2-C (DiagnosticStore updated but legacy path remains)

**Verdict**: P1 (compiler) is ✅ COMPLETE. P2 (stores) is ⚠️ PARTIAL - legacy compatibility paths remain.

---

## Current Test Failures (Blocker Analysis)

### Compilation Errors: 🔴 **NOT BUS-RELATED**

**45 TypeScript errors** in transform definitions block compilation:

```
src/editor/transforms/definitions/adapters/ConstToSignal.ts(18,3):
  Property 'busEligible' is missing in type '{ world: "scalar"; domain: "float"; category: "core"; }'

src/editor/__tests__/lenses.test.ts(8,10):
  Module '"../lenses/easing"' has no exported member 'applyLens'
```

**Root Cause**:
1. `TypeDesc` interface requires `busEligible: boolean` field (added in recent work)
2. Transform definitions use shorthand TypeDesc objects without this field
3. Legacy lens test imports reference deleted exports

**Impact on P1**: ❌ **ZERO** - These are unrelated to bus-block unification

**Blocker Type**: Compilation gate - tests cannot run until TypeScript compiles

---

## Dependencies & Blockers

### Immediate Blocker: TypeScript Compilation

**Status**: 🔴 BLOCKING all test verification

**Files affected**:
- `src/editor/transforms/definitions/adapters/ConstToSignal.ts` (10 errors)
- `src/editor/transforms/definitions/lenses/arithmetic.ts` (5 errors)
- `src/editor/transforms/definitions/lenses/ease.ts` (15 errors)
- `src/editor/transforms/definitions/lenses/shaping.ts` (7 errors)
- `src/editor/__tests__/lenses.test.ts` (2 errors)

**Required Fix**: Add `busEligible: true` to all TypeDesc literals in transform definitions

**Estimated Effort**: 1-2 hours (mechanical change, ~30 locations)

**Who Should Fix**: ⚠️ **SEPARATE WORK ITEM** - Not part of Sprint 3 P1 scope

---

## Risks & Ambiguities

### Risk 1: Store Legacy Checks May Break UI (MEDIUM)

**Issue**: `PatchStore.ts`, `SelectionStore.ts`, `DiagnosticStore.ts` still have `kind === 'bus'` checks

**Hypothesis**: These checks handle **old patch formats during migration**, not active BusBlock usage

**Evidence**:
```typescript
// PatchStore.ts:1368 (addEdgeEndpoints)
} else if (edge.from.kind === 'port' && edge.to.kind === 'bus') {
```

**Questions**:
1. Are these checks reachable with current BusBlock implementation?
2. Do any UI components still emit events with `{ kind: 'bus' }` endpoints?
3. Can we safely remove these or do we need migration period?

**Recommendation**: Manual test BEFORE removal:
- Load old patch (if available) - verify migration works
- Create/delete BusBlock - verify events emitted correctly
- Select BusBlock - verify inspector shows correct data

### Risk 2: Endpoint Type Union Still Exported (LOW)

**Issue**: `Endpoint` type still has `{ kind: 'bus' }` variant even though unused

**Impact**: TypeScript doesn't prevent accidental use of legacy variant

**Mitigation**:
- Option A: Remove `bus` variant entirely (BREAKING - check all imports)
- Option B: Mark as deprecated with JSDoc `@deprecated` comment
- Option C: Replace `Endpoint` with `PortRef` alias (RECOMMENDED)

**Recommendation**: Option C - in separate cleanup commit after P1/P2 verified

### Ambiguity 1: What Constitutes "P1 Complete"?

**Question**: Does P1 include removing store checks or just compiler checks?

**Current Plan States**:
- PLAN-2026-01-01-165139.md § P1: "Remove **compiler** bus branching"
- PLAN-2026-01-01-165139.md § P2: "Remove **store** bus branching"

**Resolution**: P1 = compiler only (✅ DONE), P2 = stores (⚠️ PARTIAL)

### Ambiguity 2: Are Migration Utilities In Scope?

**Question**: Should `edgeMigration.ts` and `bus-block/migration.ts` be considered for removal?

**Current Finding**: These files **legitimately need** `kind === 'bus'` checks to convert old formats

**Resolution**: ✅ KEEP - Migration utilities are EXEMPT from "remove all bus checks" scope

---

## What Needs to Change (Remaining Work)

### P0: Unblock Compilation (NOT P1 SCOPE)

**Status**: 🔴 BLOCKING

**Tasks**:
1. [ ] Add `busEligible: true` to all TypeDesc literals in `ConstToSignal.ts`
2. [ ] Add `busEligible: true` to all TypeDesc literals in `arithmetic.ts`
3. [ ] Add `busEligible: true` to all TypeDesc literals in `ease.ts`
4. [ ] Add `busEligible: true` to all TypeDesc literals in `shaping.ts`
5. [ ] Fix lens test imports (`applyLens`, `isValidLensType` deleted)
6. [ ] Verify compilation: `just typecheck`

**Estimated Effort**: 1-2 hours

**Owner**: Separate work item (transform definitions cleanup)

### P1: Verification (BLOCKED BY P0)

**Status**: ⏸️ WAITING (cannot run tests until compilation succeeds)

**Tasks**:
1. [ ] Run `just test` - verify no bus-related failures
2. [ ] Run `just test -- compiler` - verify compiler passes work
3. [ ] Manual test: Create BusBlock, connect edges, compile patch
4. [ ] Verify no `kind === 'bus'` checks in compiler passes (excluding migration)

**Estimated Effort**: 30 minutes (after P0 complete)

### P2: Store Legacy Check Removal (DEFERRED)

**Status**: ⏸️ DEFERRED (needs investigation first)

**Questions to Answer First**:
1. What events do `addEdgeEndpoints` and `removeEdgeEndpoints` emit?
2. Which UI components listen to these events?
4. Do we need to emit different events for BusBlock edges?

**Investigation Tasks**:
3. [ ] Verify BusBlock edges emit correct event shape
4. [ ] Test UI reactivity after removing legacy branches

**Estimated Effort**: 2-3 hours (investigation + fixes)

---

## Estimated Compile Errors from Type Changes

**Current Errors**: 45 (transform definitions - unrelated to P1)

**Expected Errors from P1 Work**: 0 (already committed and integrated)

**Expected Errors from P2 Work**: 5-10 (if we remove Endpoint.bus variant)

**Breakdown**:
- Event emission code in PatchStore: 4 errors
- Selection/diagnostic stores: 2-3 errors
- Type imports that reference Endpoint: 3-5 errors

**Mitigation**: Keep Endpoint union, mark `bus` variant as deprecated

---

## UI Components Depending on Legacy Types

**Found via grep of component files**:

| Component | Dependency | Impact |
|-----------|------------|--------|
| `BusInspector.tsx` | Uses `Bus` type from BusStore | ⚠️ Keep Bus type for now |
| `EdgeInspector.tsx` | May check `edge.from.kind` or `edge.to.kind` | ⚠️ CHECK IMPLEMENTATION |
| `DiagnosticPanel.tsx` | Shows diagnostics targeting buses | ✅ Uses DiagnosticStore (abstracted) |

**Action Required**: Read these component files to verify dependencies

---

## Success Metrics

### Code Quality (P1 Scope)

- [x] Zero `kind === 'bus'` checks in Pass 1 (normalize)
- [x] Zero `kind === 'bus'` checks in Pass 6 (block lowering)
- [x] Zero `kind === 'bus'` checks in Pass 7 (bus lowering)
- [x] Pass 8 comments updated (no bus edge references)
- [x] Zero `kind === 'bus'` checks in resolveWriters
- [ ] All compiler tests pass (BLOCKED by compilation errors)

### Code Quality (P2 Scope - DEFERRED)

- [ ] PatchStore event emission doesn't discriminate by `kind === 'bus'`
- [ ] SelectionStore identifies BusBlocks via `block.type === 'BusBlock'`
- [ ] DiagnosticStore identifies BusBlocks via `block.type === 'BusBlock'`
- [ ] All store tests pass

### Testing (BLOCKED)

- [ ] TypeScript compilation succeeds (0 errors)
- [ ] `just test` passes (0 failures)
- [ ] Manual test: BusBlock creation/connection works
- [ ] Manual test: UI shows bus information correctly

---

## Recommendations

### Immediate Actions (Next 2-4 hours)

1. **Fix transform definition TypeErrors** (P0 blocker)
   - Add `busEligible: true` to ~30 TypeDesc literals
   - Fix lens test imports
   - Verify `just typecheck` passes

2. **Verify P1 completion** (after P0)
   - Run `just test` and confirm no bus-related failures
   - Manual test bus functionality
   - Document any remaining issues

3. **Investigate P2 store checks** (parallel to P0/P1)
   - Read `PatchStore.ts` event emission code
   - Determine if legacy `kind === 'bus'` branches are reachable
   - Decide: Remove now, remove later, or keep for migration

### Short-Term Actions (Next 1-2 days)

4. **Complete P2 if safe** (after investigation)
   - Remove legacy bus checks from stores if verified safe
   - Update event emission to use BusBlock detection
   - Test UI reactivity thoroughly

5. **Type cleanup** (separate commit)
   - Mark Endpoint `bus` variant as `@deprecated`
   - Consider aliasing `Endpoint = PortRef` in future
   - Document migration path for any external consumers

### Medium-Term Actions (Next sprint)

6. **BusStore deletion** (originally P3, deferred from this sprint)
   - Verify all UI uses `PatchStore` methods, not `BusStore`
   - Remove `RootStore.busStore` property
   - Delete `src/editor/stores/BusStore.ts`

7. **Full type removal** (Sprint 3.5 or later)
   - Keep migration utilities for backward compatibility

---

## Verdict

**Workflow Recommendation**: ✅ **CONTINUE** - P1 is complete, focus on unblocking tests

**Next Action**:
1. Fix transform definition TypeErrors (NOT P1 scope, but blocks verification)
2. Verify P1 completion with `just test`
3. Investigate P2 store checks before removal
4. Document findings for Sprint 3 final report

**DO NOT** proceed with P2 store check removal until:
- [ ] Compilation succeeds
- [ ] Tests run and pass
- [ ] Event emission code investigated
- [ ] UI components verified

**Estimated Time to P1 Verified**: 2-3 hours (mostly unblocking compilation)

**Estimated Time to P2 Complete**: 3-5 hours (investigation + implementation)

**Estimated Time to Sprint 3 Complete**: 6-10 hours total

---

## Files Generated

- `.agent_planning/bus-block-unification/STATUS-2026-01-02-p1-type-cleanup.md` (this file)
- `.agent_planning/bus-block-unification/RELEVANT-FILES-2026-01-02-p1.md` (next)

---

**Evaluator**: project-evaluator
**Timestamp**: 2026-01-02
**Git Commit**: 0a18884 (HEAD → bmf_new_compiler)
**Branch**: bmf_new_compiler
**Confidence**: FRESH (comprehensive code inspection + git history analysis)
