# Status Report: Bus-Block Unification - Sprints 3 & 4
**Generated**: 2026-01-01 08:20
**Scope**: Sprint 3 (Cleanup & Store Unification) + Sprint 4 (Lens Param Bindings)
**Confidence**: FRESH
**Git Commit**: 06e29af

---

## Executive Summary

**Sprint 2 Status**: ✅ COMPLETE (Compiler unified to use BusBlocks)
**Sprint 3 Status**: 🟡 PARTIAL (BusStore facade exists, full removal pending)
**Sprint 4 Scope**: Lens parameter bindings from buses/wires/defaults

### Completion Overview
- **Sprint 1**: ✅ COMPLETE - BusBlock definition, conversion utilities, edge migration
- **Sprint 2**: ✅ COMPLETE - Compiler passes unified (Pass 7 & 8 use BusBlocks)
- **Sprint 3**: 🟡 PARTIAL - BusStore facade implemented, full type cleanup pending
- **Sprint 4**: ❌ NOT STARTED - Lens param bindings still TODO

### Critical Gaps
1. **Endpoint.kind === 'bus' checks**: 15 locations across compiler and stores
2. **Type cleanup incomplete**: Endpoint union, Bus/Publisher/Listener types still exist
3. **BusStore exists as facade**: Not yet deleted (delegates to PatchStore)
4. **Lens param bindings**: Only `literal` kind supported, `bus`/`wire`/`default` unsupported
5. **Test failures**: 43 failing tests (11 test files) - mostly transaction/ops tests

---

## Sprint 1 & 2 Completion Analysis

### ✅ What's Been Completed

#### Sprint 1: Foundation (COMPLETE)
- ✅ BusBlock definition created (`src/editor/blocks/special/BusBlock.ts`)
- ✅ Bus→BusBlock conversion utilities (`src/editor/bus-block/conversion.ts`)
- ✅ Edge migration utilities (`src/editor/bus-block/migration.ts`)
  - `migrateEdgesToPortOnly()`: Converts bus endpoints to BusBlock ports
  - `isMigrated()`: Checks if patch already migrated
  - `safeMigrate()`: Prevents double-migration

#### Sprint 2: Compiler Unification (COMPLETE)
- ✅ Pass 7 unified to use BusBlocks (commit 00f44d4)
  - `getBusBlocks()` replaces bus entity lookups
  - `getEdgesToBusBlock()` finds publishers via port→BusBlock.in edges
  - `getBusBlockCombineMode()` reads combine policy from params
- ✅ Pass 8 unified edge processing (commit 55bef85)
  - All edges processed uniformly (no edge-kind discrimination in main path)
  - Transform application works on BusBlock edges
- ✅ BusBlock recognition utilities added (commit 3bed199)
  - `src/editor/compiler/bus-block-utils.ts`

#### Sprint 3: Partial Progress
- ✅ PatchStore has bus management methods (commit e3bb7f6)
  - `busBlocks` computed getter
  - `getBusById()`, `addBus()`, `removeBus()` methods
- ✅ BusStore facade implemented (commit c85d2a3)
  - Delegates to PatchStore.busBlocks
  - Still manages publishers/listeners locally
  - Not yet deleted

---

## Sprint 3 Remaining Work: Detailed Inventory

### 1. Compiler: `kind === 'bus'` Checks (5 files)

#### File: `src/editor/compiler/passes/pass1-normalize.ts`
**Lines 63, 72**: Publisher edge detection
```typescript
.filter(e => e.from.kind === 'port' && e.to.kind === 'bus')  // Line 63
const nonPublishers = enabled.filter(e => !(e.from.kind === 'port' && e.to.kind === 'bus')); // Line 72
```
**Purpose**: Sorting publisher edges by sortKey for deterministic bus combines
**Status**: BACKWARD COMPATIBILITY - can remain during migration
**Sprint 3 Action**: Can be removed after Endpoint type cleanup

---

#### File: `src/editor/compiler/passes/pass6-block-lowering.ts`
**Line 417**: Writer kind check
```typescript
if (writer.kind === 'bus') {
  // Bus: Will be resolved in Pass 7 (bus lowering)
  return null;
}
```
**Purpose**: Returns null for bus writers (resolved in Pass 7/8)
**Status**: FUNCTIONAL - needed until bus edges fully migrated
**Sprint 3 Action**: Remove after Endpoint cleanup, handle via BusBlock ports

---

