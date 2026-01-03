# Bus Cleanup Evaluation: What Blocks Immediate Deletion

**Date**: 2026-01-02
**Scope**: module:bus-cleanup:20260102-100000
**Confidence**: FRESH (direct file inspection)
**Git Commit**: 0a18884

---

## Executive Summary


**Current Reality**: CANNOT delete immediately - extensive usage across 50+ files.

| Component | User Expectation | Reality | Blocker Count |
|-----------|------------------|---------|---------------|
| BusStore.ts | DELETE NOW | Used by 15+ files | 47 call sites |
| `kind: 'bus'` | DELETE NOW | Used by 29 files | 84 occurrences |

**Verdict**: ⚠️ **CANNOT DELETE IMMEDIATELY** - Requires systematic refactoring (8-12 hours).

---

## Problem 1: BusStore Still Has Real Responsibilities

### What BusStore Actually Does (Not Just a Facade)

**Location**: `src/editor/stores/BusStore.ts`

**Lines 37-43**: REAL DATA STORAGE
```typescript
```

**Lines 82-84**: Only buses are delegated
```typescript
get buses(): Bus[] {
  return this.root.patchStore.busBlocks.map(convertBlockToBus);
}
```


The facade pattern is **incomplete**:
- ✅ `buses` getter → delegates to PatchStore.busBlocks


---

## Problem 2: 47 Active Call Sites to BusStore

### Direct Usage by Component (src/ only)

| File | Call Sites | Purpose |
|------|------------|---------|
| **ModulationTableStore.ts** | 13 | Bus routing UI (main user) |
| **RootStore.ts** | 11 | Patch serialization, lifecycle |
| **PatchStore.ts** | 10 | Block creation default buses |
| **defaultSources/validate.ts** | 5 | Bus validation |
| **DebugStore.ts** | 2 | Debug inspection |
| **DebugUIStore.test.ts** | 2 | Test utilities |
| **DiagnosticHub.test.ts** | 1 | Test utilities |

**Total**: 47 call sites across 7 files

### Most Critical: ModulationTableStore.ts

**Lines with BusStore dependencies**:
```typescript
Line 336: this.root.busStore.buses
Line 341: this.root.busStore.buses
```

**Impact**: Modulation Table (user-facing UI) would completely break.

---


### Patch Serialization Uses BusStore Arrays

**File**: `src/editor/stores/RootStore.ts`

**Lines 289-291**: toPatch() writes arrays
```typescript
buses: this.busStore.buses.map((b) => ({ ...b })),
```

**Lines 237, 242**: loadPatch() reads arrays
```typescript
```

**Lines 329-330**: importPatch() reads arrays
```typescript
```

**Lines 402-403**: clearPatch() clears arrays
```typescript
```

**What breaks if deleted**: Patch loading/saving completely broken.

---

## Problem 4: Patch Type Still Requires Arrays

**File**: `src/editor/types.ts`

**Lines 925-928**: Patch interface definition
```typescript
export interface Patch {
  // ... other fields ...
}
```

**Files using Patch type**: 100+ files across codebase

**Impact**: Deleting these fields = 100+ compile errors.

---

## Problem 5: Endpoint Union Has 84 Active Checks

### Distribution of `kind: 'bus'` Checks

| Category | Files | Occurrences | Status |
|----------|-------|-------------|--------|
| **Compiler** | 5 | 12 | Functional - needed for bus lowering |
| **Stores** | 3 | 8 | Functional - edge filtering |
| **Migration** | 3 | 5 | Infrastructure - safe to keep |
| **Types/Tests** | 18 | 59 | Structural - follow main code |

### Critical Compiler Checks (Cannot Delete Yet)

**File**: `src/editor/compiler/passes/resolveWriters.ts:162-169`
```typescript
} else if (edge.from.kind === 'bus') {
  writers.push({
    kind: 'bus',
    busId: edge.from.busId,
  });
}
```

**Purpose**: Classifies edge writers for dependency graph.
**Status**: FUNCTIONAL - compiler needs this until edge migration complete.

**File**: `src/editor/stores/PatchStore.ts:155, 164`
```typescript
  return this.edges.filter(e => e.from.kind === 'port' && e.to.kind === 'bus');
}

  return this.edges.filter(e => e.from.kind === 'bus' && e.to.kind === 'port');
}
```

**Purpose**: UI helpers for bus routing display.
**Status**: FUNCTIONAL - used by BusBoard, BusInspector.

---

## What Can vs. Cannot Be Deleted

### ❌ CANNOT Delete Now (Breaks Compilation/Runtime)

1. **BusStore.ts** - 47 active call sites
   - Patch serialization (RootStore)
   - Modulation table UI (13 call sites)
   - Block migration (PatchStore)
   - Patch serialization (RootStore)
   - Modulation table UI (13 call sites)
   - Block migration (PatchStore)
5. **Endpoint.kind === 'bus'** - 84 checks in compiler/stores (functional)

### ⚠️ Can Delete With Replacements

7. **Bus interface** - If BusBlock metadata conversion works
8. **BusStore methods** - If moved to PatchStore

