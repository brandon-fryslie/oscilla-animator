# Relevant Files: P1 Type Cleanup - Sprint 3

**Generated**: 2026-01-02
**Scope**: Sprint 3 P1 completion verification + P0 compilation blocker
**Topic**: bus-block-unification
**For**: Implementer to complete Sprint 3 P1

---

## Critical Context

**P1 Work Status**: ✅ 95% COMPLETE (all bus checks removed from compiler)

**Current Blocker**: TypeScript compilation errors in transform definitions (NOT bus-related)

**Action Required**:
1. Fix compilation errors (P0 - unblocks tests)
2. Verify P1 completion (run tests, manual verification)
3. Investigate P2 store checks (determine if safe to remove)

---

## Files to Fix (P0 - Compilation Blocker)

### 1. Transform Definitions Missing `busEligible` Field

**Problem**: TypeDesc objects require `busEligible: boolean` but transform definitions use shorthand

**Fix Pattern**:
```typescript
// BEFORE (causes error)
inputType: { world: 'scalar', domain: 'float', category: 'core' }

// AFTER (correct)
inputType: { world: 'scalar', domain: 'float', category: 'core', busEligible: true }
```

**Files to Update** (45 errors total):

#### src/editor/transforms/definitions/adapters/ConstToSignal.ts
- **Lines**: 18, 19, 41, 42, 64, 65, 87, 88 (10 errors)
- **Context**: Adapter definitions for Scalar→Signal conversions
- **Fix**: Add `busEligible: true` to all TypeDesc literals
- **Also Fix**: Line 74 - type error for `Signal:boolean` artifact kind
- **Also Fix**: Line 96 - return type error for Signal:color artifact

#### src/editor/transforms/definitions/lenses/arithmetic.ts
- **Lines**: 26, 31, 67, 102, 107 (5 errors)
- **Context**: Arithmetic lens definitions (Add, Multiply, etc.)
- **Fix**: Add `busEligible: true` to all TypeDesc literals

#### src/editor/transforms/definitions/lenses/ease.ts
- **Lines**: 31, 34-39 (15 errors)
- **Context**: Easing function lens definitions
- **Fix**: Add `busEligible: true` to TypeDesc on line 31
- **Also Fix**: Lines 34-39 - enum values need `{ value: string; label: string }` objects, not plain strings

#### src/editor/transforms/definitions/lenses/shaping.ts
- **Lines**: 26, 64, 102, 107, 112, 117, 159, 161 (7 errors)
- **Context**: Shaping lens definitions (Clamp, Floor, etc.)
- **Fix**: Add `busEligible: true` to all TypeDesc literals
- **Also Fix**: Line 161 - `"toggle"` is not a valid widget type

#### src/editor/__tests__/lenses.test.ts
- **Lines**: 8 (2 errors)
- **Context**: Legacy lens test imports
- **Fix**: Remove imports for deleted exports (`applyLens`, `isValidLensType`)
- **Alternative**: Skip/delete this test file if it's testing legacy lens system

**Estimated Effort**: 1-2 hours (mechanical changes, ~30 locations)

---

## Files to Verify (P1 - Completion Check)

### Compiler Passes (Should Have NO `kind === 'bus'` Checks)

#### src/editor/compiler/passes/pass1-normalize.ts
- **Verification**: Confirm lines 63, 72 NO LONGER filter by `kind === 'bus'`
- **Commit**: bfc2db9 removed these checks

#### src/editor/compiler/passes/pass6-block-lowering.ts
- **Verification**: Confirm line 417 NO LONGER returns `null` for bus writers
- **Expected**: Writer resolution handles all ports uniformly
- **Commit**: 181ef11 removed this check

#### src/editor/compiler/passes/pass7-bus-lowering.ts
- **Verification**: Confirm lines 167, 274 removed (legacy edge functions)
- **Expected**: Only `getEdgesToBusBlock()` used (port-based queries)
- **Commit**: 096d4a0 removed these checks