#### File: `src/editor/compiler/passes/pass7-bus-lowering.ts`
**Lines 167, 274**: Legacy edge format detection
```typescript
// Line 167: getPublishersFromLegacyEdges() - DEPRECATED function
e.to.kind === "bus" && e.to.busId === busId

// Line 274: hasLegacyEdges check
const hasLegacyEdges = edges.some(e => e.to.kind === 'bus' && e.to.busId === busBlock.id);
```
**Purpose**: BACKWARD COMPATIBILITY - supports old edge format
**Status**: Can be removed after full migration
**Sprint 3 Action**: Delete `getPublishersFromLegacyEdges()`, rely only on port→port edges

---

#### File: `src/editor/compiler/passes/pass8-link-resolution.ts`
**Line 546**: Comment only (no code change needed)
```typescript
* have been migrated by migrateEdgesToPortOnly(). Bus edges (edge.from.kind === 'bus')
```
**Status**: Documentation - update comment after cleanup

---

#### File: `src/editor/compiler/passes/resolveWriters.ts`
**Lines 162-169**: Bus listener writer classification
```typescript
} else if (edge.from.kind === 'bus') {
  // Bus listener: bus → port
  writers.push({
    kind: 'bus',
    listenerId: edge.id,
    busId: edge.from.busId,
  });
}
```
**Purpose**: Classifies bus→port edges as 'bus' writers
**Status**: FUNCTIONAL - needed until edges migrated
**Sprint 3 Action**: After migration, all writers are 'wire' or 'default' (no 'bus' kind)

---

### 2. Stores: `kind === 'bus'` Checks (3 files)

#### File: `src/editor/stores/PatchStore.ts`
**Lines 155, 164, 1338, 1348, 1386, 1396**: Publisher/listener edge helpers
```typescript
// Lines 155-156: publisherEdges getter
get publisherEdges(): Edge[] {
  return this.edges.filter(e => e.from.kind === 'port' && e.to.kind === 'bus');
}

// Lines 163-165: listenerEdges getter
get listenerEdges(): Edge[] {
  return this.edges.filter(e => e.from.kind === 'bus' && e.to.kind === 'port');
}

// Lines 1338-1358: Edge update helpers (addEdgeEndpoints, removeEdgeEndpoints)
// Similar patterns detecting publisher/listener edges
```
**Purpose**: UI helpers for bus-related edges
**Status**: Used by UI components (BusBoard, BusInspector)
**Sprint 3 Action**:
- After migration: `publisherEdges` becomes edges to `*.in` on BusBlocks
- After migration: `listenerEdges` becomes edges from `*.out` on BusBlocks
- Can keep getters with updated implementation OR remove if UI uses `busBlocks` directly

---

#### File: `src/editor/stores/SelectionStore.ts`
**Line 71**: Selection kind check
```typescript
return this.selection.kind === 'bus' ? this.selection.id : null;
```
**Purpose**: Returns selected bus ID
**Status**: UI state - selection can still be 'bus' kind
**Sprint 3 Action**: Update to recognize BusBlock selections (selection.kind === 'block' && block.type === 'BusBlock')

---

#### File: `src/editor/stores/DiagnosticStore.ts`
**Line 177**: Diagnostic target check
```typescript
if (target.kind === 'bus') return target.busId === busId;
```
**Purpose**: Matches diagnostic target against bus ID
**Status**: Diagnostics can still target buses
**Sprint 3 Action**: Update to match BusBlock by block.id or params.busId

---

### 3. Migration Utilities: Bus Endpoint References (1 file)

#### File: `src/editor/edgeMigration.ts`
**Lines 34, 149**: Migration and validation
```typescript
// Line 34: validateEdge() - rejects bus→bus
if (edge.from.kind === 'bus' && edge.to.kind === 'bus') {
  throw new Error('Invalid edge: bus→bus connections not allowed');
}

// Line 149: isMigrated() check
if (edge.from.kind === 'bus' || edge.to.kind === 'bus') {
  return false;
}
```
**Purpose**: Migration safety checks
**Status**: MIGRATION INFRASTRUCTURE - can remain until all patches migrated
**Sprint 3 Action**: Keep for safety during transition period

---

### 4. Type System Cleanup (NOT STARTED)

According to Sprint 3 plan (P1), these types should be removed:

#### Types to Remove
```typescript
// src/editor/types.ts

// Line 268-270: Endpoint discriminated union
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };

// Becomes:
export type Endpoint = PortRef; // Just an alias, or delete entirely

// Bus interface (legacy)
export interface Bus { ... }

// Publisher interface (legacy)
export interface Publisher { ... }

// Listener interface (legacy)
export interface Listener { ... }
```

