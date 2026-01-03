# Evaluation: Bus Semantics Module
**Issue #5 from Overview.md**

Timestamp: 2025-12-21-122800
Confidence: FRESH
Scope: Bus ordering and combine semantics (Issue #5)

---

## Executive Summary

**Status**: PARTIALLY COMPLETE - Critical logic split between UI and compiler
**Risk Level**: HIGH - Non-deterministic behavior possible
**Blocker**: Yes - Required for multi-UI and server-authoritative architecture

**The Problem**: Bus ordering and combine logic exists in TWO places:

This creates the same "two truths" problem identified in Overview.md Issue #5.

---

## What the Spec Requires

From **design-docs/10-Refactor-for-UI-prep/1-Overview.md**:

> **5) Bus combine semantics partly in UI/store and partly in compiler**
>
> From your report:
> - Bus ordering is via sortKey and sorting happens in BusStore query.
> - Combine mode is a bus property.
> - Compiler combines at compile/eval time.
>
>
> **Fix shape**: ordering and enabled/disabled rules must live in one "bus semantics" module that both UI queries and compiler use.

From **design-docs/10-Refactor-for-UI-prep/7-PatchSemantics.md**:

> **5.3 Deterministic ordering**
>
> sortKey is a contract. The kernel is where it becomes authoritative:
> - combine order is derived from this sorted list
> - UI and compiler MUST use same sort
>

From **design-docs/3-Synthesized/03-Buses.md**:

>
> Deterministic ordering via sortKey:
> - Combine operations use this ordering
> - Results are deterministic across frames

---

## Current State Assessment

### Bus Ordering Logic - DUPLICATED

**Location 1: BusStore.ts (UI Layer)**
```typescript
// src/editor/stores/BusStore.ts:499-503
    .filter(p => p.busId === busId)
    .sort((a, b) => a.sortKey - b.sortKey);  // ← Sorts by sortKey only
}
```

**Location 2: compileBusAware.ts (Compiler)**
```typescript
// src/editor/compiler/compileBusAware.ts:83-91
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    // Stable tie-breaker using locale compare
    return a.id.localeCompare(b.id);  // ← Has tie-breaker!
  });
}
```

**CRITICAL DIVERGENCE FOUND**:
- BusStore sorts by `sortKey` ONLY
- Compiler sorts by `sortKey` THEN `id` (tie-breaker)
- This breaks determinism guarantees

### Combine Logic - DUPLICATED

**Location 1: compileBusAware.ts (Compiler)**
```typescript
// Lines 101-194: combineSignalArtifacts()
// Lines 207-325: combineFieldArtifacts()
```
Supports:
- Signal buses: `last`, `sum`
- Field buses: `last`, `sum`, `average`, `max`, `min`

**Location 2: FieldExpr.ts (Unified Compiler)**
```typescript
// src/editor/compiler/unified/FieldExpr.ts:300-329
function combineValues(values: unknown[], combineMode: string): unknown {
  switch (combineMode) {
    case 'last': return values[values.length - 1];
    case 'sum': /* ... */
    case 'average': /* ... */
    case 'max': /* ... */
    case 'min': /* ... */
  }
}
```

**DUPLICATION CONFIRMED**: Same logic in two compilers.

### Enabled/Disabled Filtering - INCONSISTENT


**compileBusAware.ts**: Filters by `enabled` at evaluation time
```typescript
// Line 831
```



**Location: semantic/graph.ts**
```typescript
// Lines 53-54 (inferred from structure)
// "sorted by sortKey for deterministic ordering"
```

- Need to verify if semantic layer is being used consistently
- If so, this could be the foundation for the unified module

---

## Evidence of the Problem

### Test Evidence

From `src/editor/compiler/unified/__tests__/UnifiedCompiler.test.ts`:
```typescript
{ blockId: 'source1', busId: 'bus1', port: 'out', sortKey: 0 },
{ blockId: 'source2', busId: 'bus1', port: 'out', sortKey: 1 },
```

Tests verify sortKey ordering works in compiler - but do NOT verify consistency with UI.

### Runtime Risk

1. UI displays them in array insertion order (BusStore has no tie-breaker)
2. Compiler evaluates them in `id.localeCompare()` order
3. For `last` combine mode → **different values in UI vs runtime**
4. User sees one thing, gets another - invisible bug

**Impact**: Breaks "what you see is what you get" for bus visualization.

---

## What Changes Are Needed

### Required: Single Bus Semantics Module

**File**: `src/editor/semantic/busSemantics.ts` (NEW)

**Contract**:
```typescript
/**
 * Canonical bus semantics - ONLY place bus logic lives.
 * Used by UI, compiler, and diagnostics for identical results.
 */

export class BusSemantics {
  /**
   * Deterministic ordering: sortKey ascending, then id.localeCompare()
   *
   * UI and compiler MUST use this.
   */
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.id.localeCompare(b.id);  // Stable tie-breaker
    });
  }

  /**
   * Combine Signal artifacts.
   * Implements: last, sum
   */
  combineSignalArtifacts(
    artifacts: Artifact[],
    mode: 'last' | 'sum',
    defaultValue: unknown
  ): Artifact { /* ... */ }

  /**
   * Combine Field artifacts.
   * Implements: last, sum, average, max, min
   */
  combineFieldArtifacts(
    artifacts: Artifact[],
    mode: 'last' | 'sum' | 'average' | 'max' | 'min',
    defaultValue: unknown
  ): Artifact { /* ... */ }

  /**
   * Validate combine mode for bus type.
   */
  validateCombineMode(bus: Bus): ValidationError[] { /* ... */ }
}
```

