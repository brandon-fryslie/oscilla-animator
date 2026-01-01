# Evaluation: Phase 0.5 Compatibility Layer Cleanup - Remaining Work

**Timestamp**: 2026-01-01-060000
**Confidence**: FRESH
**Git Commit**: 4df9c1f
**Scope**: phase0.5-compat-cleanup/remaining-work

---

## Executive Summary

Phase 0.5 Compatibility Cleanup is **~35% complete** with significant work remaining across 5 main sprints and 2 parallel tracks. The codebase currently has TypeScript compilation errors preventing test execution, indicating **active work in progress but incomplete state**.

**Critical Finding**: The system is **NOT in a working state** - TypeScript compilation fails with 52 errors across semantic validators, transforms, and test files. This indicates Track B (Registry Cleanup) is partially complete but broken.

**Workflow Recommendation**: **PAUSE** - Fix TypeScript compilation errors before proceeding with further cleanup.

---

## Previous Evaluation Reuse

| Finding | Previous Status | Current Status | Action |
|---------|----------------|----------------|--------|
| Track A: Transform Storage (80% complete) | RISKY (6 days old) | SPOT-CHECKED | Verified - still at 80% |
| Track B: Registry Cleanup (100% complete) | STALE (6 days old) | RE-EVALUATED | **BROKEN** - missing migration files |
| Sprint 1: Edges Migration | FRESH | VERIFIED | migratePatchToEdges() exists |
| Compiler dual-path execution | FRESH | VERIFIED | Still present in passes 1, 7, 8 |

---

## Runtime Check Results

| Check | Status | Output Summary |
|-------|--------|----------------|
| `just typecheck` | **FAIL** | 52 TypeScript errors |
| `just test` | **BLOCKED** | Cannot run due to TS errors |
| `just dev` | **UNKNOWN** | Not tested |

**TypeScript Errors Summary**:
- **19 errors** in `semantic/__tests__/` - Bus.combineMode property missing
- **4 errors** in `semantic/validator.ts` - Bus.combineMode property access
- **2 errors** in `stores/BusStore.ts` - Unused CombinePolicy import
- **6 errors** in `transactions/__tests__/` - Bus type mismatches
- **13 errors** in `transforms/__tests__/migrate.test.ts` - LensParamBinding.type property missing
- **2 errors** in `transforms/index.ts` - **Missing migration files**: `./migrateLenses`, `./migrateAdapters`

**ROOT CAUSE**: Track B registry cleanup deleted migration files but `transforms/index.ts` still tries to import them (lines 18-19).

---

## Findings by Sprint/Track

### [BROKEN] Track B: Registry Cleanup

**Previous Status** (from PROGRESS-Track-A.md): Claimed 100% complete
**Actual Status**: **BROKEN** - Missing migration files break TypeScript compilation

**Evidence**:
```typescript
// src/editor/transforms/index.ts:18-19
import './migrateLenses';   // ← Module not found
import './migrateAdapters'; // ← Module not found
```

**Expected Files** (from previous work):
- `src/editor/transforms/migrateLenses.ts` - **MISSING**
- `src/editor/transforms/migrateAdapters.ts` - **MISSING**

