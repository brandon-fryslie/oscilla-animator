# Test Audit Report - 2025-12-28

## Summary

- **Total test files**: 128 (excluding worktrees duplicates)
- **Total tests**: 2425 passed, 3 skipped, 10 todo
- **Test execution time**: ~59s

## Files to Remove (Empty/Placeholder)

### REMOVE - Empty placeholder tests with only .todo() markers:

1. **`src/editor/compiler/__tests__/golden-patch-ir.test.ts`** (3 tests, all .todo)
   - Placeholder for "Breathing Constellation" golden patch test
   - Only contains `it.todo()` markers
   - Has been a placeholder since Sprint 2, never implemented
   - **Action**: DELETE or implement

2. **`src/editor/stores/__tests__/PatchStore.kernel.test.ts`** (7 tests, all .todo)
   - Tests for PatchStore-to-Kernel transaction integration
   - All tests marked `.todo()`
   - Comment says "Once Deliverable 3 is complete, remove .todo()"
   - Deliverable 3 was never completed
   - **Action**: DELETE or implement

## Files to Consolidate (Potential Overlap)

### Consider consolidating related test files:

1. **Event-related tests** (might overlap):
   - `src/editor/events/__tests__/EventDispatcher.test.ts` (32 tests)
   - `src/editor/events/__tests__/CompileLifecycle.test.ts` (21 tests)
   - `src/editor/events/__tests__/GraphCommitted.test.ts` (28 tests)

   These test the same event system from different angles. Could potentially merge.

2. **Store event tests** (test the same functionality from different layers):
   - `src/editor/stores/__tests__/BusStore.events.test.ts`
   - `src/editor/stores/__tests__/PatchStore.events.test.ts`
   - `src/editor/stores/__tests__/RootStore.events.test.ts`

   These test event handling through stores. Not duplicates but could be reduced.

3. **Diagnostic-related tests**:
   - `src/editor/diagnostics/__tests__/DiagnosticHub.test.ts` (59 tests)
   - `src/editor/stores/__tests__/DiagnosticStore.test.ts` (28 tests)

   DiagnosticHub tests core diagnostics, DiagnosticStore tests MobX wrapper. Both needed.

## No-Action Items (Tests are Valuable)

### Large test files that are high-value:

1. **`src/editor/runtime/signal-expr/__tests__/SigEvaluator.test.ts`** (122 tests)
   - Core signal expression evaluator - critical infrastructure
   - KEEP - comprehensive coverage needed

2. **`src/editor/__tests__/lenses.test.ts`** (50 tests)
   - Tests lens transformations - core feature
   - KEEP

3. **`src/editor/__tests__/composite-library.test.ts`** (42 tests)
   - Tests composite registration and validation
   - KEEP

4. **`src/editor/runtime/integration/__tests__/typeAdapter.test.ts`** (50 tests)
   - Type conversion infrastructure
   - KEEP

5. **`src/editor/debug/__tests__/types.test.ts`** (50 tests)
   - Debug value summarization/formatting
   - KEEP

6. **`src/editor/compiler/__tests__/featureFlags.test.ts`**
   - Tests feature flag system for legacy/IR toggle
   - KEEP - useful for architecture transition

7. **`src/editor/runtime/signal-expr/__tests__/blockMigration.test.ts`**
   - Golden tests for IR migration validation
   - KEEP - validates IR matches closure behavior

## Files with Skipped Tests (Needs Review)

Tests containing `.skip` or `.todo` that might need attention:

1. `src/editor/runtime/integration/__tests__/typeAdapter.test.ts` - has some skips
2. `src/editor/runtime/executor/__tests__/executeBusEval.test.ts` - has skips
3. `src/editor/transactions/__tests__/TxBuilder.test.ts` - has skips
4. `src/editor/__tests__/composite.expansion.test.ts` - has skips
5. `src/editor/semantic/__tests__/graph.test.ts` - has skips
6. `src/editor/semantic/__tests__/validator.test.ts` - has skips
7. `src/editor/compiler/passes/__tests__/pass6-block-lowering.test.ts` - has skips
8. `src/editor/compiler/passes/__tests__/pass2-types.test.ts` - has skips
9. `src/editor/compiler/__tests__/bus-diagnostics.test.ts` - has skips
10. `src/editor/debug/__tests__/instrumentClosure.test.ts` - has skips

## Recommendations

### Immediate Actions (Low Risk):

1. **DELETE** `golden-patch-ir.test.ts` - provides zero value as placeholder
2. **DELETE** `PatchStore.kernel.test.ts` - depends on unimplemented feature

### Medium-Term Cleanup:

1. Review all files with `.skip` markers - either enable tests or remove them
2. Consider if 2425 tests is excessive for a codebase this size
3. Run coverage report to identify any untested areas

### Metrics:

- Tests per file average: ~19
- Largest file: SigEvaluator.test.ts (122 tests)
- 10 files have 40+ tests each

## Conclusion

The test suite is **mostly justified**. The main issues are:
- 2 placeholder files that should be deleted
- 10 files with skipped tests that need review
- Some potential for consolidation in event/store tests

The test count (2425) is high but the tests are testing real functionality, not tautological.
