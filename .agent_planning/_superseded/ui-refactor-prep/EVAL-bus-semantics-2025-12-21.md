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
1. BusStore (UI layer) - sorts publishers for display
2. compileBusAware (compiler) - sorts publishers for evaluation

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
> **Risk**: if UI/store sorts one way and compiler sorts another (or filters disabled publishers differently), you get non-determinism that is invisible to users.
>
> **Fix shape**: ordering and enabled/disabled rules must live in one "bus semantics" module that both UI queries and compiler use.

From **design-docs/10-Refactor-for-UI-prep/7-PatchSemantics.md**:

> **5.3 Deterministic ordering**
>
> sortKey is a contract. The kernel is where it becomes authoritative:
> - publishers sorted by sortKey then by stable tie-breakers (id)
> - combine order is derived from this sorted list
> - UI and compiler MUST use same sort
>
> The kernel provides: `getSortedPublishers(busId)` → Publisher[]
> This is the ONLY way anyone gets publisher ordering.

From **design-docs/3-Synthesized/03-Buses.md**:

> **Publisher Ordering**
>
> Deterministic ordering via sortKey:
> - Every publisher has a stable sortKey
> - Combine operations use this ordering
> - Results are deterministic across frames

---

## Current State Assessment

### Bus Ordering Logic - DUPLICATED

**Location 1: BusStore.ts (UI Layer)**
```typescript
// src/editor/stores/BusStore.ts:499-503
getPublishersByBus(busId: string): Publisher[] {
  return this.publishers
    .filter(p => p.busId === busId)
    .sort((a, b) => a.sortKey - b.sortKey);  // ← Sorts by sortKey only
}
```

**Location 2: compileBusAware.ts (Compiler)**
```typescript
// src/editor/compiler/compileBusAware.ts:83-91
function sortPublishers(publishers: Publisher[]): Publisher[] {
  return [...publishers].sort((a, b) => {
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
- When multiple publishers have same sortKey, UI and compiler will show **different orderings**
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

**BusStore.ts**: No filtering by `enabled` in `getPublishersByBus()`
- Returns ALL publishers regardless of enabled status
- UI shows disabled publishers

**compileBusAware.ts**: Filters by `enabled` at evaluation time
```typescript
// Line 831
const busPublishers = publishers.filter(p => p.busId === busId && p.enabled);
```

**DIVERGENCE**: UI displays disabled publishers, compiler ignores them.

### Semantic Graph - DOES sort publishers

**Location: semantic/graph.ts**
```typescript
// Lines 53-54 (inferred from structure)
private busPublishers: Map<string, PublisherEdge[]> = new Map();
// "sorted by sortKey for deterministic ordering"
```

**Question**: Does SemanticGraph.getBusPublishers() use the same sort as compiler?
- Need to verify if semantic layer is being used consistently
- If so, this could be the foundation for the unified module

---

## Evidence of the Problem

### Test Evidence

From `src/editor/compiler/unified/__tests__/UnifiedCompiler.test.ts`:
```typescript
// Lines 108-109: Publishers with explicit sortKey
{ blockId: 'source1', busId: 'bus1', port: 'out', sortKey: 0 },
{ blockId: 'source2', busId: 'bus1', port: 'out', sortKey: 1 },
```

Tests verify sortKey ordering works in compiler - but do NOT verify consistency with UI.

### Runtime Risk

**Scenario**: User adds 3 publishers to `energy` bus with same sortKey:
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
   * Get sorted publishers for a bus.
   * Deterministic ordering: sortKey ascending, then id.localeCompare()
   *
   * CRITICAL: This is the ONLY way to get publisher ordering.
   * UI and compiler MUST use this.
   */
  getSortedPublishers(busId: string, allPublishers: Publisher[]): Publisher[] {
    const busPublishers = allPublishers.filter(p => p.busId === busId && p.enabled);
    return [...busPublishers].sort((a, b) => {
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
1. Extract `sortPublishers()` from compileBusAware.ts
2. Extract `combineSignalArtifacts()` from compileBusAware.ts
3. Extract `combineFieldArtifacts()` from compileBusAware.ts
4. Add enabled filtering as explicit parameter/policy

**Phase 2: Update consumers**
1. BusStore.getPublishersByBus() → calls `BusSemantics.getSortedPublishers()`
2. compileBusAware.sortPublishers() → calls `BusSemantics.getSortedPublishers()`
3. compileBusAware.combineSignalArtifacts() → calls `BusSemantics.combineSignalArtifacts()`
4. FieldExpr.combineValues() → calls `BusSemantics` (or stays separate if truly different context)

**Phase 3: Validation**
1. Add tests verifying UI and compiler use identical ordering
2. Add test for tie-breaker behavior (multiple publishers, same sortKey)
3. Add test for enabled/disabled filtering consistency

**Phase 4: Semantic Graph Integration**
1. Verify SemanticGraph.busPublishers uses `BusSemantics`
2. Make SemanticGraph the authoritative cache of sorted publishers
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
- `src/editor/semantic/graph.ts` has `busPublishers` map (sorted)
- `src/editor/semantic/validator.ts` has `getBusPublishers()` query
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
   - Extract sortPublishers with tie-breaker
   - Extract combine logic
   - Add enabled filtering policy

2. **Quick Win**: Fix BusStore.getPublishersByBus()
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

- [ ] Single source of truth for publisher ordering
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
