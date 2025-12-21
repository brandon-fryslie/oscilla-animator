# Evaluation: Shared Validation Layer
Timestamp: 2025-12-21-123000
Confidence: FRESH
Git Commit: e4f3ee7
Scope: Issue #4 from Overview.md - Shared validation layer for UI + compiler

## Spec Requirements

From `design-docs/10-Refactor-for-UI-prep/5-DivergentTypes.md`:

**Problem**: UI allows invalid operations → compiler rejects them later → bad UX

**Solution**: Single validation layer with three consumers:
1. **Editor mutation layer** - prevent invalid operations
2. **Compiler** - enforce before codegen
3. **Diagnostics UI** - explain failures

**Core Components Required**:
- `SemanticGraph` - derived indices from PatchDocument
- `Validator` - single source of validation rules
- `PatchDocument` - minimal interface for validation
- Diagnostic taxonomy with machine-readable codes
- Preflight validation (canApply) + full validation (validateAll)

**Policy**:
- **PREVENT (hard)**: invalid endpoints, incompatible types, multiple TimeRoots, multiple writers, cycles
- **ALLOW (warn)**: expensive adapters, unused blocks, empty buses

---

## What Has Been Implemented

### ✅ Core Infrastructure (COMPLETE)

**SemanticGraph** (`src/editor/semantic/graph.ts`):
- ✅ 426 lines, fully implemented
- ✅ Derived indices: incoming/outgoing wires, publishers/listeners per bus, adjacency
- ✅ Incremental update methods (addWireEdge, addPublisherEdge, addListenerEdge)
- ✅ Cycle detection via Tarjan's SCC algorithm
- ✅ Query methods for all index structures
- **Evidence**: Lines 37-425 implement complete graph indexing

**Validator** (`src/editor/semantic/validator.ts`):
- ✅ 610 lines, comprehensive validation rules
- ✅ `validateAll(patch)` - full validation pass
- ✅ `canAddConnection(patch, from, to)` - preflight check
- ✅ Rules implemented:
  - Exactly one TimeRoot (lines 90-141)
  - No multiple writers to same input (lines 147-195)
  - Type compatibility on all connections (lines 201-262)
  - No cycles in dependency graph (lines 271-298)
  - All connection endpoints exist (lines 303-387)
  - Empty bus warnings (lines 393-419)
- **Evidence**: Lines 48-420 implement all required validation rules

**Type Compatibility** (`src/editor/semantic/index.ts`):
- ✅ Canonical `isAssignable(from, to)` function (lines 132-154)
- ✅ `areSlotTypesCompatible(fromSlot, toSlot)` for UI (lines 176-194)
- ✅ `areValueKindsCompatible(fromKind, toKind)` for compiler (lines 390-419)
- ✅ Compatible domain sets defined in one place (lines 61-80)
- ✅ One-way compatibility rules (lines 76-79)
- **Evidence**: Lines 54-432 provide single source of truth for type compatibility

**PatchDocument Adapter** (`src/editor/semantic/patchAdapter.ts`):
- ✅ 38 lines, clean adapter
- ✅ `storeToPatchDocument(root)` converts RootStore → PatchDocument
- ✅ No tight coupling, just reshaping references
- **Evidence**: Lines 1-38 implement lightweight conversion

**Diagnostic Types** (`src/editor/semantic/types.ts`):
- ✅ 221 lines, complete type system
- ✅ `ValidationResult` with errors/warnings/fixes (lines 27-39)
- ✅ `PortKey` canonical port identity (lines 72-76)
- ✅ Graph node/edge types (BlockNode, PortNode, BusNode, WireEdge, PublisherEdge, ListenerEdge)
- ✅ Utility functions for PortKey manipulation (lines 170-220)
- **Evidence**: Lines 1-221 define complete validation type system

### ✅ Compiler Integration (COMPLETE)