#### src/editor/compiler/passes/pass8-link-resolution.ts
- **Verification**: Confirm line 546 comment updated (no bus edge references)
- **Expected**: Comment states "all edges are port→port after migration"
- **Commit**: 5377b27 updated documentation

#### src/editor/compiler/passes/resolveWriters.ts
- **Expected**: Only 'wire' and 'default' writers exist (no 'bus' kind)
- **Current**: Line 162 has comment "edge.from.kind === 'bus' no longer exists"
- **Commit**: d64f76b removed bus writer classification

**Action**: Read these files and confirm removals are complete

---

## Files to Investigate (P2 - Store Checks)

### Store Files Still Containing `kind === 'bus'` Checks

#### src/editor/stores/PatchStore.ts
- **Lines**: 1368, 1378, 1416, 1426
- **Context**: Event emission in `addEdgeEndpoints` and `removeEdgeEndpoints`
- **Code Pattern**:
  ```typescript
  } else if (edge.from.kind === 'port' && edge.to.kind === 'bus') {
  } else if (edge.from.kind === 'bus' && edge.to.kind === 'port') {
  }
  ```
- **Questions**:
  1. Are these branches reachable with BusBlocks? (edges should be port→port)
  2. What events do they emit? (EdgeEndpointAdded/Removed)
- **Investigation**:
  - Check if UI components use `endpoint.kind === 'bus'`
  - Determine if we can replace with BusBlock detection
- **Commit**: 06d27e7 partially updated these (but legacy paths remain)

#### src/editor/stores/SelectionStore.ts
- **Lines**: 79-81
- **Context**: Legacy bus selection detection
- **Code**:
  ```typescript
  if (this.selection.kind === 'bus') {
    return this.selection.id;
  }
  ```
- **Questions**:
  1. Does UI ever set `selection.kind = 'bus'`?
  2. Should this check `selection.kind === 'block' && block.type === 'BusBlock'`?
- **Investigation**:
  - Grep for `setSelection` calls with `kind: 'bus'`
  - Check if BusBlock selection uses `kind: 'block'` instead
- **Commit**: c902693 added BusBlock detection but kept legacy path

#### src/editor/stores/DiagnosticStore.ts
- **Lines**: 186-187
- **Context**: Legacy bus diagnostic targeting
- **Code**:
  ```typescript
  if (target.kind === 'bus') return target.busId === busId;
  if (target.kind === 'binding') return target.busId === busId;
  ```
- **Questions**:
  1. Do diagnostics still use `{ kind: 'bus'; busId: string }` targets?
  2. Should they use `{ kind: 'block'; blockId: string }` instead?
- **Investigation**:
  - Grep for diagnostic creation with `kind: 'bus'`
  - Check if BusBlock diagnostics use block-based targets
- **Commit**: cad5e66 added BusBlock detection but kept legacy path

**Action**: For each file, determine if legacy path is:
- Dead code (can be removed safely)
- Migration compatibility (keep for old patches)
- Active code (needs refactoring to BusBlock detection)

---

## Files NOT in Scope (Migration Utilities)

### Migration/Conversion Code (KEEP `kind === 'bus'` Checks)

#### src/editor/edgeMigration.ts
- **Purpose**: Converts old `{ kind: 'bus' }` edges to port-based format
- **Uses**: `kind === 'bus'` checks to detect legacy edges
- **Status**: ✅ EXEMPT from P1 scope (legitimately needs bus checks)
- **Action**: NO CHANGES NEEDED

#### src/editor/bus-block/migration.ts
- **Purpose**: Converts Bus entities to BusBlocks
- **Uses**: Bus type and related legacy structures
- **Status**: ✅ EXEMPT from P1 scope (migration utility)
- **Action**: NO CHANGES NEEDED

---

## Type Definitions to Review

### src/editor/types.ts

