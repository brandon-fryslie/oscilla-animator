# Work Evaluation - 2025-12-30-080929
Scope: work/sprint1-state-offset-resolution
Confidence: FRESH

## Goals Under Evaluation
From PLAN-2025-12-30-031559.md Sprint 1:
1. Implement state ID → offset mapping in buildSchedule
2. Add deterministic state offset assignment
3. Apply alignment rules (4-byte scalars, 16-byte buffers)
4. Patch SignalExprStateful nodes with params.stateOffset
5. Add compile errors for StateDeclConflict and StateRefMissingDecl
6. Create integration tests verifying end-to-end compilation

## Previous Evaluation Reference
No previous evaluation for this sprint.

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `just test` | PASS | 2431/2431 tests pass (10 skipped) |
| `just typecheck` | PASS | No errors |
| `just lint` | PASS | 53 warnings (pre-existing) |
| `just check` | PASS | All checks pass |

## Manual Runtime Testing

### What I Tried
1. Read implementation in buildSchedule.ts:161-185 (resolveStateOffsets function)
2. Read integration tests in state-offset-resolution.test.ts
3. Ran tests to verify state offset mapping works end-to-end
4. Checked SigStateful.test.ts for manual workarounds
5. Verified git commits match DOD requirements

### What Actually Happened
1. Implementation exists and compiles successfully
2. 6 new integration tests pass, covering:
   - Automatic offset assignment
   - Sequential offset assignment for multiple stateful ops
   - Error handling for unknown stateId references
   - Preservation of existing params
   - Determinism (10 compilations → identical offsets)
   - State layout conversion
3. All 2431 tests pass without failures
4. Manual workarounds in SigStateful.test.ts are present but acceptable (runtime unit tests, not compiler integration tests)
5. Two commits implemented Sprint 1: 4ff7540 (implementation) and 59f4ca1 (tests)

## Data Flow Verification
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| IRBuilder allocates state | stateLayout array | stateLayout populated | ✅ |
| buildSchedule called | resolveStateOffsets runs | Function executes | ✅ |
| Offset map built | stateId → number | Map created from array index | ✅ |
| Stateful nodes patched | params.stateOffset set | Nodes mutated correctly | ✅ |
| Unknown stateId | Compile error | StateRefMissingDecl thrown | ✅ |
| Integration tests | Full pipeline works | 6/6 tests pass | ✅ |

## Break-It Testing
| Attack | Expected | Actual | Severity |
|--------|----------|--------|----------|
| Unknown stateId | Compile error | Error with message listing available IDs | PASS |
| Empty state layout | No crash | Works (no offsets assigned) | PASS |
| Multiple stateful ops | Sequential offsets | Offsets 0, 1, 2 assigned correctly | PASS |
| 10 compilations | Identical offsets | Deterministic results | PASS |
| Existing params | Preserved + stateOffset added | Params merged correctly | PASS |

## Evidence
- Implementation: `src/editor/compiler/ir/buildSchedule.ts:161-185`
- Integration tests: `src/editor/compiler/ir/__tests__/state-offset-resolution.test.ts`
- Test results: `just check` passes (2431/2431 tests)
- Commits: 4ff7540 (implementation), 59f4ca1 (tests)
- Test output: All 6 integration tests pass

## Assessment

### ✅ Working
1. **State offset mapping infrastructure**: resolveStateOffsets() function creates stateId → offset map from state layout
2. **Deterministic assignment**: State offsets assigned sequentially by array index (deterministic based on lowering order)
3. **Node patching**: SignalExprStateful nodes correctly receive params.stateOffset
4. **Error handling**: StateRefMissingDecl error thrown for unknown stateId with helpful message
5. **Integration tests**: 6 new tests verify end-to-end compilation through buildCompiledProgram
6. **Determinism test**: Same input → same offsets (10 compilations verified)
7. **Local stability test**: Implicitly verified by determinism test
8. **Existing params preservation**: params merged correctly (not overwritten)

### ❌ Not Working
1. **Alignment rules NOT implemented**: DOD requires "scalars 4-byte aligned, buffers 16-byte aligned"
   - Evidence: `resolveStateOffsets()` uses `idx` from array (line 168), no alignment calculation
   - Expected: `offset = align(currentOffset, entry.alignment); currentOffset += entry.sizeBytes`
   - Actual: `offset = idx` (just array index)
   - Impact: MEDIUM - May cause runtime issues with buffer alignment on some platforms
   - Location: `buildSchedule.ts:161-185`

2. **StateDeclConflict error NOT implemented**: DOD requires "Compile error emitted for StateDeclConflict (same ID, different size)"
   - Evidence: No detection logic in resolveStateOffsets() or allocState()
   - Expected: Error if same stateId allocated twice with different sizes
   - Actual: No conflict detection (would silently use first allocation)
   - Impact: MEDIUM - Could cause subtle bugs if blocks reuse state IDs incorrectly
   - Location: Missing from `buildSchedule.ts` and `IRBuilderImpl.ts`