### Migration Steps

**Phase 1: Create module**
2. Extract `combineSignalArtifacts()` from compileBusAware.ts
3. Extract `combineFieldArtifacts()` from compileBusAware.ts
4. Add enabled filtering as explicit parameter/policy

**Phase 2: Update consumers**
3. compileBusAware.combineSignalArtifacts() → calls `BusSemantics.combineSignalArtifacts()`
4. FieldExpr.combineValues() → calls `BusSemantics` (or stays separate if truly different context)

**Phase 3: Validation**
1. Add tests verifying UI and compiler use identical ordering
3. Add test for enabled/disabled filtering consistency

**Phase 4: Semantic Graph Integration**
3. BusStore and compiler query SemanticGraph instead of re-sorting

---

## Dependencies and Blockers

### Depends On
- **Issue #1 (Port Identity)**: Bus semantics module needs canonical PortRef
- **Issue #4 (Shared Validation)**: BusSemantics should integrate with Validator

### Blocks
- Multi-UI work (can't have two UIs showing different orderings)
- Server-authoritative patches (server needs canonical semantics)
- Reliable diagnostics (bus value preview must match runtime)

### Integration Points

**Already exists - good foundation**:
- Semantic layer is positioned to be the canonical source

**Missing - needs creation**:
- Combine logic NOT in semantic layer
- No shared module for bus evaluation rules
- Tests don't verify cross-layer consistency

---

## Risk Assessment

**Current Risk**: HIGH

**Consequences if not fixed**:
1. **Silent bugs**: UI shows one ordering, runtime uses another
2. **Non-deterministic behavior**: Same patch different results depending on UI state
3. **Multi-UI blocker**: Can't have multiple views if they compute different values
4. **Testing blind spot**: Tests pass but users see wrong behavior

**Effort to fix**: MEDIUM
- Extract existing logic (already works individually)
- Create single module (~200 lines)
- Update 4-5 call sites
- Add consistency tests

**Benefit**: CRITICAL
- Enables multi-UI
- Enables server authority
- Fixes invisible non-determinism
- Simplifies testing (one truth to verify)

---

## Recommendations

### Priority: CRITICAL (Top 3)

From Overview.md ranking:
> 5. Bus semantics module (determinism + explainability)

This is foundational for multi-UI and must be fixed before any UI refactor work.

### Concrete Next Steps

1. **Immediate**: Create `src/editor/semantic/busSemantics.ts`
   - Extract combine logic
   - Add enabled filtering policy

   - Add id tie-breaker to match compiler
   - Add enabled filtering option
   - Verify UI displays match runtime

3. **Integration**: Update compileBusAware.ts
   - Import and use BusSemantics
   - Remove local implementations
   - Add comment: "// CRITICAL: Use BusSemantics - do not duplicate logic"

4. **Validation**: Add cross-layer tests
   - Test: UI and compiler return same ordering
   - Test: Tie-breaker works correctly
   - Test: Enabled filtering is consistent

### Success Criteria

- [ ] BusStore and compiler return identical sorted lists
- [ ] Combine logic unified in one place
- [ ] Tests verify UI/compiler consistency
- [ ] Documentation explains why this matters

---

## Verdict

**PAUSE RECOMMENDED**: Bus semantics split is a fundamental architecture issue.

Multi-UI work should NOT proceed until this is unified. The risk of invisible non-determinism is too high, and fixing it after multi-UI is deployed will be much harder.

**Alternative - CONTINUE with caveat**:
If other UI refactor work (port identity, layout projection) can proceed independently, start there. But bus visualization features MUST wait for unified semantics.

---

## Appendix: File Locations

### Current Implementation Locations

**Bus Ordering**:
- `src/editor/stores/BusStore.ts:499-503` (UI layer - no tie-breaker)
- `src/editor/compiler/compileBusAware.ts:83-91` (compiler - has tie-breaker)
- `src/editor/semantic/graph.ts:53-54` (semantic layer - sorted map)

**Combine Logic**:
- `src/editor/compiler/compileBusAware.ts:101-194` (Signal combine)
- `src/editor/compiler/compileBusAware.ts:207-325` (Field combine)
- `src/editor/compiler/unified/FieldExpr.ts:300-329` (unified compiler)

**Related Validation**:
- `src/editor/semantic/validator.ts:390-419` (empty bus warnings)
- `src/editor/compiler/compileBusAware.ts:470-493` (combine mode validation)

### Proposed New Files

- `src/editor/semantic/busSemantics.ts` (NEW - canonical semantics)
- `src/editor/semantic/__tests__/busSemantics.test.ts` (NEW - consistency tests)