### ✅ Can Delete Safely (Low Impact)

9. Migration utilities `kind: 'bus'` checks - Keep for backward compat
10. Test-only bus references - Update with main code
11. Documentation - Update after main deletion

---

## Minimal Path to Deletion

### Phase 1: Migrate Data Storage (4-6 hours)


```typescript
// Add to PatchStore.ts
  // Construct from edges where to.kind === 'bus'
  return this.edges
    .filter(e => isBusBlockPort(e.to))
}

  // Construct from edges where from.kind === 'bus'
  return this.edges
    .filter(e => isBusBlockPort(e.from))
}
```

**Files to modify**: 1

#### Step 1.2: Redirect BusStore Arrays to PatchStore
```typescript
// Modify BusStore.ts
}

}

// Delete these lines:
```

**Files to modify**: 1
**Estimated effort**: 30 min

#### Step 1.3: Update RootStore Serialization
```typescript
// Modify RootStore.ts - toPatch()

// loadPatch() - construct edges instead of arrays
// importPatch() - construct edges instead of arrays
```

**Files to modify**: 1
**Estimated effort**: 2 hours (includes patch migration logic)


---

### Phase 2: Delete BusStore (2-3 hours)

**Prerequisites**: Phase 1 complete, all tests passing.

#### Step 2.1: Move BusStore Methods to PatchStore

Move these methods:
- `createBus()` → Already exists in PatchStore as `addBus()`
- `deleteBus()` → Already exists in PatchStore as `removeBus()`
- `updateBus()` → Already exists in PatchStore
- Lens stack methods → Becomes edge.lensStack operations

**Files to modify**: 1 (PatchStore.ts)
**Estimated effort**: 1 hour

#### Step 2.2: Update All Call Sites

Replace `root.busStore.X` with `root.patchStore.X`:
- ModulationTableStore.ts: 13 replacements
- RootStore.ts: 11 replacements
- PatchStore.ts: 10 replacements
- defaultSources/validate.ts: 5 replacements
- Others: 8 replacements

**Files to modify**: 7
**Estimated effort**: 1-2 hours

#### Step 2.3: Delete BusStore.ts and RootStore.busStore

```typescript
// RootStore.ts - DELETE these lines
import { BusStore } from './BusStore';  // DELETE
busStore: BusStore;                     // DELETE
this.busStore = new BusStore(this);     // DELETE
```

**Files to delete**: 1 (BusStore.ts)
**Files to modify**: 1 (RootStore.ts)
**Estimated effort**: 15 min

**Checkpoint**: Run tests - BusStore deleted, functionality preserved.

---

### Phase 3: Type Cleanup (2-3 hours)

**Prerequisites**: Phase 2 complete, BusStore deleted.

#### Step 3.1: Simplify Endpoint Type

**Before**:
```typescript
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };
```

**After**:
```typescript
export type Endpoint = PortRef;  // Just an alias
// OR: Delete Endpoint entirely, use PortRef directly
```

**Expected impact**: 50-100 compile errors
**Files to fix**: ~20 files
**Estimated effort**: 2-3 hours (TypeScript guides to each error)


After edges are primary storage, delete:
```typescript
```

**Expected impact**: 30-50 compile errors
**Files to fix**: ~10 files (mostly tests)
**Estimated effort**: Included in Step 3.1


```typescript
export interface Patch {
  buses: Bus[];        // Keep for now (BusBlock conversion)
}
```

**Expected impact**: Already handled by Phase 1 (edge-based serialization)
**Estimated effort**: 0 (already done in Phase 1.3)

**Checkpoint**: Run tests - types simplified, no `kind: 'bus'` in edges.

---

### Phase 4: Remove kind Checks (1-2 hours)

**Prerequisites**: Phase 3 complete, Endpoint simplified.

#### Step 4.1: Update Compiler Checks

**Files to modify**:
- `pass1-normalize.ts` (2 checks) - Filter by BusBlock port instead
- `pass6-block-lowering.ts` (1 check) - Handle via BusBlock recognition
- `pass7-bus-lowering.ts` (2 checks) - Delete legacy edge detection
- `resolveWriters.ts` (1 check) - All edges are 'wire' or 'default'

**Estimated effort**: 1 hour

#### Step 4.2: Update Store Checks

**Files to modify**:
- `SelectionStore.ts` - Recognize BusBlock instead of 'bus' kind
- `DiagnosticStore.ts` - Match BusBlock diagnostics

**Estimated effort**: 1 hour

**Checkpoint**: Run tests - no `kind: 'bus'` checks remain (except migration).

---

## Test Impact Analysis

### Current Test Failures: 43 (Unrelated to Bus System)

**Source**: Recent transform work (lenses, adapters)
**Files failing**:
- `lenses.test.ts` - Missing exports
- `ConstToSignal.ts` - Type errors (busEligible missing)
- `arithmetic.ts`, `ease.ts`, `shaping.ts` - Type errors

**Status**: These are NEW failures from recent work, NOT bus-unification issues.

