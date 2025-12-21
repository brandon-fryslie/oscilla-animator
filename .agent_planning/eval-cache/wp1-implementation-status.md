# WP1 Implementation Status (Cached Knowledge)

**Last Updated**: 2025-12-21 13:35
**Source**: project-evaluator (WP1 status evaluation)
**Confidence**: HIGH (comprehensive code review + spec comparison)

---

## Implementation Completeness

**Overall**: 85% COMPLETE - Core works, missing spec-defined features

### What Works (Reuse Freely)

#### TimeRoot Block Definitions ✅
- All three types defined: FiniteTimeRoot, CycleTimeRoot, InfiniteTimeRoot
- File: `src/editor/blocks/time-root.ts`
- Using new input/output system with defaultSource
- Auto-registered in block registry

#### TimeRoot Compilers ✅
- All three compilers implemented and tested
- File: `src/editor/compiler/blocks/domain/TimeRoot.ts`
- Mathematical correctness verified (phase via modulo arithmetic)
- Tests: 259 lines of unit tests with good coverage

#### TimeModel Inference ✅
- Inference from TimeRoot blocks works
- Validation enforces exactly-one-TimeRoot (when flag enabled)
- File: `src/editor/compiler/compile.ts` (lines 374-528)
- Feature flag `requireTimeRoot: true` ENABLED

#### Player Integration ✅
- Player.applyTimeModel() implemented correctly
- Monotonic time advancement for cyclic/infinite
- TimeModel flows from compiler to player via PreviewPanel
- Files: `player.ts`, `PreviewPanel.tsx`

#### Auto-Insert Default TimeRoot ✅
- RootStore.clearPatch() auto-inserts CycleTimeRoot (8s period)
- Prevents immediate compile error on new patch
- File: `src/editor/stores/RootStore.ts` (lines 262-270)

### What's Missing (Don't Assume These Exist)

#### Missing TimeRoot Outputs ❌
CycleTimeRoot spec defines 5 outputs, only 2 implemented:
- ✅ systemTime
- ✅ phase
- ❌ cycleT (cycle-local time)
- ❌ wrap (Event)
- ❌ cycleIndex (Signal<number>)

**Impact**: Cannot detect wrap events, cannot auto-publish to pulse bus.

#### Bus Auto-Publication ❌
Spec requires CycleTimeRoot to automatically publish:
- phase -> phaseA bus
- wrap -> pulse bus

**Current State**: Does NOT exist. No auto-publication logic in compiler.

**Blocker**: Needs WP0 (reserved bus enforcement) to be safe.

#### Optional TimeRoot Inputs ❌
Spec defines optional inputs for phase manipulation:
- phaseOffset: Signal<phase>
- drift: Signal<number>

**Current State**: Not implemented. Scrubbing sets player.tMs directly instead.

### Tech Debt to Clean

#### Legacy Inference Paths
- PhaseMachine inference (compile.ts lines 484-503)
- PhaseClock inference (compile.ts lines 505-521)
- Default infinite fallback (compile.ts lines 523-527)

**Why Still There**: Backward compatibility before requireTimeRoot enforcement.

**Safe to Remove**: Yes, with requireTimeRoot=true, these paths are unreachable.

#### Deprecated Player Properties
- loopMode: LoopMode (line 90)
- playDirection: number (line 92)
- Legacy fallback code (lines 558-581)

**Safe to Remove**: Yes, TimeModel always exists with requireTimeRoot=true.

---

## Dependency Status

### WP0: Lock the Contracts [NOT STARTED]
- Directory empty: `.agent_planning/wp0-lock-contracts/`
- Needed for: Reserved bus type enforcement
- Blocks: Safe bus auto-publication implementation

### bus-semantics-module [NOT STARTED]
- Directory empty: `.agent_planning/bus-semantics-module/`
- Needed for: Canonical bus combination logic (last, sum, or)
- Blocks: Correct multi-publisher bus behavior

---

## Known Ambiguities

### TimeModel Update Timing
**Spec Conflict**:
- Says: "immediate rebuild and hot-swap" (time-root.ts comment)
- Also says: "scheduled at pulse boundary" (Golden Patch acceptance criteria)

**Current**: Immediate rebuild on param change.

**Impact**: Period changes can cause visual jank without scheduling.

### Default TimeRoot Type Choice
**Current**: Auto-insert CycleTimeRoot (8s period)

**Alternatives**: FiniteTimeRoot (simpler for beginners?) or InfiniteTimeRoot (generative focus?)

**Rationale for Current**: Matches Golden Patch spec.

---

## Test Coverage

**Unit Tests**: ✅ Excellent
- TimeRoot.test.ts: 259 lines, comprehensive

**Integration Tests**: ❌ Missing
- Bus auto-publication (once implemented)
- Wrap event emission (once implemented)
- TimeConsole UI mode switching (visual test)

**Runtime Checks**: ⚠️ Manual Visual Test Needed
- TimeConsole actually switches UI for Finite/Cycle/Infinite modes
- Current: Code structure correct, runtime behavior unverified

---

## Reuse Confidence

**HIGH Confidence (safe to reuse)**:
- TimeRoot block definitions are stable
- Compiler math is correct (phase via modulo)
- Player time advancement is monotonic
- TimeModel inference works correctly
- Feature flag state (requireTimeRoot=true)

**MEDIUM Confidence (verify before reusing)**:
- TimeConsole UI mode switching (needs visual test)
- Scrubbing behavior (works but less elegant than spec vision)

**LOW Confidence (don't reuse, implementation incomplete)**:
- Bus auto-publication (doesn't exist yet)
- Wrap event emission (output missing)
- Phase offset injection (input missing)

---

## Quick Reference: File Locations

**Core Files**:
- Block defs: `src/editor/blocks/time-root.ts`
- Compilers: `src/editor/compiler/blocks/domain/TimeRoot.ts`
- Tests: `src/editor/compiler/blocks/domain/__tests__/TimeRoot.test.ts`
- Inference: `src/editor/compiler/compile.ts` (lines 374-528)
- Player: `src/editor/runtime/player.ts` (lines 406-429, 522-581)
- Auto-insert: `src/editor/stores/RootStore.ts` (lines 262-270)
- UI: `src/editor/components/TimeConsole.tsx`

**Spec Reference**:
- `design-docs/3-Synthesized/02-Time-Architecture.md`
- `design-docs/3-Synthesized/10-Golden-Patch.md`
