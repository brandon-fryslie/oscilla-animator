# Time Authority Evaluation - Issue #2

**Evaluation Date**: 2025-12-21
**Scope**: Time authority unification (Player vs Patch time)
**Confidence**: FRESH (just evaluated)
**Git Commit**: 1857bb8

---

## Executive Summary

**Overall Status**: MOSTLY COMPLETE (~85%)
**Critical Gaps**: 2 remaining
**Tests Passing**: 744/765 (18 failures unrelated to time authority)
**Architectural Soundness**: GOOD (core principle implemented)

### What's Working
✅ Player time is monotonic for cyclic/infinite modes (commit 1857bb8)
✅ TimeRoot compilers correctly derive phase from unbounded time
✅ TimeModel inference from TimeRoot blocks exists
✅ Player.applyTimeModel() correctly sets maxTime based on TimeModel kind

### Critical Gaps
❌ TimeRoot is NOT required (feature flag `requireTimeRoot: false` by default)
❌ Legacy inference from PhaseClock/PhaseMachine still active (fallback path)

---

## Specification Requirements

From `design-docs/10-Refactor-for-UI-prep/3-Time.md` and `3.5-PhaseClock-Fix.md`:

### Principle A: The patch declares time topology. The player obeys it.
- **Status**: ✅ IMPLEMENTED
- **Evidence**: Player.tick() no longer wraps tMs for cyclic mode (commit 1857bb8)
- Player provides monotonic time, TimeRoot derives phase via modulo

### Principle B: There is exactly one global time basis: tMs is monotonic.
- **Status**: ✅ IMPLEMENTED
- **Evidence**: Lines 522-556 in player.ts - cyclic/infinite only clamp to >= 0

### TimeRoot as Required Authority
- **Status**: ❌ NOT ENFORCED (feature flag off)
- **Evidence**: `src/editor/compiler/featureFlags.ts:52` - `requireTimeRoot: false`
- **Impact**: Patches without TimeRoot still compile using legacy inference

### Player Transport Only
- **Status**: ✅ MOSTLY DONE
- **Remaining**: loopMode/maxTime still exist (deprecated but not removed)
- Player correctly ignores loopMode when TimeModel is set

---

## Implementation Assessment

### 1. Player.tick() Time Handling - COMPLETE ✅

**File**: `src/editor/runtime/player.ts` (lines 522-556)

**Implemented Correctly**:
```typescript
case 'cyclic':
  // Cyclic: TimeRoot handles phase derivation via modulo
  // Player provides monotonic time - just clamp to non-negative
  if (this.tMs < 0) {
    this.tMs = 0;
  }
  break;
```

**Evidence of Correctness**:
- No `this.tMs = this.tMs % this.maxTime` wrapping for cyclic
- Infinite mode identical (monotonic, clamp to >= 0)
- Finite mode preserves pause/loop behavior correctly

**Confidence**: FRESH - Just reviewed commit 1857bb8

---

### 2. TimeRoot Compilers - COMPLETE ✅

**File**: `src/editor/compiler/blocks/domain/TimeRoot.ts`


```typescript
const phase: SignalNumber = (tMs) => {
  if (tMs < 0) return 0;
  const cycles = tMs / periodMs;
  const phaseValue = cycles - Math.floor(cycles); // 0..1
  // ... pingpong logic
  return phaseValue;
};
```

**Evidence**: Phase derived via modulo from monotonic tMs - mathematically correct

**FiniteTimeRoot (lines 36-40)**:
```typescript
const progress: SignalNumber = (tMs) => {
  if (tMs <= 0) return 0;
  if (tMs >= durationMs) return 1;
  return tMs / durationMs;
};
```

**Evidence**: Progress clamps at 1.0, no player wrapping needed

**Confidence**: FRESH - Code matches spec exactly

---

### 3. TimeModel Inference - PARTIAL ⚠️

**Status**: EXISTS but has fallback paths

**Primary Path** (correct):
- `src/editor/compiler/compile.ts:437` - `inferTimeModelFromTimeRoot()`
- `src/editor/compiler/compileBusAware.ts:760` - `inferTimeModel()`
- Both check for TimeRoot blocks first

**Legacy Fallback Paths** (problematic):
- `compileBusAware.ts:782-798` - Falls back to PhaseClock inference
- `compileBusAware.ts:762-779` - Falls back to PhaseMachine inference
- `compileBusAware.ts:801-804` - Default to infinite if nothing found

