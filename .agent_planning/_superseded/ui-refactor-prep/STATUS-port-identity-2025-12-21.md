# Port Identity - Evaluation Report

**Evaluated**: 2025-12-21 12:28
**Scope**: Issue #1 from design-docs/10-Refactor-for-UI-prep/Overview.md
**Evaluator**: project-evaluator
**Confidence**: FRESH

---

## Executive Summary

**Quick Fix Sprint: COMPLETE** ✅
**Architectural Foundation: INCOMPLETE** ⚠️
**Current Build State: BROKEN** ❌ (18 test failures, unrelated to port identity work)

The "quick fix" sprint successfully completed all three goals:
1. ✅ BindingEndpoint migration (70+ usages updated from `.port` to `.slotId + .dir`)

3. ✅ Port validation added to compileBusAware (fail-fast with clear errors)

However, **subsequent work (Semantic Validator, commit e4f3ee7) broke 18 tests** in the PatchStore wire event system. These failures are NOT regressions from the port identity work—they are caused by overly strict preflight validation blocking valid test connections.

The full architectural vision from 2-PortIdentity.md remains unimplemented (composite boundaries, type-based matching, stable slotId versioning).

---

## What the Spec Requires

From `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md`:

### Core Principle
> **One canonical address for "a port"**. Every place in the system references ports the same way. No exceptions.

### End-State Requirements

**1. Canonical PortRef** (Section 3)
```typescript
type PortRef = {
  blockId: BlockId;
  slotId: SlotId;    // stable identity, not label
  dir: 'in' | 'out';
};
```

**2. Composite Boundary Contract** (Section 4)
- Composites are boundaries—expansion never breaks addresses
- External ports remain addressable after internal expansion
- `portMap` in composite definitions maps external → internal

**3. Compilation Model** (Section 5)
- Two-phase resolution (dependency graph → compilation)
- Patch document never mutates during compilation
- Composite compilation happens internally, not via document rewrite

**4. Enforced Invariants** (Section 9)
1. SlotIds are stable and unique within a block
2. All connections/bindings store PortRef only (no `{blockId, portName}`)
3. Composites never leak internal identities
4. Expansion is either authoring-time (macros) OR compile-time (composites)
5. Compilation never mutates the document

**5. Test Requirements** (Section 11)
- Diagnostics location stable across compilation
- No document mutation during compile

---

## What Has Been Implemented

### ✅ Completed: Quick Fix Sprint (Dec 21, 2025)

**P0: BindingEndpoint Migration** (Commit d5fe183)
- **Status**: COMPLETE
- **Evidence**:
  - `src/editor/types.ts:168-177` defines canonical `BindingEndpoint` interface
  - 70+ usages updated across 7+ files
  - `just typecheck` passes cleanly
- **What it fixed**: Type consistency—all bus bindings now use `{ blockId, slotId, dir }`


- **Status**: COMPLETE
- **Evidence**:
  - `src/editor/blocks/time-root.ts:66` → `output('phase', 'Phase', 'Signal<phase>')`
  - `src/editor/compiler/blocks/domain/TimeRoot.ts:92` → `phase: { kind: 'Signal:phase', value: phase }`
  - Zero references to `phaseA` remain in TimeRoot code
- **What it fixed**: Macro compilation errors—macros reference `phase`, TimeRoot now outputs `phase`

**P1: Port Validation** (Commit c535b6a)
- **Status**: COMPLETE
- **Evidence**: `src/editor/compiler/compileBusAware.ts:527-565`
  - Wire connection source port validation (lines 530-545)
  - Emits `PortMissing` diagnostic with context
- **What it fixed**: Fail-fast validation prevents cryptic `UpstreamError` at runtime

**Test Coverage at Sprint Completion**:
- Previous evaluation (WORK-EVALUATION-port-identity-2025-12-21-114704.md) reported: **738/738 tests passing**
- All acceptance criteria met
- Clean builds, working macros, clear error messages

---

## What Gaps Remain

### ❌ Architectural Gaps (Deferred by Design)

**1. Type-Based Port Resolution**
- **Spec requirement**: Match ports by type compatibility, not just string names
- **Current state**: String-based slotId matching only
- **Impact**: Cannot resolve ports through composite boundaries by type
- **Evidence**: No implementation in compiler or validator

**2. Stable SlotId System**
- **Spec requirement**: SlotId versioning, migration, deprecation warnings
- **Current state**: No versioning, no migration path for renamed ports
- **Impact**: Breaking changes when ports rename
- **Evidence**: No migration infrastructure exists

**3. Composite Boundary Enforcement**
- **Spec requirement**: Composites define `portMap` (external → internal)
- **Current state**: Composite expansion is document-level (macro-style)
- **Evidence**:
  - `src/editor/composites.ts` has no `portMap` field
  - Composite compilation still expands into flat graph
- **Spec reference**: Section 4 ("Composite boundary contract")