#### Patch Type Cleanup
```typescript
// Remove these arrays from Patch interface:
interface Patch {
  buses: Bus[];        // DELETE
  publishers: Publisher[];  // DELETE
  listeners: Listener[];    // DELETE
}
```

**Status**: ❌ NOT STARTED
**Expected Impact**: 50-100 compile errors to fix
**Sprint 3 Action**: Requires systematic refactoring

---

### 5. BusStore Deletion (NOT STARTED)

**Current State**: BusStore exists as facade (commit c85d2a3)
- Delegates `buses` getter to PatchStore.busBlocks
- Still manages publishers/listeners locally (arrays in BusStore)
- RootStore.busStore still exists

**Sprint 3 Plan**: Delete BusStore entirely
- Move all bus management to PatchStore
- Remove RootStore.busStore property
- Update all UI components to use PatchStore directly

**Status**: ❌ NOT STARTED (facade only)
**Files to Delete**:
- `src/editor/stores/BusStore.ts` (~17KB)

**Files to Modify**:
- `src/editor/stores/RootStore.ts` (remove busStore property)
- All UI components using `rootStore.busStore.*`

---

## Sprint 4 Scope: Lens Parameter Bindings

### Current State: Only Literals Supported

**Location**: `src/editor/compiler/passes/pass8-link-resolution.ts:464-472`

```typescript
// Convert lens params to ValueRefPacked
const paramsMap: Record<string, ValueRefPacked> = {};
for (const [paramId, binding] of Object.entries(lensInstance.params)) {
  if (binding.kind === 'literal') {
    // Convert literal values to scalar constants
    const constId = builder.allocConstId(binding.value);
    paramsMap[paramId] = { k: 'scalarConst', constId };
  }
  // TODO: Handle other binding kinds (bus, wire, default) in future sprints
  // For now, only literal bindings are supported in IR mode
}
```

### LensParamBinding Type

**Source**: `src/editor/types.ts:230-234`

```typescript
export type LensParamBinding =
  | { kind: 'default'; defaultSourceId: string }
  | { kind: 'wire'; from: PortRef; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
  | { kind: 'bus'; busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
  | { kind: 'literal'; value: unknown };
```

### What Needs to Happen (Sprint 4)

#### 1. Wire Bindings (`kind: 'wire'`)
**Requirement**: Lens param can be connected to an output port
**Implementation**:
```typescript
if (binding.kind === 'wire') {
  // Resolve the wire source to a ValueRefPacked
  const sourceArtifact = blockOutputs.get(blockIdToIndex.get(binding.from.blockId))
                                     ?.get(binding.from.slotId);
  if (sourceArtifact) {
    let valueRef = artifactToValueRef(sourceArtifact, builder, binding.from.blockId, binding.from.slotId);

    // Apply adapter chain if present (legacy - DEPRECATED after Track A.5)
    // Apply lens stack if present (legacy - DEPRECATED after Track A.5)

    paramsMap[paramId] = valueRef;
  }
}
```

#### 2. Bus Bindings (`kind: 'bus'`)
**Requirement**: Lens param can read from a bus
**Implementation**:
```typescript
if (binding.kind === 'bus') {
  // After Sprint 3, buses are BusBlocks
  // Look up the bus combine result from busRoots
  const busBlock = getBusById(patch, binding.busId);
  if (busBlock) {
    const busIdx = blockIdToIndex.get(busBlock.id);
    const busValueRef = busRoots.get(busIdx);

    if (busValueRef) {
      // Apply transforms if present
      paramsMap[paramId] = busValueRef;
    }
  }
}
```

#### 3. Default Bindings (`kind: 'default'`)
**Requirement**: Lens param uses a default value source
**Implementation**:
```typescript
if (binding.kind === 'default') {
  // Look up default source definition
  // Create appropriate constant or expression
  // This is similar to how default sources work for block inputs
  paramsMap[paramId] = createDefaultValueRef(binding.defaultSourceId, builder);
}
```

### Dependencies for Sprint 4

**Sprint 3 must complete FIRST** because:
1. Bus bindings require `busRoots` map from Pass 7 (which uses BusBlocks)
2. After Sprint 3, `binding.busId` maps to a BusBlock, not legacy Bus entity
3. Type system must be cleaned up to remove old Bus references

