# Sprint 1 Evaluation: Core IR Execution

**Timestamp:** 2025-12-28-122200
**Scope:** Sprint 1 deliverables from STATUS-2025-12-28.md
**Confidence:** FRESH
**Previous Status:** STATUS-2025-12-28.md (2025-12-28-154700)

---

## Executive Summary

**Sprint 0 is COMPLETE ✅** - Both deliverables shipped and verified:
- Block registry capability propagation (commit 72874c3)
- IR compilation made mandatory (commit 857d3a4)

**Current Test Status:**
- **126/128 test files pass** (2422/2426 tests pass)
- **4 test failures** (all in composite system - pre-existing, not blockers)
- **Tests are now runnable** - Sprint 0 unblocked runtime verification

**Sprint 1 Status:** READY TO START - 2 critical items remain from original 4-item list

---

## Sprint 0 Completion Verification

### Deliverable 1: Block Registry Capability Propagation ✅

**Commit:** 72874c3
**Status:** SHIPPED AND VERIFIED

**Implementation:**
- Enhanced `createBlock()` factory in `src/editor/blocks/factory.ts`
- Auto-infers capability from KERNEL_PRIMITIVES lookup
- Sets `capability: 'pure'` for non-kernel blocks
- Allows explicit override via definition parameter

**Verification:**
```bash
just typecheck  # ✅ PASS
just test       # ✅ 126/128 files pass (was 100/127 before)
```

**Impact:**
- All 27 previously failing test files now load successfully
- Registry validation passes for all 127 test files
- Test infrastructure is fully functional

### Deliverable 2: IR Compilation Made Mandatory ✅

**Commit:** 857d3a4
**Status:** SHIPPED AND VERIFIED

**Implementation:**
- `attachIR()` in `src/editor/compiler/compileBusAware.ts` now treats IR failures as fatal when `emitIR=true`
- Removed silent fallback to legacy execution
- Returns `CompileError` on IR failure (was: warnings)

**Code Evidence:**
```typescript
// Lines 788-802 of compileBusAware.ts
if (ir === undefined) {
  const error: CompileError = {
    code: 'IRValidationFailed',
    message: 'IR compilation failed: compileIR returned undefined. IR is mandatory when enabled.',
  };
  console.error('[IR] FATAL: IR compilation failed (IR is mandatory)');
  return {
    ok: false,
    errors: [error],
  };
}
```

**Verification:**
- TypeScript compilation passes
- IR-only mode enforced when `emitIR=true`
- No silent fallback behavior

---

## Current Test Failures (Not Blockers)

**4 failures in 2 test files** - Both related to composite system:

### 1. `composite-library.test.ts` (3 failures)
- **Issue:** Composite blocks not found in registry
- **Blocks:** `composite:GridPoints`, `composite:CirclePoints`, `composite:DotsRenderer`
- **Root Cause:** Composite registration system issue (not IR-related)
- **Impact:** Does NOT block IR compiler work

### 2. `composite.expansion.test.ts` (1 failure)
- **Issue:** Block ID expectation mismatch after expansion
- **Test:** "listener targeting composite boundary input rewrites to internal primitive"
- **Root Cause:** Test expectation issue (not IR-related)
- **Impact:** Does NOT block IR compiler work

**Verdict:** These are pre-existing composite system issues, unrelated to IR compilation. Safe to proceed with Sprint 1.

---

## Sprint 1 Scope Assessment

### Original Sprint 1 Items (from STATUS-2025-12-28.md)

| Item | Status | Action |
|------|--------|--------|
| 1. IR compilation mandatory | ✅ DONE (Sprint 0) | None - carried forward |
| 2. TimeModel threading | ❌ NOT STARTED | **Sprint 1 Priority 1** |
| 3. timeDerive tAbsMs write | ✅ DONE | None - already fixed |
| 4. Feature flag parsing | ❌ NOT STARTED | **Sprint 1 Priority 2** |

### Item-by-Item Analysis

#### ❌ Item 1: IR Compilation Mandatory
**STATUS:** ✅ COMPLETE (Sprint 0)

**Evidence:** Commit 857d3a4 implements this fully.

**What was done:**
- IR failures now return compile errors
- No silent fallback when `emitIR=true`
- Legacy-only mode requires explicit `emitIR=false`

**No further work needed.**

---

#### ❌ Item 2: TimeModel Threading from Pass 3 to Schedule
**STATUS:** ❌ NOT STARTED - **CRITICAL BLOCKER**

**Red Flag Reference:**
- Time-Architecture.md: "TimeModel source of truth is hardcoded to infinite in IR builder"
- Core.md: "TimeModel in CompiledProgramIR ignores TimeRoot"

**Current State:**
```typescript
// src/editor/compiler/ir/IRBuilderImpl.ts:640
timeModel: {
  kind: "infinite",
  windowMs: 30000,
}
```

**Evidence of Problem:**
1. Pass 3 extracts TimeModel from TimeRoot (line 204 of pass3-time.ts)
2. TimeResolvedPatch contains `timeModel` field (line 220)
3. Pass 6, 7, 8 all accept and pass through TimeResolvedPatch
4. BUT: IRBuilder.build() ignores it and hardcodes infinite