**Actual Files in transforms/**:
```
__tests__/
apply.ts
catalog.ts
index.ts
migrate.ts       ← NEW (Track A transform migration, different purpose)
normalize.ts
TransformRegistry.ts
types.ts
validate.ts
```

**Issue**: Track B cleanup likely deleted the migration files but didn't update the imports in `index.ts`.

**Fix Required**:
1. Remove imports from `transforms/index.ts` lines 18-19
2. Verify TransformRegistry is properly initialized without these auto-migrations
3. Manually register lenses/adapters if needed

---

### [RISKY] Track A: Transform Storage Unification (80% Complete)

**Deliverable A.4** is marked "Partially Complete" but needs verification:

**Pass 8 Still Uses Separate Fields**:
```typescript
// src/editor/compiler/passes/pass8-link-resolution.ts:578-598
// TODO Phase 0.5: Use getEdgeTransforms(edge) instead of separate lensStack/adapterChain
if (edge.adapterChain !== undefined && edge.adapterChain.length > 0) {
  ref = applyAdapterChain(ref, edge.adapterChain, builder, errors, ...);
}
if (edge.lensStack !== undefined && edge.lensStack.length > 0) {
  ref = applyLensStack(ref, edge.lensStack, builder, errors, ...);
}
```

**Evidence**: 5 occurrences of `applyAdapterChain` and 5 of `applyLensStack` in pass8-link-resolution.ts

**Deliverable A.5** is deferred (correctly) - cannot remove legacy fields until A.4 is 100% complete.

**Remaining Work for Track A**:
1. Create unified `applyTransforms(ref, transforms, builder, errors)` function
2. Update Pass 8 to use `getEdgeTransforms(edge)` and `applyTransforms()`
3. Remove separate `applyAdapterChain` and `applyLensStack` functions
4. **Then** proceed to A.5: Remove lensStack/adapterChain fields from Edge

---

### [FRESH] Sprint 1: Make Edges Authoritative

**Deliverable 1.1**: `migratePatchToEdges()` - **COMPLETE**
- ✅ Function exists in `src/editor/kernel/migration.ts`
- ✅ Detects empty edges, converts legacy arrays
- ✅ Has comprehensive tests in `kernel/__tests__/migration.test.ts`

**Deliverable 1.2**: Edges required in Patch - **NOT STARTED**
- ❌ Patch.edges is still `edges?: Edge[]` (optional)
- ❌ Should be `edges: Edge[]` (required)
- **Location**: `src/editor/types.ts:892`

**Deliverable 1.3**: PatchStore populates edges - **PARTIALLY COMPLETE**
- ✅ PatchStore has `edges: Edge[] = []` observable
- ⚠️ Still has `connections: Connection[] = []` observable (line 56)
- ❓ Unknown if dual-write is implemented (addConnection also calls addEdge)
- **Needs verification**: Check if mutation methods maintain both arrays

**Deliverable 1.4**: Transaction ops for edges - **NOT VERIFIED**
- Location: `src/editor/kernel/ops.ts`
- Need to check if Edge type is handled

**Deliverable 1.5**: Validation tests - **NOT STARTED**
- No test exists for edges-only compilation
- No test for migration conversion correctness
- No test for dual-write consistency

**Sprint 1 Overall**: ~30% complete (1/5 deliverables done, 1 partial)

---

### [FRESH] Sprint 2: Compiler Edges-Only Execution

**Pass 1: Dual-Path Execution Remains**

Lines 99-122 in `pass1-normalize.ts`:
```typescript
// For backward compatibility, we support both formats during migration
if (patch.edges !== undefined && patch.edges !== null && patch.edges.length > 0) {
  // New format: patch has unified edges array
  edges = canonicalizeEdges(patch.edges);

  // Also convert to legacy format for passes that haven't migrated yet
  const converted = convertFromEdges(patch.edges);
  connections = converted.connections;
  publishers = converted.publishers;
  listeners = converted.listeners;
} else {
  // Legacy format
  connections = patch.connections ?? [];
  publishers = patch.publishers ?? [];
  listeners = patch.listeners ?? [];
  edges = undefined;
}
```

**Issue**: Pass 1 still converts edges → legacy arrays "for passes that haven't migrated yet"

Lines 140-156: Dual connectivity checks remain

**Pass 2: Uses Edges with Fallback**

Comment at line 13 says "Updated to use unified edges when available, with fallback to legacy arrays."

Line 460 marked as "Legacy wire format (backward compatibility)"

**Pass 7: Dual Publisher Retrieval**

Lines 164-177:
```typescript
if (edges !== undefined && edges.length > 0) {
  busPublishers = getPublishersFromEdges(bus.id, edges);
} else {
  busPublishers = getSortedPublishers(bus.id, publishers as Publisher[], false);
}
```

**Pass 8: TODO Comments Indicate Incomplete Migration**

Line 578: `// TODO Phase 0.5: Use getEdgeTransforms(edge) instead of separate lensStack/adapterChain`

**NormalizedPatch Still Has Legacy Arrays**

`src/editor/compiler/ir/patches.ts:92-110`:
```typescript
export interface NormalizedPatch<...> {
  readonly edges?: readonly Edge[];  // New (optional)

  /** @deprecated Use edges instead */
  readonly wires: readonly TConnection[];

  /** @deprecated Use edges instead */
  readonly publishers: readonly TPublisher[];

  /** @deprecated Use edges instead */
  readonly listeners: readonly TListener[];
}
```

**Sprint 2 Overall**: 0% complete (all dual-path execution remains)

---

### [NOT STARTED] Sprint 3: Remove Migration Helpers

**File Status**: `src/editor/edgeMigration.ts` - **STILL EXISTS** (315 lines)

**Current Usage**:
- `pass1-normalize.ts:40` imports `convertFromEdges`
- `pass1-normalize.ts:112` calls `convertFromEdges(patch.edges)`
- `kernel/migration.ts:14` imports `convertToEdges`

**Blocker**: Sprint 2 must be complete first (compiler using edges-only)

**Sprint 3 Overall**: 0% complete

---

### [NOT STARTED] Sprint 4: Clean Type Definitions

**Deprecated Types Still Defined**:

```typescript
// src/editor/types.ts