**Usage in `compile.ts`** (lines 37, 114-138):
```typescript
import { arePortTypesCompatible, areValueKindsCompatible, Validator } from '../semantic';

// Step 0.5: Semantic validation using the Validator
const patchDoc = compilerPatchToPatchDocument(patch);
const validator = new Validator(patchDoc, 0);
const validationResult = validator.validateAll(patchDoc);

if (!validationResult.ok) {
  // Convert Diagnostics to CompileErrors
  const validationErrors: CompileError[] = validationResult.errors.map(diag => {
    // ... convert Diagnostic to CompileError
  });
  return { ok: false, errors: validationErrors };
}
```

**Evidence**: Compiler calls `validateAll` before any codegen (line 116)

**Status**: ✅ **COMPLETE** - Compiler uses Validator as single source of truth

---

### ✅ UI Integration (COMPLETE)

**PatchStore** (`src/editor/stores/PatchStore.ts`, lines 24-25, 829-843):
```typescript
import { Validator } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';

// In addConnection():
const patchDoc = storeToPatchDocument(this.root);
const validator = new Validator(patchDoc, this.patchRevision);
const validationResult = validator.canAddConnection(
  patchDoc,
  { blockId: fromBlockId, slotId: fromSlotId },
  { blockId: toBlockId, slotId: toSlotId }
);

if (!validationResult.ok) {
  const firstError = validationResult.errors[0];
  console.warn('[PatchStore] Connection rejected by validator:', firstError?.message);
  return; // Silently reject
}
```

**Evidence**: UI calls `canAddConnection` for preflight validation (line 832)

**portUtils Integration** (`src/editor/portUtils.ts`, lines 12, 169):
```typescript
import { areSlotTypesCompatible, getCompatibilityHint } from './semantic';

export function areTypesCompatible(outputType: SlotType, inputType: SlotType): boolean {
  return areSlotTypesCompatible(outputType, inputType);
}
```

**Evidence**: portUtils delegates to semantic module (line 169)

**Status**: ✅ **COMPLETE** - UI prevents invalid operations using Validator

---

### ⚠️ Diagnostics UI Integration (PARTIAL)

**DiagnosticHub** (`src/editor/diagnostics/DiagnosticHub.ts`):
- ✅ Exists and manages diagnostic state with snapshot semantics (lines 1-382)
- ✅ Event-driven updates (GraphCommitted, CompileFinished, RuntimeHealthSnapshot)
- ✅ Authoring validators run on every GraphCommitted event (line 110)
- ❌ **BUT**: `runAuthoringValidators` does NOT use Semantic Validator (lines 297-329)

**Current Implementation** (lines 297-329):
```typescript
private runAuthoringValidators(patchRevision: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Validator: Check for missing TimeRoot
  const timeRootBlocks = this.patchStore.blocks.filter(
    (block) =>
      block.type === 'FiniteTimeRoot' ||
      block.type === 'CycleTimeRoot' ||
      block.type === 'InfiniteTimeRoot'
  );

  if (timeRootBlocks.length === 0) {
    diagnostics.push(createDiagnostic({ ... }));
  }

  return diagnostics;
}
```

**Problem**: DiagnosticHub manually checks TimeRoot count instead of calling `Validator.validateAll`

**Evidence**: Lines 297-329 duplicate validation logic that exists in Validator

**Status**: ⚠️ **INCOMPLETE** - DiagnosticHub not using Validator

---

## Test Coverage

### ✅ Semantic Kernel Tests (COMPLETE)

**validator.test.ts**:
- ✅ 582 lines, 15 tests, all passing
- ✅ Tests `validateAll` for all validation rules
- ✅ Tests `canAddConnection` for preflight checks
- ✅ Coverage:
  - TimeRoot constraint (missing, multiple)
  - Multiple writers detection
  - Type compatibility checking
  - Cycle detection
  - Endpoint validation
  - Empty bus warnings
  - Preflight validation (canAddConnection)
- **Evidence**: Test output shows "15 tests" passing in 233ms