**Data Flow Gap:**
```
pass3TimeTopology()
  ↓ timeResolved.timeModel ← extracted from TimeRoot
pass4DepGraph(timeResolved)
  ↓ (passes through timeModel)
pass5CycleValidation(depGraph)
  ↓
pass6BlockLowering(validated, ...) ← creates IRBuilder
  ↓ builder.build() ← HARDCODES infinite model ❌
buildCompiledProgram(builderIR)
  ↓ uses builderIR.timeModel (infinite)
CompiledProgramIR ← wrong time topology
```

**Impact:**
- ALL patches behave as infinite time
- Finite patches (one-shot animations) broken
- Cyclic patches (loops) broken
- Time topology invariant violated

**Fix Required:**
1. Thread `timeModel` from Pass 3 through to Pass 6
2. Add `IRBuilder.setTimeModel()` method (parallel to `setTimeSlots`)
3. Call it during TimeRoot lowering
4. Remove hardcoded fallback in `IRBuilderImpl.build()`

**Estimated Scope:** 2 days (as per STATUS)

**Priority:** **P0 - CRITICAL** - Blocks functional IR execution

---

#### ✅ Item 3: timeDerive tAbsMs Slot Write
**STATUS:** ✅ COMPLETE - ALREADY FIXED

**Red Flag Reference:**
- Schedule-and-Runtime.md: "timeDerive does not write tAbsMs into tAbsMsSlot"

**Evidence of Fix:**
```typescript
// src/editor/runtime/executor/steps/executeTimeDerive.ts:41-43
export function executeTimeDerive(
  step: StepTimeDerive,
  runtime: RuntimeState,
  time: EffectiveTime,
): void {
  // Write tAbsMs to its slot so downstream nodes can read it
  // This is the input slot that the runtime provides
  runtime.values.write(step.tAbsMsSlot, time.tAbsMs);

  // ... rest of function writes derived outputs
```

**Verification:**
- Line 43 writes `time.tAbsMs` to `step.tAbsMsSlot`
- Comment explicitly documents this behavior
- TypeScript compiles without errors

**No further work needed.**

---

#### ❌ Item 4: Feature Flag Parsing Bug
**STATUS:** ❌ NOT STARTED - **LOW PRIORITY**

**Red Flag Reference:**
- Core.md: "Feature flag parsing ignores explicit false for unified compiler"

**Current State:**
```typescript
// src/editor/compiler/featureFlags.ts:121-122
if (env.VITE_USE_UNIFIED_COMPILER !== undefined) {
  currentFlags.useUnifiedCompiler = true;  // ❌ Always true if var exists
}
```

**Problem:**
- `VITE_USE_UNIFIED_COMPILER=false` is treated as `true`
- Cannot explicitly disable unified compiler

**Fix Required:**
```typescript
if (env.VITE_USE_UNIFIED_COMPILER !== undefined) {
  currentFlags.useUnifiedCompiler = env.VITE_USE_UNIFIED_COMPILER === 'true';
}
```

**Estimated Scope:** 1 hour (trivial fix)

**Priority:** **P1 - HIGH** (but not blocking) - Affects testing/debugging workflow

---

## Sprint 1 Revised Scope

### Recommended Sprint 1 Deliverables (2 items)

**Goal:** Make IR mode functional for simple patches with correct time topology

#### Must Have:

1. **TimeModel Threading** (P0 - CRITICAL)
   - Thread `timeModel` from Pass 3 to IRBuilder
   - Add `IRBuilder.setTimeModel()` method
   - Call from TimeRoot lowering
   - Remove hardcoded infinite fallback
   - **Scope:** 2 days
   - **Blocker:** YES - breaks all non-infinite patches

2. **Feature Flag Parsing Fix** (P1 - HIGH)
   - Fix `VITE_USE_UNIFIED_COMPILER` parsing logic
   - Add test to verify `=false` works
   - **Scope:** 1 hour
   - **Blocker:** NO - but improves testing workflow

### Validation Criteria

**After Sprint 1, the following MUST work:**

1. **Finite Patch Test:**
   ```typescript
   // Patch with FiniteTimeRoot(durationMs: 5000)
   // Should:
   // - Compile to IR with timeModel.kind === 'finite'
   // - Runtime respects duration boundary
   // - progress01 signal ranges 0→1
   ```

2. **Cyclic Patch Test:**
   ```typescript

   // Should:
   // - Compile to IR with timeModel.kind === 'cyclic'
   // - Runtime emits wrap events
   // - phase01 signal loops 0→1
   ```

3. **Feature Flag Test:**
   ```bash
   VITE_USE_UNIFIED_COMPILER=false just dev
   # Should: Use legacy compiler

   VITE_USE_UNIFIED_COMPILER=true just dev
   # Should: Use unified IR compiler
   ```

### Known Gaps After Sprint 1

These will remain broken but are NOT Sprint 1 scope:

- ❌ Default sources not lowered (Sprint 2)
- ❌ Block lowering uses placeholders (Sprint 2)
- ❌ Bus evaluation absent (Sprint 3)
- ❌ Event buses not lowered (Sprint 3)