3. **SigStateful.test.ts manual workarounds**: DOD states "All tests in SigStateful.test.ts pass without manual offset workarounds"
   - Evidence: 20+ instances of `params: { stateOffset: 0 }` in SigStateful.test.ts
   - Mitigation: These are runtime unit tests that bypass compilation, so manual offsets are acceptable
   - Ambiguity: DOD wording unclear - does it mean "remove workarounds" or "tests work despite workarounds"?
   - Impact: LOW - Tests pass, runtime evaluator works correctly
   - Status: QUESTIONABLE (interpretation issue, not implementation bug)

### ⚠️ Ambiguities Found
| Decision | What Was Assumed | Should Have Asked | Impact |
|----------|------------------|-------------------|--------|
| Alignment rules | Not critical for MVP | Should alignment be implemented or deferred? | MEDIUM - No explicit alignment calculation |
| StateDeclConflict | IRBuilder prevents duplicates | Should conflict detection be explicit? | MEDIUM - No validation for duplicate state IDs |
| SigStateful.test.ts workarounds | Unit tests can use manual offsets | Should unit tests also compile through buildSchedule? | LOW - Tests pass correctly |
| Alignment metadata | Not needed in StateLayoutEntry | Where should alignment info come from? | MEDIUM - No alignment field in state layout |

## Missing Checks (implementer should create)
None - integration tests are comprehensive and cover all critical paths.

## Verdict: INCOMPLETE

**Reason**: 2 of 6 DOD deliverables for "State Offset Mapping Infrastructure" are NOT implemented:
1. ❌ Alignment rules NOT applied (4-byte scalars, 16-byte buffers)
2. ❌ Compile error for StateDeclConflict NOT emitted

All other criteria are met:
- ✅ buildSchedule collects StateDecls
- ✅ StateDecl sorting is deterministic
- ✅ SignalExprStateful nodes have params.stateOffset set
- ✅ Compile error emitted for StateRefMissingDecl
- ✅ Determinism test passes (10 compilations → identical offsets)
- ✅ Local stability test passes (implicitly via determinism)
- ✅ Missing decl test passes (StateRefMissingDecl error)
- ❓ Conflict test NOT PRESENT (StateDeclConflict not implemented)
- ❓ SigStateful.test.ts has manual workarounds (acceptable for unit tests)

**Quality Assessment**:
- What exists works correctly and is well-tested
- Missing features are clearly defined and localized
- No runtime bugs or crashes
- Integration tests are excellent

## What Needs to Change

### CRITICAL (Must Fix)
1. **buildSchedule.ts:161-185 - Implement alignment rules**
   - Current: `stateOffsetMap.set(entry.stateId, idx);`
   - Required: Calculate aligned offsets based on entry size/alignment
   - Pseudocode from PLAN (lines 127-149):
     ```typescript
     let currentOffset = 0;
     for (const entry of stateLayout) {
       currentOffset = Math.ceil(currentOffset / entry.alignment) * entry.alignment;
       stateOffsetMap.set(entry.stateId, currentOffset);
       currentOffset += entry.sizeBytes;
     }
     ```
   - Also need: Add alignment field to StateLayoutEntry type
   - Test: Create state with different alignments, verify offsets are aligned

2. **IRBuilderImpl.ts - Add StateDeclConflict detection**
   - Location: `allocState()` method (pushes to stateLayout array)
   - Check: Before pushing, verify stateId not already in array
   - If duplicate: Check if size/type match → error if different
   - Error message: "StateDeclConflict: stateId 'X' already declared with different size (expected Y, got Z)"
   - Alternative location: resolveStateOffsets() could detect duplicates
   - Test: Try to allocate same stateId twice with different sizes → error

### MEDIUM (Should Address)
3. **state-offset-resolution.test.ts - Add conflict test**
   - Add test case for StateDeclConflict scenario
   - Manually create IR with duplicate stateId (different sizes)
   - Verify compile error thrown
   - Expected: `expect(() => buildCompiledProgram(...)).toThrow(/StateDeclConflict/)`

4. **StateLayoutEntry type - Add alignment and sizeBytes fields**
   - Current: Only has stateId, type, initial, debugName
   - Required: Add alignment (4 or 16) and sizeBytes fields
   - Location: `builderTypes.ts` (StateLayoutEntry interface)
   - Usage: resolveStateOffsets() needs these to calculate aligned offsets

### LOW (Nice to Have)
5. **SigStateful.test.ts - Consider refactoring to use buildCompiledProgram**
   - Current: Manual IR construction with explicit stateOffset
   - Ideal: Compile through full pipeline (would remove manual workarounds)
   - Tradeoff: Unit tests would become integration tests (slower, more complex)
   - Decision: Defer - current approach is acceptable for runtime unit tests

## Questions Needing Answers (if PAUSE)
Not applicable - issues are clear implementation gaps, not ambiguities.

## Recommended Next Steps
1. Add alignment and sizeBytes fields to StateLayoutEntry type
2. Update allocState() to populate alignment/sizeBytes based on type
3. Implement alignment calculation in resolveStateOffsets()
4. Add StateDeclConflict detection (choose location: allocState or resolveStateOffsets)
5. Add test for alignment (create mixed scalar/buffer state, verify offsets)
6. Add test for StateDeclConflict (duplicate stateId with different sizes)
7. Re-run `just check` to verify all tests still pass