**graph.test.ts**:
- ✅ 9 tests, all passing
- ✅ Tests SemanticGraph indexing and queries
- **Evidence**: Test output shows "9 tests" passing in 30ms

**Status**: ✅ **COMPLETE** - Validation layer is well-tested

---

## Assessment

### What the Spec Requires

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SemanticGraph for derived indices | ✅ COMPLETE | graph.ts:37-425 |
| Validator with validateAll + canAddConnection | ✅ COMPLETE | validator.ts:48-610 |
| Single source of truth for type compatibility | ✅ COMPLETE | index.ts:132-194 |
| PatchDocument minimal interface | ✅ COMPLETE | types.ts:149-160 |
| Diagnostic taxonomy | ✅ COMPLETE | types.ts:27-54 |
| Compiler uses Validator | ✅ COMPLETE | compile.ts:116 |
| UI uses Validator for preflight | ✅ COMPLETE | PatchStore.ts:832 |
| portUtils delegates to semantic | ✅ COMPLETE | portUtils.ts:169 |
| DiagnosticHub uses Validator | ❌ INCOMPLETE | DiagnosticHub.ts:297-329 |

### ✅ Working (High Confidence)

**Compiler Integration**:
- ✅ Compiler calls `validateAll` before codegen (compile.ts:116)
- ✅ Validation errors converted to CompileErrors (compile.ts:120-137)
- ✅ Same validation runs whether UI prevented or not (defense in depth)
- ✅ Type compatibility uses `areValueKindsCompatible` from semantic module (compile.ts:37)

**UI Integration**:
- ✅ PatchStore calls `canAddConnection` for preflight validation (PatchStore.ts:832)
- ✅ Invalid connections rejected before being added (PatchStore.ts:838-843)
- ✅ portUtils.areTypesCompatible delegates to semantic.areSlotTypesCompatible (portUtils.ts:169)
- ✅ UI and compiler use SAME type compatibility rules

**Test Coverage**:
- ✅ 24 tests total (15 validator + 9 graph)
- ✅ All validation rules have test coverage
- ✅ All tests passing

### ❌ Not Working / Incomplete

**DiagnosticHub Not Using Validator**:
- ❌ `runAuthoringValidators` manually checks TimeRoot count (DiagnosticHub.ts:301-326)
- ❌ Duplicates logic that exists in Validator.validateTimeRootConstraint
- ❌ No calls to `Validator.validateAll` in authoring validation
- ❌ Only checks ONE rule (missing TimeRoot), not all rules

**What This Means**:
1. LogWindow shows only TimeRoot errors in authoring domain
2. Other validation errors (multiple writers, type mismatches, cycles) only appear after compile
3. DiagnosticHub authoring snapshot is incomplete

**Impact**: LOW
- UI already prevents invalid operations via `canAddConnection` in PatchStore
- Compiler validates before codegen
- Users don't see inconsistency (UI prevents, so compile errors rare)
- LogWindow just doesn't show *all* possible authoring errors

---

## Data Flow Verification

### Connection Validation Flow

| Step | Component | Action | Status |
|------|-----------|--------|--------|
| 1. User drags wire | UI | Check type compatibility via portUtils.areTypesCompatible | ✅ Uses semantic |
| 2. User drops wire | PatchStore | Call validator.canAddConnection | ✅ Preflight check |
| 3. Validation fails | PatchStore | Reject connection, log warning | ✅ Prevents invalid |
| 4. Validation passes | PatchStore | Add connection to store | ✅ |
| 5. User compiles | Compiler | Call validator.validateAll | ✅ Same rules |
| 6. Compile fails | Compiler | Return validation errors | ✅ |
| 7. User views errors | LogWindow | Show compile diagnostics | ✅ From DiagnosticHub |

**Evidence**: All steps verified in source code

**Verdict**: ✅ **FLOW IS CORRECT** - UI and compiler use same validation

---

## Gaps Remaining

### Gap 1: DiagnosticHub Not Calling Validator

