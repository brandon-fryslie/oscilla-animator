# IR Primitives Implementation Status (Cached Knowledge)

**Last Updated**: 2025-12-30 02:31
**Source**: project-evaluator (comprehensive spec analysis)
**Confidence**: HIGH (fresh evaluation of all 11 specs)

---

## Gap Summary

**Total Gaps**: 74 across 11 SPEC files
**Current Implementation**: ~30%
**Critical Gaps (Tier 0)**: 5 gaps blocking basic execution
**High Priority (Tier 1)**: 12 gaps blocking major features
**Polish (Tier 2)**: 14 gaps for edge cases
**New Features (Tier 3)**: 15 gaps for export/debug

---

## Infrastructure Status

**What Exists** ✅:
- IR type definitions (schedule.ts, fieldExpr.ts, signalExpr.ts)
- StepBusEval and StepEventBusEval types declared
- TimeModel parameter threaded through buildSchedule
- Value store, state buffer, field materializer
- Test infrastructure (vitest, all tests passing)

**What's Missing** ❌:
- FieldExprZipSig, FieldExprMapIndexed node types
- Transform chain evaluation in materializer
- Stateful signal evaluators (delayFrames, pulseDivider, etc.)
- Default source materialization
- Many block lowering functions emit placeholders

---

## Critical Path (Tier 0 - Must Fix First)

### 1. TimeModel Hardcoded to Infinite (SPEC-05)
**Status**: ⚠️  PARTIAL (passed but not used?)
**Evidence**:
- `buildSchedule.ts:222,433` - TimeModel IS passed
- `time-architecture.md` cache (2025-12-21) - mentions correct player behavior
- But: Need to verify executor actually uses it
**Fix**: Sprint 1 - Pass 3 TimeRoot extraction

### 2. Bus Evaluation Never Runs (SPEC-07)
**Status**: ⚠️  PARTIAL (types exist, emission unclear)
**Evidence**:
- `schedule.ts:124-125,268,349` - StepBusEval types EXIST
- `buildSchedule.ts:14` - comment says "NOT emitted"
- Need verification: does schedule builder actually emit these?
**Fix**: Sprint 3 - Emit busEval steps

### 3. Default Sources Not Materialized (SPEC-08)
**Status**: ❌ NOT FIXED
**Evidence**: No defaultSource materialization in pass6
**Fix**: Sprint 2 - Default source resolution

### 4. Transform Chains Throw (SPEC-02)
**Status**: ❌ NOT FIXED
**Evidence**: `Materializer.ts:1145-1179` - throws error
**Fix**: Sprint 5 - Transform chain evaluation

### 5. Signal Table May Be Null (SPEC-09)
**Status**: ⚠️  LIKELY FIXED (recent work)
**Evidence**: CompiledProgramIR extended with SignalExpr IR
**Fix**: Verify in Sprint 1

---

## High Priority Features (Tier 1a)

### 6. FieldExprZipSig (field+signals) (SPEC-01)
**Status**: ❌ NOT IMPLEMENTED
**Evidence**: No files contain "FieldExprZipSig"
**Fix**: Sprint 4

### 7. FieldExprMapIndexed (SPEC-01)
**Status**: ❌ NOT IMPLEMENTED
**Evidence**: No files contain "FieldExprMapIndexed"
**Fix**: Sprint 4

### 8. ColorHSLToRGB Kernel (SPEC-03)
**Status**: ❌ NOT IMPLEMENTED
**Fix**: Sprint 8

### 9. Field Reduce Placeholder (SPEC-02)
**Status**: ❌ PLACEHOLDER
**Evidence**: `IRBuilderImpl.ts:537-557` - ignores field input
**Fix**: Sprint 5

### 10. TypeDesc Duplicate Definitions (SPEC-06)
**Status**: ❌ TWO DEFINITIONS EXIST
**Locations**:
- `compiler/ir/types.ts`
- `editor/ir/types/TypeDesc.ts`
**Fix**: Sprint 6

### 11. Adapters Not Applied (SPEC-06)
**Status**: ❌ IGNORED
**Fix**: Sprint 6

---

## Known Ambiguities

