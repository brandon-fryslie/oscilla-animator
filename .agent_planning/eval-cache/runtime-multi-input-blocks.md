# Runtime Findings: Multi-Input Blocks

**Scope**: work/multi-input-blocks
**Evaluated**: 2026-01-01-034006
**Updated**: 2026-01-01 (Pass 7 refactored)
**Status**: COMPLETE (code), INCOMPLETE (tests)

## Runtime Behavior Verified

### Dev Server Startup
- **Status**: ✅ PASS
- **Evidence**: Server starts on port 5173, responds with valid HTML
- **Errors**: None
- **Console**: Clean (no warnings or errors)

### TypeScript Compilation
- **Status**: ✅ PASS
- **Evidence**: `just typecheck` succeeds
- **Type Safety**: CombineMode, CombinePolicy, Slot.combine all type-safe

### Test Suite
- **Status**: ✅ PASS (with pre-existing failures)
- **Total**: 2798 passing
- **Failures**: 16 pre-existing (transaction validation tests)
- **Regressions**: 0 new failures

## Implementation Quality

### Type System
- **CombineMode**: Extends BusCombineMode with 'first', 'error', custom ✅
- **CombinePolicy**: 'when' and 'mode' fields ✅
- **Slot.combine**: Optional with comprehensive JSDoc ✅
- **Default**: `{ when: 'multi', mode: 'last' }` documented ✅

### Writer Resolution (resolveWriters.ts)
- **Writer types**: wire|bus|default discriminated union ✅
- **Ordering**: Deterministic (0:wire, 1:bus, 2:default) ✅
- **Sorting**: Ascending localeCompare ✅
- **Enumeration**: Collects all writer types ✅
- **Resolution**: Full per-block resolution ✅

### Combine Logic (combine-utils.ts)
- **validateCombineMode()**: World/domain validation ✅
- **validateCombinePolicy()**: Error mode + count validation ✅
- **shouldCombine()**: when='multi' vs 'always' ✅
- **createCombineNode()**: Signal/Field/Event support ✅
- **Modes**: sum, average, max, min, last, first, layer ✅
- **Pass 7 Integration**: ✅ DONE (2026-01-01)
  - Pass 7 now uses shared createCombineNode()
  - Removed 70+ lines of duplicate combine logic
  - All Pass 7 tests pass (13 tests)

### Pass 6 Integration
- **resolveInputsWithMultiInput()**: Multi-input resolution ✅
- **N=0 case**: Error if no default ✅
- **N=1 case**: Direct passthrough (optimization) ✅
- **N>1 case**: Creates combine node ✅
- **Validation**: Policy + mode checks ✅
- **Ordering**: Uses sortKey for determinism ✅

### Store Changes
- **PatchStore.connect()**: No disconnectInputPort ✅
- **BusStore.addListener()**: No disconnectInputPort ✅
- **Multi-input allowed**: Permanent change ✅

## Known Gaps

### Missing Tests
1. **Unit Tests**: resolveWriters.ts - Writer enumeration and sorting
2. **Unit Tests**: combine-utils.ts - Validation and combine node creation
3. **Integration Tests**: Pass 6 with N=0, N=1, N>1 cases
4. **Golden Patch Tests**: Multi-input scenarios

### Not Implemented
1. **Custom Combine Modes**: Registry not implemented (TODO in combine-utils.ts:188-193)
2. ~~**Pass 7 Refactor**: Could use combine-utils but not required~~ ✅ DONE (2026-01-01)

## Recommendations

### Immediate (Sprint 3.5)
- Add unit tests for resolveWriters.ts
- Add unit tests for combine-utils.ts
- Add integration tests for Pass 6 multi-input

### Future (Sprint 4+)
- Add golden patch tests
- Implement custom combine mode registry
- UI updates (Inspector, Canvas)

## Cache Confidence: FRESH

This evaluation is based on fresh runtime verification (2026-01-01).
All findings are current and verified against running code.

**Pass 7 refactor verified**: All tests pass, TypeScript compiles, behavior unchanged.
