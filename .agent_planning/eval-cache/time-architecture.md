# Time Architecture (Cached Knowledge)

**Last Updated**: 2025-12-21 12:30
**Source**: project-evaluator (time authority evaluation)
**Confidence**: HIGH (reviewed implementation + spec)

---

## Core Time Principle

**Single Truth**: The patch declares time topology. The player obeys it.

**Player's Job** (EXACTLY):
- Keep transport.tMs (monotonic, unbounded)
- Provide transport.playState (playing/paused)
- Provide transport.scrubTMs when scrubbing
- Pass transport into program evaluation context

**Player Does NOT**:
- Decide loop structure
- Define duration or wrap points
- Control phase semantics

---

## TimeRoot Types

| Type | Outputs | TimeModel | Use Case |
|------|---------|-----------|----------|
| FiniteTimeRoot | systemTime, progress | `{ kind: 'finite', durationMs }` | Logo stingers, one-shots |
| CycleTimeRoot | systemTime, phase | `{ kind: 'cyclic', periodMs, mode }` | Ambient loops, music viz |
| InfiniteTimeRoot | systemTime | `{ kind: 'infinite', windowMs }` | Generative, evolving |

**Files**:
- Block definitions: `src/editor/blocks/time-root.ts`
- Compilers: `src/editor/compiler/blocks/domain/TimeRoot.ts`

---

## TimeModel Contract

**Definition** (`src/editor/compiler/types.ts:82`):
```typescript
type TimeModel =
  | { kind: 'finite'; durationMs: number; cuePoints?: CuePoint[] }
  | { kind: 'cyclic'; periodMs: number; phaseDomain: '0..1'; mode?: 'loop' | 'pingpong' }
  | { kind: 'infinite'; windowMs: number }
```

**Production**: Compiler infers from TimeRoot block
**Consumption**: Player.applyTimeModel() sets maxTime for UI framing

**maxTime Semantics** (CRITICAL):
- **Finite**: Duration - player pauses at end (unless finiteLoopMode=true)
- **Cyclic**: Period - UI framing ONLY, NOT time wrapping
- **Infinite**: Preview window - UI framing ONLY

---

## Player Time Advancement (Implemented Correctly)

**File**: `src/editor/runtime/player.ts` (lines 522-556)

```typescript
if (this.timeModel) {
  switch (this.timeModel.kind) {
    case 'cyclic':
      // Monotonic - just clamp to non-negative
      if (this.tMs < 0) this.tMs = 0;
      break;
    case 'infinite':
      // Monotonic - just clamp to non-negative
      if (this.tMs < 0) this.tMs = 0;
      break;
    case 'finite':
      // Can pause at end or loop back to start
      if (this.tMs >= this.maxTime && !this.finiteLoopMode) {
        this.tMs = this.maxTime;
        this.pause();
      } else if (this.tMs >= this.maxTime && this.finiteLoopMode) {
        this.tMs = this.tMs % this.maxTime;
      }
      if (this.tMs < 0) this.tMs = 0;
      break;
  }
}
```

**Key Invariant**: For cyclic/infinite, `this.tMs` NEVER wraps. It advances unbounded.

---

## Phase Derivation (TimeRoot Compilers)

**CycleTimeRoot Phase Output**:
```typescript
const phase: SignalNumber = (tMs) => {
  if (tMs < 0) return 0;
  const cycles = tMs / periodMs;
  const phaseValue = cycles - Math.floor(cycles); // 0..1
  if (mode === 'pingpong') {
    const cycleNum = Math.floor(cycles);
    return (cycleNum % 2 === 0) ? phaseValue : (1 - phaseValue);
  }
  return phaseValue; // Loop mode
};
```

**Mathematical Correctness**: Modulo arithmetic applied to MONOTONIC tMs produces correct wrapped phase.

**Why This Works**:
- Player provides: tMs = 0, 1000, 2000, 3000, 4000, 5000, ... (unbounded)
- CycleTimeRoot (period=3000) derives: phase = 0, 0.33, 0.67, 0, 0.33, 0.67, ... (wrapped)
- No player wrapping needed

---

## Legacy Concerns (To Be Removed)

**Deprecated Player Properties**:
- `loopMode: LoopMode` - Ignored when TimeModel set (deprecated, lines 52, 90)
- `maxTime: number` - Still used for UI, but semantics changed (line 91)
- `playDirection: number` - Only used in legacy pingpong mode (line 92)

**Deprecated Compiler Paths**:
- PhaseClock inference fallback (`compileBusAware.ts:782-798`) - Should not exist
- PhaseMachine inference fallback (`compileBusAware.ts:762-779`) - Should not exist
- Default infinite fallback (`compileBusAware.ts:801-804`) - Should error instead

**Why Deprecated Paths Exist**: Backward compatibility before `requireTimeRoot=true`

---

## Feature Flag (Current Blocker)

**File**: `src/editor/compiler/featureFlags.ts`

**Current State**:
```typescript
export const DEFAULT_FLAGS: FeatureFlags = {
  requireTimeRoot: false, // ← Needs to be TRUE
  // ...
};
```

**When Flag is TRUE**:
- Validator.validateTimeRootConstraint() enforced
- Compiler errors if no TimeRoot present
- Legacy inference paths never reached

**Migration Path**:
1. Flip flag to true
2. Auto-insert default TimeRoot on patch creation
3. Remove legacy inference code

---

## Scrubbing Behavior

**Finite/Cyclic** (scrub-safe):
- Scrubbing sets `player.tMs` directly
- TimeRoot computes phase from scrubbed time
- Result: deterministic, instant preview

**Infinite** (windowed scrub):
- Scrubbing within `windowMs` preview range
- tMs can be any value (unbounded)
- Phase still derived correctly

**Stateful Blocks** (future):
- May need runtime mode detection (scrub vs play)
- Current architecture supports this via RuntimeCtx

---

## References

**Spec Docs**:
- `design-docs/10-Refactor-for-UI-prep/3-Time.md` - Full time authority spec
- `design-docs/10-Refactor-for-UI-prep/3.5-PhaseClock-Fix.md` - PhaseClock replacement guide

**Implementation Files**:
- `src/editor/runtime/player.ts` - Player transport (lines 1-750)
- `src/editor/compiler/blocks/domain/TimeRoot.ts` - TimeRoot compilers
- `src/editor/compiler/compile.ts` - TimeModel inference (line 437)
- `src/editor/compiler/compileBusAware.ts` - Bus-aware inference (line 760)

**Tests**:
- `src/editor/compiler/blocks/domain/__tests__/TimeRoot.test.ts` - Compiler correctness

---

## Stability Notes

**What's Stable** (safe to reuse):
- TimeRoot compiler logic (mathematically proven correct)
- Player time advancement for cyclic/infinite (commit 1857bb8)
- TimeModel type definition and semantics
- Phase derivation via modulo arithmetic

**What's In Flux**:
- requireTimeRoot flag (will flip to true)
- Legacy inference paths (will be removed)
- loopMode UI (will move to TimeRoot inspector)
- Default TimeRoot auto-insertion (implementation pending)

**Reuse Confidence**: HIGH for stable parts, MEDIUM for in-flux parts (check flag state)