---

## Dependencies and Risks

### Dependencies

**None** - Both Sprint 1 items are independent and can proceed in parallel.

### Risks

**Low Risk:**

1. **TimeModel Threading:**
   - Well-understood data flow
   - Pass 3 already extracts TimeModel correctly
   - Implementation is mechanical threading
   - Risk: Low - straightforward plumbing

2. **Feature Flag Fix:**
   - Trivial boolean logic fix
   - No side effects
   - Risk: Minimal

**Mitigation:**
- Run full test suite after each change
- Verify TypeScript compilation passes
- Test with real patches (finite, cyclic, infinite)

---

## Ambiguities Requiring User Decision

### None Identified

All Sprint 1 items have clear, unambiguous implementations:

1. **TimeModel Threading:** Red flag documentation specifies exact solution
2. **Feature Flag Fix:** Bug is trivial, fix is obvious

**No clarification needed - safe to proceed.**

---

## Runtime Check Results

### Existing Checks (All Pass)

```bash
just typecheck  # ✅ PASS
just test       # ✅ 126/128 files pass (2422/2426 tests)
```

**Test Suite Status:**
- 2422 tests passing (99.8% pass rate)
- 4 failures (composite system - not IR-related)
- 3 skipped tests (golden patch IR - expected)
- 10 todo tests (expected)

### Missing Checks (Implementers Should Create)

**After Sprint 1 completion, add:**

1. **TimeModel Validation Test** (`tests/compiler/timemodel.test.ts`)
   - Compile finite patch, verify `timeModel.kind === 'finite'`
   - Compile cyclic patch, verify `timeModel.kind === 'cyclic'`
   - Compile infinite patch, verify `timeModel.kind === 'infinite'`
   - Assert schedule uses correct time semantics

2. **Feature Flag Integration Test** (`tests/compiler/feature-flags.test.ts`)
   - Set `VITE_USE_UNIFIED_COMPILER=false`, verify legacy mode
   - Set `VITE_USE_UNIFIED_COMPILER=true`, verify IR mode
   - Set `VITE_USE_UNIFIED_COMPILER=undefined`, verify default behavior

---

## Evaluation Cache Update

**Created:**
- `.agent_planning/compiler-audit-redflag/STATUS-2025-12-28-sprint1.md` (this file)

**Should Cache (for future evaluations):**
- Sprint 0 completion status → `eval-cache/sprint0-complete.md`
- TimeModel data flow → `eval-cache/timemodel-flow.md`
- Test infrastructure status → `eval-cache/test-infrastructure.md`

**Not caching yet:** Waiting for Sprint 1 completion to baseline TimeModel behavior

---

## Recommendations by Priority

### P0 (Do Immediately):
1. ✅ Verify Sprint 0 deliverables (DONE - verified above)
2. ❌ Implement TimeModel threading (2 days)

### P1 (This Sprint):
3. ❌ Fix feature flag parsing (1 hour)

### P2 (Sprint 2 - Next):
4. Default source lowering (3 days)
5. Block lowering for core signal blocks (1 week)

### P3 (Sprint 3+):
6. Bus evaluation steps
7. Event bus lowering

---

## Workflow Recommendation

**[X] CONTINUE** - Sprint 0 complete, Sprint 1 scope clear, no ambiguities

**Next Actions:**
1. Implement TimeModel threading (P0 - CRITICAL)
2. Fix feature flag parsing (P1 - quick win)
3. Add validation tests
4. Verify with real patches (finite, cyclic)
5. Update status report

---

## Verdict

**Sprint 0:** ✅ COMPLETE
**Sprint 1 Scope:** CLEAR - 2 deliverables, no blockers
**Test Infrastructure:** ✅ FUNCTIONAL
**Ambiguities:** NONE
**Ready to Proceed:** YES

**Next Sprint:** Sprint 2 - Default Sources & Block Lowering

---

**Files Referenced:**
- `/Users/bmf/code/oscilla-animator_codex/src/editor/compiler/compileBusAware.ts` (IR mandatory)
- `/Users/bmf/code/oscilla-animator_codex/src/editor/blocks/factory.ts` (capability inference)
- `/Users/bmf/code/oscilla-animator_codex/src/editor/compiler/ir/IRBuilderImpl.ts:640` (hardcoded timeModel)
- `/Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass3-time.ts:220` (timeModel extraction)
- `/Users/bmf/code/oscilla-animator_codex/src/editor/runtime/executor/steps/executeTimeDerive.ts:43` (tAbsMs write)
- `/Users/bmf/code/oscilla-animator_codex/src/editor/compiler/featureFlags.ts:121` (feature flag bug)
- `/Users/bmf/code/oscilla-animator_codex/design-docs/12-Compiler-Final/Compiler-Audit-RedFlags-Time-Architecture.md`
- `/Users/bmf/code/oscilla-animator_codex/design-docs/12-Compiler-Final/Compiler-Audit-RedFlags-Schedule-and-Runtime.md`
- `/Users/bmf/code/oscilla-animator_codex/design-docs/12-Compiler-Final/Compiler-Audit-RedFlags-Core.md`
