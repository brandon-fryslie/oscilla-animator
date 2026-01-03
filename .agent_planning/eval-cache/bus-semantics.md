# Bus Semantics Module - Canonical Knowledge

**Cached**: 2025-12-21 13:35:00
**Source**: project-evaluator (bus-semantics-module/STATUS-20251221-133500.md)
**Confidence**: HIGH - Just implemented and verified
**Stability**: STABLE - Foundational module, unlikely to change frequently

---

## Module Purpose

**Canonical bus semantics - ONLY place bus logic lives.**

Provides deterministic publisher ordering and combine semantics used consistently across UI and compiler. Eliminates the "two truths" problem where BusStore and compiler had different sorting implementations.

---

## Architecture

**Location**: `src/editor/semantic/busSemantics.ts`
**Tests**: `src/editor/semantic/__tests__/busSemantics.test.ts` (41 tests)
**Exports**: Via `src/editor/semantic/index.ts` (semantic kernel)

### Key Functions

1. **getSortedPublishers()** - Deterministic publisher ordering
   - Primary sort: `sortKey` ascending
   - Tie-breaker: `id.localeCompare()` (stable)
   - Filtering: Optional `includeDisabled` flag
   - **Why**: Same sortKey → deterministic ordering (not array insertion order)

2. **combineSignalArtifacts()** - Signal bus combination
   - Modes: `last`, `sum`
   - Types: Signal:number, Signal:vec2, Scalar:number, Scalar:vec2
   - Default value handling for empty buses

3. **combineFieldArtifacts()** - Field bus combination
   - Modes: `last`, `sum`, `average`, `max`, `min`
   - Types: Field:number (lazy per-element combination)
   - Default value handling for empty buses

4. **validateCombineMode()** - Validate mode for world
   - Signal world: `last`, `sum` only
   - Field world: `last`, `sum`, `average`, `max`, `min`

5. **getSupportedCombineModes()** - Query supported modes
   - Returns array of valid modes for given world

---

## Integration Points

**Consumers**:
- `BusStore.getPublishersByBus()` - Uses `getSortedPublishers()`
- `compileBusAware.getBusValue()` - Uses all three functions (sort, combineSignal, combineField)
- Future: Validator, BusBoard, Diagnostics

**Critical Invariant**: Both UI and compiler MUST use this module. Do NOT duplicate sorting or combining logic.

---

## Testing

**Test Coverage**: 41 tests, all passing
- Publisher sorting (9 tests)
  - Primary sort, tie-breaker, filtering, immutability
- Signal combination (15 tests)
  - Empty, single, multiple, modes (last, sum), error handling, time-varying
- Field combination (15 tests)
  - Empty, single, multiple, modes (last, sum, average, max, min), error handling
- Validation helpers (7 tests)

**Test Quality**: High
- Immutability verified (original arrays preserved)
- Edge cases covered (empty, negative sortKey, disabled publishers)
- Error handling tested (unsupported modes)
- Time-varying signal behavior verified

---

## Historical Context

**Problem Solved**: BusStore and compiler had DIFFERENT sorting implementations
- **BusStore**: Sorted by `sortKey` only (no tie-breaker)
- **Compiler**: Sorted by `sortKey` then `id.localeCompare()`
- **Impact**: Same sortKey → different ordering in UI vs runtime
- **Solution**: Single source of truth in busSemantics module

**Commit**: ea91562 "refactor(compiler): Use canonical busSemantics for sorting and combining"
- Removed 321 lines of duplicate logic from compileBusAware.ts
- Added 21 lines of imports and calls to busSemantics

---

## When to Reference This

**Use this cached knowledge when**:
- Working on bus-related features (publishers, listeners, combines)
- Implementing new bus visualization
- Adding new combine modes
- Debugging ordering or combination issues
- Verifying UI/compiler consistency

**Invalidate this cache if**:
- `src/editor/semantic/busSemantics.ts` changes
- New combine modes added
- Publisher sorting algorithm changes
- Test failures in busSemantics.test.ts

---

## Key Learnings

1. **Deterministic ordering requires tie-breaker**: sortKey alone is insufficient
2. **UI and compiler must use same logic**: Guaranteed by shared module
3. **Fields are lazy**: Combination happens at evaluation time, not compilation
4. **Combine modes differ by world**: Signal (2 modes) vs Field (5 modes)
5. **Immutability matters**: Always create new arrays, preserve originals

---

## Related Documents

- `design-docs/3-Synthesized/03-Buses.md` - Bus architecture specification
- `design-docs/10-Refactor-for-UI-prep/1-Overview.md` - Issue #5 (bus semantics module)
- `design-docs/10-Refactor-for-UI-prep/7-PatchSemantics.md` - Section 5.3 (deterministic ordering)
- `.agent_planning/ui-refactor-prep/EVAL-bus-semantics-2025-12-21.md` - Original problem identification