#### Endpoint Union (Lines 268-270)
```typescript
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };  // ← UNUSED after Sprint 2
```

**Question**: Can we remove the `bus` variant?

**Investigation**:
- Grep for `{ kind: 'bus'` in non-migration code
- Check if any active code constructs bus endpoints
- Determine if we can replace with `Endpoint = PortRef` alias


**Recommendation**: Mark as `@deprecated` first, remove in separate cleanup

#### Bus Interface (Lines 165-198)
```typescript
export interface Bus {
  readonly id: string;
  name: string;
  readonly type: TypeDesc;
  combine: CombinePolicy;
  defaultValue: unknown;
  sortKey: number;
  readonly origin?: 'built-in' | 'user';
}
```

**Question**: Is this still needed?

**Current Use**:
- BusStore facade returns `Bus` objects (converted from BusBlocks)
- UI components expect `Bus` type for display

**Status**: ⚠️ KEEP for now (UI dependency)

**Future**: After BusStore deletion, consider removing

---

## Test Files to Run (After Compilation Fixed)

### Compiler Tests
- `just test -- compiler` - Verify all compiler passes work
- `just test -- pass7` - Specifically test bus lowering
- `just test -- resolveWriters` - Verify writer resolution

### Store Tests
- `just test -- PatchStore` - Verify edge operations
- `just test -- SelectionStore` - Verify BusBlock selection
- `just test -- DiagnosticStore` - Verify BusBlock diagnostics

### Integration Tests
- `just test -- composite.expansion` - May still have skipped lens tests (expected)
- `just test -- busContracts` - Verify bus combine modes
- `just test -- edgeMigration` - Verify old patches migrate correctly

### Manual Tests (After Tests Pass)

1. **BusBlock Creation**
   - Create new bus via UI
   - Verify BusBlock appears on canvas
   - Verify `block.type === 'BusBlock'`
   - Verify `block.params.busId` set correctly

2. **Edge Connections**
   - Verify edges are `{ from: PortRef, to: PortRef }` (no `kind: 'bus'`)

3. **Compilation**
   - Compile patch with BusBlocks
   - Verify no compile errors
   - Verify bus combine modes work (latest, merge, array)

4. **UI Reactivity**
   - Select BusBlock
   - Verify inspector shows bus properties
   - Change bus combine mode
   - Verify UI updates immediately

5. **Diagnostics**
   - Create bus error (e.g., type mismatch)
   - Verify diagnostic appears in panel
   - Verify diagnostic targets BusBlock correctly

---

## Summary for Implementer

### Immediate Tasks (P0 - Unblock Tests)

1. **Fix TypeErrors in transform definitions** (~1-2 hours)
   - Add `busEligible: true` to ~30 TypeDesc literals
   - Fix enum/artifact type mismatches
   - Fix lens test imports
   - Verify: `just typecheck` passes

### Verification Tasks (P1 - Confirm Completion)

2. **Verify compiler has no bus checks** (~30 minutes)
   - Read pass1, pass6, pass7, pass8, resolveWriters
   - Confirm all `kind === 'bus'` checks removed
   - Run: `just test -- compiler`

3. **Manual test bus functionality** (~30 minutes)
   - Follow manual test checklist above
   - Verify BusBlocks work end-to-end
   - Document any issues found

### Investigation Tasks (P2 - Determine Next Steps)

4. **Investigate store legacy checks** (~1-2 hours)
   - Read PatchStore event emission code
   - Determine if `kind === 'bus'` branches are reachable
   - Check UI component dependencies
   - Decide: Remove now, defer, or keep

5. **Document findings** (~30 minutes)
   - Update this STATUS with investigation results
   - Create plan for P2 completion if safe
   - Or document reasons to defer P2

### Total Estimated Effort: 4-6 hours

---

**Files Generated**: This document provides precise context for completing Sprint 3 P1.

**Next Steps**: Implementer should start with P0 (fix compilation), then verify P1, then investigate P2.