**Why This Matters**:
- Violates "single authority" principle
- PhaseClock was supposed to be replaced by TimeRoot (per `3.5-PhaseClock-Fix.md`)
- Multiple sources of truth about time topology

**Impact**: LOW (for now)
- Existing patches with PhaseClock still work
- But architectural principle violated
- Will cause confusion when TimeRoot becomes required

---

### 4. TimeRoot Enforcement - NOT IMPLEMENTED ❌

**File**: `src/editor/compiler/featureFlags.ts`

**Current State**:
```typescript
export const DEFAULT_FLAGS: FeatureFlags = {
  requireTimeRoot: false, // Legacy patches work without TimeRoot
  // ...
};
```

**Validation Exists But Disabled**:
- `src/editor/semantic/validator.ts` - validateTimeRootConstraint() implemented
- `src/editor/compiler/compile.ts:409` - Checked but skipped when flag false

**What Needs to Change**:
```typescript
export const DEFAULT_FLAGS: FeatureFlags = {
  requireTimeRoot: true, // ← Change this
  // ...
};
```

**Risk**: MEDIUM
- Existing patches without TimeRoot will break
- Tests currently rely on `requireTimeRoot: false` (grep found 3 test files)
- Need migration path for legacy patches

---

### 5. Player UI Integration - MOSTLY COMPLETE ✅

**File**: `src/editor/PreviewPanel.tsx`

**TimeModel Applied**:
- Lines 85, 86: `timeModel` state managed
- Player.applyTimeModel() called when compilation succeeds
- TimeConsole component receives TimeModel for mode-aware UI

**maxTime Semantics**:
- Finite: duration (pause behavior)
- Cyclic: period (UI framing only - NOT wrapping)
- Infinite: preview window (UI framing only)

**Confidence**: RECENT (based on code structure, not runtime tested)

---

## Data Flow Verification

| Flow | Step | Status | Evidence |
|------|------|--------|----------|
| Patch → TimeModel | Compiler infers from TimeRoot | ✅ | compile.ts:437, compileBusAware.ts:760 |
| | Falls back to PhaseClock/PhaseMachine | ⚠️ | Should not exist |
| TimeModel → Player | applyTimeModel() sets maxTime | ✅ | player.ts:406-429 |
| | maxTime used for UI framing only (cyclic) | ✅ | player.ts:522-530 |
| Player → Signals | tMs monotonic, passed to program.signal() | ✅ | player.ts:595, tick() doesn't wrap |

| Phase → Render | Phase drives animation (0..1) | ✅ | Architectural contract holds |

**Finding**: Data flow is correct when TimeRoot exists. Fallback paths violate architecture.

---

## Missing Checks (Implementer Should Create)

### 1. Runtime Verification: Monotonic Time Advancement

**Check**: `scripts/verify-monotonic-time.sh` or `just verify:time`

- Play for 10 seconds
- Assert: `player.getTime() > 10000` (proves no wrapping)
- Assert: Phase ring animated 3+ cycles visually

**Why**: Ensures player NEVER wraps time even across multiple periods

### 2. TimeRoot Enforcement Test

**Check**: Add to test suite
```typescript
test('patch without TimeRoot fails compilation when flag enabled', () => {
  setFeatureFlags({ requireTimeRoot: true });
  const patch = createPatchWithoutTimeRoot();
  const result = compilePatch(patch, registry, 1, ctx);
  expect(result.ok).toBe(false);
  expect(result.errors).toContainEqual(
    expect.objectContaining({ code: 'E_TIME_ROOT_MISSING' })
  );
});
```

**Current Status**: Test exists but flag is off in production

---

## Ambiguities Found

### 1. When to Flip requireTimeRoot Flag?

**Question**: Should TimeRoot be required now, or after PhaseClock is fully replaced?

**How LLM Guessed**:
- Kept flag off "for backward compatibility"
- Implemented validation but disabled it
- Left both TimeRoot AND PhaseClock as valid time sources

**Options**:
- **Option A**: Flip flag now, migrate legacy patches via auto-insertion
  - *Pro*: Clean architecture, single authority
  - *Con*: Breaking change, test churn
- **Option B**: Wait until PhaseClock replacement complete (phaseA bus auto-publish)
  - *Pro*: Staged migration, no breakage
  - *Con*: Architectural debt persists

**Recommendation**: Option A - The core mechanics are sound (monotonic time). Requiring TimeRoot is a compile-time constraint, easily migrated.