**4. Two-Phase Compilation**
- **Spec requirement**: Build dependency graph over ports, then compile blocks
- **Current state**: Flat block-level compilation
- **Impact**: Cannot handle composite internal namespacing cleanly
- **Evidence**: `src/editor/compiler/compileBusAware.ts` compiles blocks directly

**5. Document Immutability During Compile**
- **Spec requirement**: Patch document unchanged by compilation (Invariant 5)
- **Current state**: COMPLIANT (compilation produces separate artifacts)
- **Evidence**: Compiler returns `CompileResult`, does not mutate patch

**Scope Decision**: User approved deferring these to future sprints (USER-RESPONSE-2025-12-21-112900.md).

---

## Current Build State: BROKEN ❌

**Test Status**: 18 failures (as of 2025-12-21 12:28)
```
Test Files: 3 failed | 38 passed (41)
Tests:      18 failed | 744 passed | 3 skipped (765)
```

### Root Cause: Semantic Validator Overly Strict (Commit e4f3ee7)

**Failure Pattern**: Wire event tests fail because connections are rejected during preflight validation.

**Example**: `PatchStore.events.test.ts:32` - "emits WireAdded when connection created"
- **Expected**: WireAdded event emitted
- **Actual**: No event emitted (connection rejected by validator)
- **Why**: Validator's `canAddConnection` (lines 476-514 of validator.ts) cannot find ports

**Failing Test Categories**:
1. **Wire event emission** (8 failures) - WireAdded/WireRemoved not emitted
2. **GraphCommitted events** (7 failures) - bindingsChanged count wrong
3. **BlockReplaced events** (3 failures) - droppedConnections empty

### Diagnosis: Adapter or Validator Mismatch

**Hypothesis**: The `patchAdapter.ts` (added in e4f3ee7) correctly maps `block.inputs/outputs`, but the validator is checking against stale block data or incorrect slot IDs.

**Evidence**:
- `src/editor/stores/PatchStore.ts:830-842` - Preflight validation rejects connections
- `src/editor/semantic/validator.ts:476-514` - Looks for slots by `id`
- `src/editor/semantic/patchAdapter.ts:34-35` - Maps `slot.id` correctly

**Likely Cause**: Test blocks created in tests may have different slot structures than what validator expects. The validator was added AFTER the port identity work, so it's seeing the NEW slot ID format but may be configured for the OLD format.

**NOT a port identity regression**: The port identity work (commits d5fe183, 2b2d19d, c535b6a) passed all 738 tests. The failures appeared AFTER commit e4f3ee7 (semantic validator).

---

## Data Flow Verification

### Port Identity Flow (WORKING ✅)

| Step | Expected | Actual | Evidence |
|------|----------|--------|----------|
| Block definition | Slots have stable `id` | ✅ | `src/editor/blocks/time-root.ts:66` |
| Connection creation | Uses `{ blockId, slotId }` | ✅ | `src/editor/types.ts:459-474` |
| BindingEndpoint | Uses `{ blockId, slotId, dir }` | ✅ | `src/editor/types.ts:168-177` |
| Port validation | Checks ports exist before compile | ✅ | `src/editor/compiler/compileBusAware.ts:530-563` |
| Macro expansion | References `phase` port | ✅ | `src/editor/macros.ts` (24 occurrences) |
| TimeRoot compilation | Outputs `phase` artifact | ✅ | `src/editor/compiler/blocks/domain/TimeRoot.ts:92` |

### Broken Flow (Semantic Validator) ❌

| Step | Expected | Actual | Evidence |
|------|----------|--------|----------|
| Test creates blocks | Blocks have input/output slots | ✅ | Tests create blocks successfully |
| Test calls `connect()` | Connection created | ❌ | Preflight validation rejects |
| Validator checks endpoints | Finds slots in block | ❌ | `canAddConnection` returns errors |
| WireAdded event | Emitted after connection | ❌ | Never reached (early return) |

---

## Ambiguities Found

### None (Port Identity Scope)

The port identity quick fix sprint was **well-scoped and unambiguous**:
- Clear spec (rename `phaseA` → `phase`)
- Clear validation location (add to compileBusAware.ts)
- Clear migration pattern (mechanical BindingEndpoint updates)

### Potential Ambiguity (Semantic Validator Integration)

**Question**: Should the semantic validator enforce port existence during `connect()`?

**Context**: The validator was added to provide "single source of truth" validation, but it's now blocking test connections that should be valid.

**Options**:
1. **Fix validator**: Ensure it correctly reads slot IDs from test blocks
2. **Relax validation**: Skip preflight validation in tests (use suppressValidation flag)
3. **Fix tests**: Update test block creation to match validator expectations

**Impact**: 18 failing tests block CI/CD. Need decision before merging.

---

## Missing Checks (Implementer Should Create)

### Port Identity Persistence Tests

**Rationale**: The spec's "coffin nail" tests (Section 11) are missing.

```typescript
  // 2. Modify composite internal wiring
});
```