**Current**: DiagnosticHub.runAuthoringValidators manually implements ONE check

**Required**: Should call `Validator.validateAll` and convert results to authoring diagnostics

**Fix**:
```typescript
// In DiagnosticHub.ts:297
private runAuthoringValidators(patchRevision: number): Diagnostic[] {
  const patchDoc = storeToPatchDocument(this.patchStore, this.busStore);
  const validator = new Validator(patchDoc, patchRevision);
  const result = validator.validateAll(patchDoc);

  // Return all errors/warnings as authoring diagnostics
  // (They already have correct format - Diagnostic[])
  return [...result.errors, ...result.warnings];
}
```

**Complexity**: LOW (10 lines)

**Impact**: Authoring diagnostics will show ALL validation errors in real-time, not just TimeRoot

**Blocker**: None - straightforward replacement

---

### Gap 2: Test Coverage for DiagnosticHub Integration

**Current**: No tests for DiagnosticHub calling Validator

**Required**: Test that authoring validators use Validator.validateAll

**Fix**: Add test to `DiagnosticHub.test.ts`:
```typescript
it('should use Validator for authoring diagnostics', () => {
  // Given: Patch with multiple validation errors
  // When: GraphCommitted event fires
  // Then: All errors from Validator appear in authoring snapshot
});
```

**Complexity**: LOW (1 test)

**Blocker**: Gap 1 must be fixed first

---

## Missing Checks

None. Existing test coverage is comprehensive for the semantic kernel itself.

The missing piece is integration testing for DiagnosticHub using the Validator.

---

## Ambiguities Found

None. The spec is clear, the implementation is 95% complete, and the gap is well-defined.

---

## Recommendations

### Priority 1: Complete DiagnosticHub Integration

**Action**: Replace `runAuthoringValidators` to call `Validator.validateAll`

**Rationale**:
- Eliminates duplicate logic
- Ensures authoring diagnostics match compiler diagnostics
- Users see ALL validation errors in real-time, not just after compile

**Effort**: 30 minutes

**Files**:
- `src/editor/diagnostics/DiagnosticHub.ts` (modify 10 lines)
- `src/editor/diagnostics/__tests__/DiagnosticHub.test.ts` (add 1 test)

---

### Priority 2: Document Validation Architecture

**Action**: Add comments to key files explaining the three-consumer pattern

**Files**:
- `src/editor/semantic/index.ts` - Add header comment with usage examples
- `src/editor/stores/PatchStore.ts` - Comment explaining why we call canAddConnection
- `src/editor/compiler/compile.ts` - Comment explaining why we call validateAll

**Effort**: 15 minutes

---

## Verdict

### Overall Status: 95% COMPLETE

**What Works**:
- ✅ SemanticGraph, Validator, type compatibility - all implemented
- ✅ Compiler uses Validator for all validation
- ✅ UI uses Validator for preflight checks (canAddConnection)
- ✅ portUtils delegates to semantic module
- ✅ 24 tests passing, comprehensive coverage
- ✅ Single source of truth for type compatibility
- ✅ No divergence between UI and compiler

**What's Missing**:
- ❌ DiagnosticHub authoring validators don't call Validator (10 lines to fix)
- ❌ No test for DiagnosticHub integration (1 test to add)

**Impact of Gap**: LOW
- UI already prevents invalid operations
- Compiler validates before codegen
- LogWindow just doesn't show all authoring errors in real-time

**Recommendation**: ✅ **CONTINUE**
- Gap is small, well-defined, easy to fix
- Core architecture is sound
- No blocking issues for other work

---

## Next Steps

If fixing the gap:
1. Modify DiagnosticHub.runAuthoringValidators to call Validator.validateAll
2. Add test for DiagnosticHub using Validator
3. Verify LogWindow shows all authoring errors in real-time

If deferring:
- Document the gap in Overview.md
- Note that authoring diagnostics are incomplete (only TimeRoot check)
- Flag for future cleanup