### Ambiguity 1: TimeModel Runtime Usage
**Question**: Is TimeModel actually consumed by executor or just passed through?
**Evidence**:
- TimeModel IS threaded to schedule (verified)
- Cached time-architecture.md (2025-12-21) suggests player behavior correct
- But: No grep confirms executor reads TimeModel from schedule
**Resolution Needed**: Trace TimeModel from schedule to wrap detection

### Ambiguity 2: BusEval Emission Gap
**Question**: Does buildSchedule actually emit StepBusEval or is comment stale?
**Evidence**:
- Types exist in schedule.ts ✅
- `buildSchedule.ts:14` comment says not emitted ❌
- No grep found actual emission code
**Resolution Needed**: Test bus-heavy patch, inspect compiled schedule

---

## 20-Sprint Roadmap (71-90 days)

### Phase 1: Make IR Execute (Sprints 1-6) - 22-27 days
1. Time Architecture Foundation
2. Default Sources & TimeModel Integration
3. Bus System Revival
4. Field-Signal Combination Primitives
5. Transform Chains & Field Reduce
6. Type System Unification

### Phase 2: Complete Features (Sprints 7-10) - 15-19 days
7. Stateful Signal Evaluators
8. Non-Numeric Signal & Field Support
9. Path Fields & Dynamic Operations
10. Event System & Discrete Signals

### Phase 3: Polish & Render (Sprints 11-14) - 12-16 days
11. Render Ordering & Attributes
12. Advanced Rendering
13. PostFX & Materials
14. Field Runtime Polish

### Phase 4: Compiler (Sprints 15-16) - 7-9 days
15. Compiler Pass Improvements
16. Placeholder Elimination

### Phase 5: Export (Sprints 17-18) - 9-11 days
17. Deterministic Replay Foundation
18. Export Pipeline Implementation

### Phase 6: Debug (Sprints 19-20) - 6-8 days
19. IR-Compatible Debugging
20. Advanced Visualization & Diagnostics

---

## Risk Assessment

**High Risk**:
- TimeModel integration (Sprint 1-2) - need runtime verification
- Bus evaluation emission (Sprint 3) - need schedule verification
- Placeholder audit (Sprint 16) - potentially large scope

**Medium Risk**:
- Transform chain complexity (Sprint 5) - many step types
- PostFX rendering (Sprint 13) - browser support varies

**Low Risk**:
- Export pipeline (Sprint 18) - clear API, fallbacks available

---

## Dependencies

**Critical Path (Must Be Sequential)**:
```
Sprint 1 (TimeRoot)
  → Sprint 2 (Default Sources + TimeModel wiring)
  → Sprint 3 (Bus evaluation)
  → Sprint 4 (FieldExpr primitives)
  → Sprint 5 (Transform chains)
  → Sprint 6 (Type unification)
```

**Parallelizable After Sprint 6**:
- Stream A: Stateful Operations (Sprints 7, 10)
- Stream B: Field Operations (Sprints 8, 9, 14)
- Stream C: Render Pipeline (Sprints 11-13)
- Stream D: Export & Debug (Sprints 17-20, independent after Sprint 6)

---

## Reuse Confidence

**HIGH Confidence** (trust fully):
- SPEC file gap definitions
- Type definitions in codebase
- Test infrastructure status
- Recent git history

**MEDIUM Confidence** (verify before using):
- TimeModel actual usage in runtime
- BusEval emission status
- Placeholder audit completeness

**INVALIDATED** (don't reuse):
- compiler-architecture.md (signal blocks migrated)
- block-compiler-migration.md (P1-8 through P1-13 done)
- rendering-architecture.md (Player.setIRProgram added)

---

## Verification Needed

Before starting Sprint 1:
1. **Verify TimeModel usage**: Trace from schedule → executor → wrap detection
2. **Verify BusEval emission**: Test bus patch, inspect compiled schedule
3. **Audit placeholders**: Complete grep for sigTimeAbsMs() and fieldConst(0)

---

## Related Cache Files

- `time-architecture.md` - Player time behavior (RECENT, 2025-12-21)
- `compilation-triggers.md` - When compilation runs (RECENT, 2025-12-30)
- All other cache files INVALIDATED by recent changes

---

## Next Steps

**Recommended**: Start Sprint 1 after verification
**Alternative**: If export urgent, do Sprint 1 → 17 → 18
**Alternative**: If debugging urgent, do Sprint 1-6 → 19-20