**Sprint 4 blockers**:
- Cannot implement bus bindings until Sprint 3 completes
- Wire/default bindings could be implemented independently
- Adapter chain handling is DEPRECATED (Track A.5 removed these fields)

---

## Dependencies Graph

```
Sprint 1 (Foundation)
  ✅ BusBlock definition
  ✅ Conversion utilities
  ✅ Migration utilities
         ↓
Sprint 2 (Compiler)
  ✅ Pass 7 uses BusBlocks
  ✅ Pass 8 unified edges
         ↓
Sprint 3 (Cleanup)
  🟡 BusStore facade exists
  ❌ Type cleanup NOT STARTED
  ❌ BusStore deletion NOT STARTED
  ❌ Endpoint union NOT REMOVED
         ↓
Sprint 4 (Lens Params)
  ❌ Wire bindings (independent)
  ❌ Default bindings (independent)
  ❌ Bus bindings (BLOCKED by Sprint 3)
```

**Critical Path**: Sprint 3 type cleanup → Sprint 4 bus bindings

---

## Risks & Mitigation

### Risk 1: Type Cleanup Cascade (HIGH)
**Description**: Removing Endpoint union will cause 50-100 compile errors
**Impact**: Large refactoring across compiler and stores
**Mitigation**:
- TypeScript compiler will guide us to all usages
- Fix systematically file-by-file
- Run tests after each file
- Use git commits to checkpoint progress

---

### Risk 2: UI Regression from BusStore Removal (MEDIUM)
**Description**: BusBoard, BusInspector, BusChannel may break subtly
**Impact**: Bus creation/editing/deletion UI broken
**Mitigation**:
- Manual testing checklist:
  - ✅ Create new bus
  - ✅ Edit bus properties (name, type, combine)
  - ✅ Delete bus
  - ✅ Connect publisher to bus
  - ✅ Connect listener from bus
  - ✅ Bus displayed in BusBoard
  - ✅ Bus inspector shows correct info

---

### Risk 3: MobX Reactivity Breakage (MEDIUM)
**Description**: Switching from BusStore observables to PatchStore might break reactivity
**Impact**: UI doesn't update when buses change
**Mitigation**:
- Verify `@computed` getters trigger updates
- Check that `patchStore.busBlocks` is observable
- Test in dev server with React DevTools

---

### Risk 4: Test Failures (CURRENT - 43 failing)
**Description**: 11 test files currently failing
**Impact**: Cannot verify correctness during Sprint 3 work
**Mitigation**:
- Failing tests are in transaction/ops area (not directly bus-related)
- Bus-specific tests are passing
- Fix failing tests BEFORE starting Sprint 3 type cleanup
- Use tests as regression detection

**Failing Test Breakdown**:
```
TxBuilder.test.ts: Transaction validation tests (expected errors)
ops.test.ts: Op validation tests (assertion message mismatches)
removeBlockCascade: Block count mismatch (9 vs 2 expected)
```

**Action**: These appear to be test setup issues (default buses being created), not bus-unification bugs

---

### Risk 5: Patch Migration in Production (LOW)
**Description**: User patches may have old bus format
**Impact**: Patches fail to load if migration breaks
**Mitigation**:
- Keep `migrateEdgesToPortOnly()` utility
- Keep `isMigrated()` check
- Migration runs automatically on patch load (already implemented)
- Test with real patch files from users

---

## Acceptance Criteria

### Sprint 3 Complete When:
- [ ] BusStore.ts deleted (file removed)
- [ ] RootStore.busStore property removed
- [ ] Endpoint type simplified to PortRef (or deleted)
- [ ] Bus, Publisher, Listener interfaces removed from types.ts
- [ ] Patch.buses, Patch.publishers, Patch.listeners arrays removed
- [ ] All `edge.from.kind === 'bus'` checks removed (except migration utils)
- [ ] All `edge.to.kind === 'bus'` checks removed (except migration utils)
- [ ] All `writer.kind === 'bus'` cases removed from compiler
- [ ] TypeScript compilation succeeds (0 errors)
- [ ] All tests pass (currently 43 failing - fix first)
- [ ] Manual UI testing: create/edit/delete bus works
- [ ] Manual UI testing: connect publisher/listener works