**Test 2**: Diagnostics location stable across compilation
```typescript
it('diagnostics point to stable authored port keys', () => {
  // 1. Create patch with type error on composite port
  // 2. Compile (triggers error)
  // 3. Verify error.where points to composite external port, not internal
});
```

**Test 3**: No document mutation during compile
```typescript
it('compilation does not mutate patch document', () => {
  // 1. Create patch, hash it
  // 2. Compile patch
  // 3. Verify patch hash unchanged
});
```

**Status**: Deferred to composite boundary implementation sprint.

---

## Recommendations

### Immediate (P0): Fix Broken Tests

**Action**: Investigate semantic validator test failures
- **Owner**: implementer or work-evaluator (not project-evaluator scope)
- **Effort**: 2-4 hours (likely simple fix in validator or test setup)
- **Blocker**: Yes (CI/CD broken, cannot merge)

**Debugging steps**:
1. Run single failing test with verbose output
2. Log `patchDoc` structure passed to validator
3. Verify slot IDs match what test expects
4. Check if validator is using OLD PortRef format (`.port`) vs NEW (`.slotId`)

### Near-Term (P1): Composite Boundary Implementation

**Action**: Implement composite port maps (defer to dedicated sprint)
- **Spec reference**: Section 4 of 2-PortIdentity.md
- **Dependencies**: Current port identity work (BindingEndpoint, port validation)
- **Effort**: Large (8-12 hours, requires compiler refactor)
- **Deliverables**:
  - Add `portMap` to `CompositeDefinition`
  - Implement two-phase compilation (port graph → block compilation)
  - Add "coffin nail" tests from spec

### Long-Term (P2): Type-Based Port Resolution

**Action**: Match ports by type compatibility, not just string IDs
- **Spec reference**: Section 10, point 3 of 2-PortIdentity.md
- **Dependencies**: Composite boundaries, stable TypeDesc system
- **Effort**: Large (6-10 hours)
- **Deliverables**:
  - Type-based fallback when slotId not found
  - Adapter chain resolution in port matching
  - Diagnostics explain why types incompatible

---

## Verdict

### Port Identity Quick Fix: ✅ COMPLETE

**Evidence**:
- All acceptance criteria met (DOD-2025-12-21-112636.md)
- 738 tests passing at sprint completion
- Clean TypeScript compilation
- Port validation added, working as designed

**Scope Discipline**: Correctly deferred complex features (composite boundaries, type-based matching).

### Architectural Foundation: ⚠️ INCOMPLETE (AS PLANNED)

**Deferred items** (per user decision):
- Composite port maps and boundary enforcement
- Type-based port resolution
- Stable slotId versioning system
- Two-phase compilation model

**Status**: Expected. Quick fix achieved immediate goals. Architectural refactor is future work.

### Current Build State: ❌ BROKEN (UNRELATED)

**Root cause**: Semantic Validator (commit e4f3ee7) introduced after port identity work.

**Impact**: 18 test failures blocking CI/CD.

**Recommendation**: Separate evaluation needed for semantic validator integration.

---

## Workflow Recommendation

**For Port Identity Work**: ✅ CONTINUE (work is complete)

**For Semantic Validator**: ⚠️ PAUSE - Need fix before proceeding
- Clarification needed: Should validator block test connections?
- Debug needed: Why are valid connections rejected?
- Decision needed: Fix validator, relax validation, or update tests?

---

## Files Referenced

### Specification
- `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md` (canonical spec)
- `design-docs/10-Refactor-for-UI-prep/Overview.md` (Issue #1 definition)

### Planning
- `.agent_planning/port-identity/PLAN-2025-12-21-112636.md` (sprint plan)
- `.agent_planning/port-identity/DOD-2025-12-21-112636.md` (acceptance criteria)
- `.agent_planning/port-identity/USER-RESPONSE-2025-12-21-112900.md` (user decisions)
- `.agent_planning/port-identity/WORK-EVALUATION-port-identity-2025-12-21-114704.md` (previous eval)

### Implementation
- `src/editor/types.ts:168-177` (BindingEndpoint definition)

- `src/editor/compiler/blocks/domain/TimeRoot.ts:92` (compiler output)
- `src/editor/compiler/compileBusAware.ts:527-565` (port validation)

### Broken Tests (Semantic Validator)
- `src/editor/stores/__tests__/PatchStore.events.test.ts` (12 failures)
- `src/editor/events/__tests__/GraphCommitted.test.ts` (6 failures)
- `src/editor/semantic/validator.ts:435-514` (canAddConnection method)
- `src/editor/semantic/patchAdapter.ts` (adapter implementation)

### Git Commits
- `d5fe183` - BindingEndpoint migration (2025-12-21 11:23:43)
- `2b2d19d` - TimeRoot port rename (2025-12-21 11:39:26)
- `c535b6a` - Port validation (2025-12-21 11:43:47)
- `e4f3ee7` - Semantic validator (2025-12-21 12:13:22) ⚠️ Broke tests

---

**Evaluation Complete** | project-evaluator | 2025-12-21 12:28