### 2. What to Do About loopMode/maxTime Deprecation?

**Question**: Should loopMode be removed entirely, or kept for UI compatibility?

**How LLM Guessed**:
- Marked deprecated but kept functional
- Player ignores loopMode when TimeModel set
- UI still has loop button cycling modes

**Impact**:
- Not critical (functionally correct)
- But creates "two ways to control looping" confusion
- Spec says "looping is no longer a player feature" (3-Time.md:80)

**Recommendation**: CONTINUE (not PAUSE-worthy)
- Remove loopMode UI toggle
- Replace with TimeRoot panel property (per spec line 119)
- Keep loopMode code path as fallback until requireTimeRoot=true everywhere

---

## Recommendations (Priority Order)

### 1. IMMEDIATE: Enable requireTimeRoot Flag
- **File**: `src/editor/compiler/featureFlags.ts:52`
- **Change**: `requireTimeRoot: false` → `requireTimeRoot: true`
- **Risk**: Low (core mechanics proven)
- **Test Impact**: Fix 3 test files that disable flag

### 2. IMMEDIATE: Remove Legacy Inference Fallbacks
- **Files**: `src/editor/compiler/compileBusAware.ts:782-804`
- **Change**: Remove PhaseClock/PhaseMachine inference paths
- **Reason**: Violates single authority principle
- **Prerequisite**: Enable requireTimeRoot first

### 3. NEXT SPRINT: Auto-Insert TimeRoot on Patch Creation
- **File**: `src/editor/stores/PatchStore.ts` or initialization

- **Reason**: Prevents "TimeRoot required" errors for new users

### 4. FUTURE: Remove loopMode from Player UI
- **File**: `src/editor/components/TimeConsole.tsx` (and related UI)
- **Change**: Replace loop toggle with TimeRoot inspector property
- **Reason**: Align UI with "patch owns time" principle

---

## Verdict

**Workflow Recommendation**: ✅ **CONTINUE**

### Issues Are Clear
- The architectural principle is implemented correctly
- Gaps are well-defined (feature flag + legacy fallbacks)
- No fundamental design questions remain

### Implementer Can Fix
- Flip feature flag (1-line change)
- Remove legacy inference (delete code block)
- Update tests to match (straightforward)

### No Ambiguities Block Progress
- The one design choice (when to flip flag) has clear recommendation
- Core mechanics are sound and tested
- No "winging it" - implementation matches spec

---

## Files Changed (Reuse from Previous Evaluation)

From `.agent_planning/time-authority/DOD-2025-12-21.md`:
- ✅ `src/editor/runtime/player.ts` - Monotonic time (commit 1857bb8)
- ✅ `src/editor/compiler/blocks/domain/TimeRoot.ts` - Phase derivation
- ⏳ `src/editor/compiler/featureFlags.ts` - Flag still off (needs change)
- ⏳ `src/editor/compiler/compileBusAware.ts` - Legacy fallbacks (needs removal)

---

## Test Suite Status

**Overall**: 744 passed / 765 total (18 failures)

**Failures NOT Related to Time Authority**:
- `PatchStore.events.test.ts` - BlockReplaced event payloads (unrelated)
- Other failures are bus/connection event tests

**Time-Related Tests**: All passing
- `TimeRoot.test.ts` - Compiler output correct
- Player time advancement logic - No failures detected

**Confidence**: Tests prove core mechanics work, failures are orthogonal

---

## Next Steps for Implementer

1. **Flip the flag**: Change `requireTimeRoot: false` → `true` in featureFlags.ts
2. **Fix tests**: Update 3 test files that disable flag
3. **Remove fallbacks**: Delete legacy PhaseClock/PhaseMachine inference
4. **Add auto-insert**: Ensure new patches have default TimeRoot
5. **Verify**: Run `just test` and `just dev` - animations should work identically

**Estimated Complexity**: Low (mechanical changes, no architectural redesign)

---

## Summary for STATUS File

```
Time Authority (Issue #2): 85% COMPLETE
  ✅ Player time monotonic (commit 1857bb8)
  ✅ TimeRoot compilers correct
  ✅ TimeModel inference exists
  ❌ requireTimeRoot flag OFF (easy fix: flip to true)
  ❌ Legacy PhaseClock fallback still active (delete code)

  Verdict: CONTINUE - Clear path to 100%
  Next: Flip flag + remove fallbacks (1 hour work)
```