// Lines 343-364: Publisher interface
export interface Publisher { ... }

// Lines 375-393: Listener interface
export interface Listener { ... }

// Lines 785-803: Connection interface
export interface Connection { ... }
```

**Usage Count** (from STATUS-2026-01-01.md):
- Connection: 44 files
- Publisher: 46 files
- Listener: 44 files

**Patch Interface Still Has Legacy Arrays**:

```typescript
// src/editor/types.ts:880-910
export interface Patch {
  edges?: Edge[];         // Optional
  connections: Connection[];  // Required
  publishers: Publisher[];    // Required
  listeners: Listener[];      // Required
}
```

**Sprint 4 Overall**: 0% complete

---

### [NOT STARTED] Sprint 5: Remove PatchStore Legacy Arrays

**PatchStore Still Has**:
- `connections: Connection[] = []` observable (line 56)
- Likely dual mutation methods (not verified in this evaluation)

**Sprint 5 Overall**: 0% complete

---

## Data Flow Verification

| Flow | Input | Process | Store | Retrieve | Display |
|------|-------|---------|-------|----------|---------|
| Edge creation | ❓ | ❓ | ⚠️ Dual arrays | ❓ | ❓ |
| Pass 1 normalize | ✅ Edges | ⚠️ Dual-path | ❌ Both formats | ✅ | N/A |
| Pass 7 bus lowering | ✅ Edges | ⚠️ Dual-path | N/A | ✅ | N/A |
| Transform application | ✅ Edge | ❌ Old fields | N/A | ❌ Separate stacks | N/A |

**Key Issues**:
1. Transform application (Pass 8) still reads separate lensStack/adapterChain
2. Pass 1 maintains both edge and legacy array formats
3. Pass 7 has dual publisher retrieval paths

---

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| Track B completion | Were migration files intentionally deleted? | Assumed they were no longer needed | **BROKEN BUILD** |
| Bus.combineMode | Why do tests fail on missing combineMode? | Unknown - possible type definition changed | Tests failing |
| LensParamBinding.type | Why do transform tests fail on missing type field? | Unknown - possible type definition changed | Tests failing |
| Transform migration order | Should Track A finish before Track B? | Unclear dependencies | Concurrent breakage |

---

## Critical Blockers

### BLOCKER 1: TypeScript Compilation Errors (52 errors)

**Impact**: Cannot run tests, cannot verify any work

**Root Causes**:
1. Missing migration files in `transforms/` (Track B incomplete)
2. Bus type definition changes (combineMode → combine?)
3. LensParamBinding type changes

**Fix Priority**: **IMMEDIATE** - Must fix before any other work

**Estimated Effort**: 2-4 hours

---

### BLOCKER 2: Track A and Track B Interdependency

**Issue**: Track B (registry cleanup) appears to have broken Track A (transform migration)

**Evidence**:
- Track A creates `transforms/migrate.ts` for edge transform migration
- Track B deleted `transforms/migrateLenses.ts` and `transforms/migrateAdapters.ts`
- These are **different migration files with different purposes**
- But both touch the `transforms/` directory, creating confusion

**Recommendation**: Clarify separation:
- Track A: Edge transform storage migration (lensStack/adapterChain → transforms)
- Track B: Registry migration (LensRegistry/AdapterRegistry → TRANSFORM_REGISTRY)

---

## Recommendations

### IMMEDIATE (Fix Breakage)

**1. Fix TypeScript Compilation** (2-4 hours)
- Remove imports from `transforms/index.ts:18-19`
- Fix Bus type usage (combineMode vs combine)
- Fix LensParamBinding test types
- Verify all tests pass after fixes

**2. Audit Track B Completion Claims** (1-2 hours)
- PROGRESS-Track-A.md claims Track B is "100% complete"
- But build is broken - this is incorrect
- Re-evaluate Track B actual status
- Update progress documents

### HIGH PRIORITY (Unblock Progress)

**3. Complete Sprint 1 Deliverables** (1 week)
- Make Patch.edges required (not optional)
- Verify PatchStore dual-write implementation
- Add validation tests for edges-only compilation
- Update transaction ops to handle Edge type

**4. Complete Track A Deliverable A.4** (2-3 days)
- Create unified `applyTransforms()` function
- Update Pass 8 to use transforms field via `getEdgeTransforms()`
- Remove separate `applyAdapterChain` / `applyLensStack` functions
- **Then** remove lensStack/adapterChain from Edge (A.5)

### MEDIUM PRIORITY (Sequential Work)

**5. Sprint 2: Remove Dual-Path Execution** (1 week)
- Update Pass 1 to use edges exclusively
- Update Pass 2 to use edges exclusively
- Update Pass 7 to use edges exclusively
- Remove legacy arrays from NormalizedPatch

**6. Sprint 3: Delete Migration Helpers** (1 day)
- After Sprint 2 complete
- Delete `edgeMigration.ts`
- Verify no imports remain

### LOW PRIORITY (Final Cleanup)

**7. Sprints 4-5: Remove Legacy Types** (1 week)
- Remove Connection/Publisher/Listener interfaces
- Remove legacy Patch arrays
- Remove PatchStore legacy observables

---

## Risks and Mitigations

### High-Risk: Concurrent Track Work

**Risk**: Tracks A and B both touch `transforms/` directory, causing conflicts

**Mitigation**:
- Finish Track A completely before Track B final cleanup
- Keep migration files until all tracks complete
- Document which files belong to which track

### Medium-Risk: Incomplete Dual-Write

**Risk**: PatchStore may not maintain both edges and legacy arrays consistently

**Mitigation**:
- Add tests for dual-write consistency
- Verify all mutation paths update both arrays
- Log warnings when arrays diverge

### Low-Risk: Test Failures After Type Removal

**Risk**: Removing Connection/Publisher/Listener breaks many tests

**Mitigation**:
- Update tests incrementally
- Use search/replace for common patterns
- Maintain test coverage throughout

---

## Estimated Remaining Effort

| Sprint/Track | Remaining Work | Effort | Dependencies |
|--------------|---------------|--------|--------------|
| **Fix TS Errors** | 100% | 2-4 hours | None |
| **Sprint 1** | 70% | 4-5 days | TS errors fixed |
| **Track A (A.4-A.5)** | 20% | 2-3 days | None |
| **Sprint 2** | 100% | 5-7 days | Sprint 1 complete |
| **Sprint 3** | 100% | 1 day | Sprint 2 complete |
| **Sprint 4** | 100% | 3-5 days | Sprint 3 complete |
| **Sprint 5** | 100% | 3-5 days | Sprint 4 complete |
| **Track B Fix** | Unknown | 1-2 days | TS errors fixed |

**Total Remaining Effort**: 3-4 weeks of focused work

**Current Completion**: ~35% (Sprint 1 partial, Track A 80%, broken state)

---

## Verdict

**Status**: IN PROGRESS but **BROKEN**
**Workflow**: **PAUSE** - Fix TypeScript compilation before proceeding
**Critical Path**: Fix TS → Finish Sprint 1 → Complete Track A → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 5
**Blocker**: 52 TypeScript compilation errors prevent validation

**Next Steps**:
1. **URGENT**: Fix TypeScript compilation errors
2. Audit Track B claims vs reality
3. Complete Sprint 1 (make edges required)
4. Finish Track A.4 (unified transform application)
5. Then proceed with Sprint 2

---

## Files Requiring Changes (Immediate)

### Fix TypeScript Compilation

**1. src/editor/transforms/index.ts**
- Remove lines 18-19 (import missing migration files)
- Verify TransformRegistry initializes correctly without them

**2. src/editor/semantic/** (Bus.combineMode errors)
- Check Bus interface definition - did combineMode → combine?
- Update tests and validator to use correct property name

**3. src/editor/transforms/__tests__/migrate.test.ts** (LensParamBinding.type errors)
- Check LensParamBinding interface - does it have .type field?
- Update test fixtures to match current type definition

**4. src/editor/stores/BusStore.ts**
- Remove unused CombinePolicy import (line 13)

---

## Summary for `.agent_planning/SUMMARY-project-evaluator-<timestamp>.txt`

```
Agent: project-evaluator | 2026-01-01-060000
Scope: phase0.5-compat-cleanup/remaining-work
Completion: 35% | Gaps: 5 sprints + 2 tracks | BROKEN STATE
Reused: 4 findings from STATUS-2026-01-01.md
Fresh: TypeScript compilation errors, Track B breakage
Cache updated: [none - evaluation only]
Ambiguities: 4 found (Track B deletion intent unclear)
Workflow: PAUSE - Fix 52 TS errors before proceeding
-> IMMEDIATE: Fix transforms/index.ts imports (2-4 hours)
```