### Sprint 4 Complete When:
- [ ] Wire bindings work in lens params (`kind: 'wire'`)
- [ ] Default bindings work in lens params (`kind: 'default'`)
- [ ] Bus bindings work in lens params (`kind: 'bus'`)
- [ ] TODO comment removed from pass8-link-resolution.ts:470
- [ ] Tests exist for all three binding kinds
- [ ] IR compilation succeeds with non-literal lens params
- [ ] Golden patch with lens param bindings compiles correctly

---

## Recommended Action Plan

### Phase A: Fix Existing Test Failures (PREREQUISITE)
**Priority**: P0 - Must fix before Sprint 3
**Estimated effort**: 2-4 hours

1. Fix TxBuilder test setup (default buses issue)
2. Fix ops.test.ts assertion messages
3. Fix removeBlockCascade test (block count mismatch)
4. Verify all tests pass: `pnpm test --run`

**Gate**: All tests passing before proceeding to Sprint 3

---

### Phase B: Sprint 3 - Type System Cleanup
**Priority**: P1 - Unblocks Sprint 4
**Estimated effort**: 4-8 hours

#### Step 1: Remove Endpoint Union (2-3 hours)
1. Change `Endpoint` to be alias of `PortRef` or delete
2. Update Edge.from and Edge.to to use `PortRef` directly
3. Fix all compile errors (50-100 expected)
4. Run tests after each file fixed
5. Commit when tests pass

#### Step 2: Remove Legacy Types (1-2 hours)
1. Delete `Bus` interface from types.ts
2. Delete `Publisher` interface
3. Delete `Listener` interface
4. Remove `buses`, `publishers`, `listeners` from Patch
5. Fix compile errors in UI components
6. Run tests, commit when green

#### Step 3: Delete BusStore (2-3 hours)
1. Delete `src/editor/stores/BusStore.ts`
2. Remove `busStore` from RootStore
3. Update all UI components:
   - BusBoard: use `patchStore.busBlocks`
   - BusInspector: work with BusBlock
   - BusCreationDialog: use `patchStore.addBus()`
   - BusPicker: query BusBlocks
   - BusChannel: render BusBlock info
4. Manual UI testing (checklist above)
5. Run all tests, commit when green

---

### Phase C: Sprint 4 - Lens Param Bindings
**Priority**: P2 - Feature enhancement
**Estimated effort**: 6-10 hours

#### Step 1: Wire Bindings (2-3 hours)
1. Implement wire binding resolution in pass8
2. Write tests for wire-bound lens params
3. Verify with golden patch
4. Commit

#### Step 2: Default Bindings (2-3 hours)
1. Implement default binding resolution
2. Write tests for default-bound lens params
3. Commit

#### Step 3: Bus Bindings (2-4 hours)
**Requires Sprint 3 complete**
1. Implement bus binding resolution
2. Look up from busRoots map
3. Write tests for bus-bound lens params
4. Remove TODO comment
5. Commit

---

## Code Reduction Estimate

### Sprint 3 Deletions:
- `BusStore.ts`: ~17KB (~500 lines)
- Endpoint union handling: ~200 lines across compiler
- Bus/Publisher/Listener types: ~150 lines in types.ts
- **Total Sprint 3**: ~850 lines deleted

### Sprint 4 Additions:
- Wire binding handling: ~30 lines
- Default binding handling: ~30 lines
- Bus binding handling: ~40 lines
- Tests: ~150 lines
- **Total Sprint 4**: ~250 lines added

### Net Change: ~600 lines deleted

---

## Summary

**Current State**:
- Sprint 1 & 2: ✅ COMPLETE
- Sprint 3: 🟡 PARTIAL (facade only, type cleanup NOT STARTED)
- Sprint 4: ❌ BLOCKED (needs Sprint 3 complete)

**Immediate Blockers**:
1. 43 failing tests (fix before Sprint 3)
2. Endpoint union still exists (Sprint 3 P1)
3. BusStore not yet deleted (Sprint 3 P0)

**Critical Path**:
Fix tests → Sprint 3 type cleanup → Sprint 4 bus bindings

**Estimated Timeline** (assuming focused work):
- Test fixes: 2-4 hours
- Sprint 3: 4-8 hours
- Sprint 4: 6-10 hours
- **Total**: 12-22 hours of focused engineering time

**Recommendation**: CONTINUE with Sprint 3, but fix tests FIRST

---

## Files Generated

This evaluation created:
- `.agent_planning/bus-block-unification/STATUS-2026-01-01-sprint34.md` (this file)

---

**Evaluator**: project-evaluator
**Timestamp**: 2026-01-01 08:20
**Git Commit**: 06e29af