**Action**: Fix these FIRST before bus cleanup (blocks compilation).

---

### Bus-Specific Tests: Currently Passing

**Files tested**:
- `bus-compilation.test.ts` ✅
- `field-bus-compilation.test.ts` ✅
- `edgeMigration.test.ts` ✅
- `bus-block-utils.test.ts` ✅
- `pass7-bus-lowering.test.ts` ✅

**Expected impact of cleanup**:
- Phase 1-2: Tests should still pass (backward compat maintained)
- Phase 3-4: Tests need updates for new types/edge format

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **ModulationTable breaks** | HIGH | CERTAIN | Manual UI testing after each phase |
| **Patch load/save breaks** | CRITICAL | CERTAIN | Test with real patches after Phase 1 |
| **Type cleanup cascade** | HIGH | CERTAIN | Fix file-by-file, commit frequently |
| **Compiler regression** | MEDIUM | POSSIBLE | Run bus tests after each change |
| **Edge migration issues** | MEDIUM | POSSIBLE | Keep migration utilities, version bump |

---

## Estimated Timeline

| Phase | Work | Effort |
|-------|------|--------|
| **0. Fix Current Tests** | Transform type errors | 1-2 hours |
| **2. Delete BusStore** | Move methods, update call sites | 2-3 hours |
| **4. Remove kind Checks** | Compiler and store updates | 1-2 hours |
| **Total** | | **10-16 hours** |

**Prerequisite**: Phase 0 (fix current tests) MUST complete first.

---

## Acceptance Criteria

### Phase 1 Complete:
- [ ] BusStore arrays redirect to PatchStore (not deleted yet)
- [ ] RootStore serialization uses edges (not arrays)
- [ ] All existing tests pass
- [ ] Manual test: Create/edit/delete bus works

### Phase 2 Complete:
- [ ] BusStore.ts deleted
- [ ] RootStore.busStore property removed
- [ ] All call sites updated to use PatchStore
- [ ] All existing tests pass
- [ ] Manual test: Modulation table works

### Phase 3 Complete:
- [ ] Endpoint type simplified to PortRef (or deleted)
- [ ] TypeScript compilation succeeds (0 errors)
- [ ] All tests pass

### Phase 4 Complete:
- [ ] All `edge.from.kind === 'bus'` checks removed (except migration)
- [ ] All `edge.to.kind === 'bus'` checks removed (except migration)
- [ ] All `writer.kind === 'bus'` cases removed from compiler
- [ ] Tests updated for new edge format
- [ ] All tests pass

---

## Exact Files Requiring Modification

### Phase 1 (Data Migration):
2. `src/editor/stores/BusStore.ts` - Redirect arrays to PatchStore
3. `src/editor/stores/RootStore.ts` - Update serialization

### Phase 2 (BusStore Deletion):
4. `src/editor/stores/PatchStore.ts` - Add bus methods from BusStore
5. `src/editor/modulation-table/ModulationTableStore.ts` - Update 13 call sites
6. `src/editor/stores/RootStore.ts` - Update 11 call sites
7. `src/editor/stores/PatchStore.ts` - Update 10 call sites
8. `src/editor/defaultSources/validate.ts` - Update 5 call sites
9. `src/editor/stores/DebugStore.ts` - Update 2 call sites
10. `src/editor/stores/RootStore.ts` - Delete busStore property
11. `src/editor/stores/BusStore.ts` - DELETE FILE

### Phase 3 (Type Cleanup):
13-32. ~20 files with compile errors (TypeScript will guide)

### Phase 4 (kind Checks):
33. `src/editor/compiler/passes/pass1-normalize.ts`
34. `src/editor/compiler/passes/pass6-block-lowering.ts`
35. `src/editor/compiler/passes/pass7-bus-lowering.ts`
36. `src/editor/compiler/passes/resolveWriters.ts`
37. `src/editor/stores/PatchStore.ts`
38. `src/editor/stores/SelectionStore.ts`
39. `src/editor/stores/DiagnosticStore.ts`

**Total files to modify**: ~40 files
**Total files to delete**: 1 file (BusStore.ts)

---

## Recommendation

**CANNOT delete immediately** - systematic refactoring required.

**Critical Path**:
```
Fix current test failures (Phase 0)
  ↓
Migrate data to edges (Phase 1)
  ↓
Delete BusStore (Phase 2)
  ↓
Type cleanup (Phase 3)
  ↓
Remove kind checks (Phase 4)
```

**Most Critical Blocker**: Phase 0 - Current test failures from transform work.
**Second Blocker**: Phase 1 - Edge-based storage must work BEFORE BusStore deletion.

**Recommendation**: Start with Phase 0 (fix current tests), then proceed systematically through phases with testing after each phase.

---

## Files Generated

This evaluation created:
- `.agent_planning/bus-block-unification/STATUS-2026-01-02-bus-cleanup.md` (this file)

---

**Evaluator**: project-evaluator
**Timestamp**: 2026-01-02 10:00
**Git Commit**: 0a18884
**Scope**: module:bus-cleanup:20260102-100000
**Confidence**: FRESH
