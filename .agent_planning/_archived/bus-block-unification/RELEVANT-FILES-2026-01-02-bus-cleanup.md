# Relevant Files: Bus Cleanup Implementation

**Date**: 2026-01-02
**Scope**: module:bus-cleanup:20260102-100000

---

## Critical Files (Must Read First)

### 1. Data Storage & Serialization

**File**: `src/editor/stores/BusStore.ts`
**Lines**: 37-43 (arrays), 82-84 (facade pattern), 232-527 (methods)
**Action**: Phase 1 - Redirect to edges; Phase 2 - Delete entire file

**File**: `src/editor/stores/RootStore.ts`
**Lines**: 38 (busStore property), 95 (constructor), 237-242 (loadPatch), 289-291 (toPatch), 329-330 (importPatch), 402-403 (clearPatch)
**Action**: Phase 1 - Update serialization; Phase 2 - Delete busStore property

**File**: `src/editor/stores/PatchStore.ts`
**Action**: Phase 1 - Add edge-based getters; Phase 2 - Add methods from BusStore

---

### 2. Primary User (Highest Impact)

**File**: `src/editor/modulation-table/ModulationTableStore.ts`
**Lines**: 92, 103, 336, 341, 441, 464, 681, 683, 693, 712, 720, 742
**Why**: 13 call sites to busStore - main UI for bus routing
**Action**: Phase 2 - Update all to use patchStore
**Risk**: HIGH - User-facing UI will break if done wrong

---

### 3. Type Definitions

**File**: `src/editor/types.ts`
**Why**: Core type definitions used across 100+ files
**Expected Impact**: 50-100 compile errors

---

### 4. Compiler (Functional Dependencies)

**File**: `src/editor/compiler/passes/pass1-normalize.ts`
**Lines**: 63, 72, 95-96
**Action**: Phase 4 - Filter by BusBlock port instead
**Risk**: MEDIUM - Affects combine ordering

**File**: `src/editor/compiler/passes/pass6-block-lowering.ts`
**Lines**: 417
**Why**: Returns null for bus writers (handled in Pass 7)
**Action**: Phase 4 - Handle via BusBlock recognition
**Risk**: LOW - Already has BusBlock path

**File**: `src/editor/compiler/passes/pass7-bus-lowering.ts`
**Lines**: 167, 274
**Why**: Legacy edge detection for backward compatibility
**Risk**: LOW - Backward compat only

**File**: `src/editor/compiler/passes/resolveWriters.ts`
**Lines**: 162-169
**Action**: Phase 4 - All writers become 'wire' or 'default' (no 'bus' kind)
**Risk**: MEDIUM - Affects dependency graph

---

### 5. Store Utilities

**File**: `src/editor/stores/SelectionStore.ts`
**Lines**: 71
**Why**: Returns selected bus ID via `selection.kind === 'bus'`
**Action**: Phase 4 - Recognize BusBlock selections instead
**Risk**: LOW - Selection logic only

**File**: `src/editor/stores/DiagnosticStore.ts`
**Lines**: 177
**Why**: Matches diagnostic targets via `target.kind === 'bus'`
**Action**: Phase 4 - Match BusBlock by params.busId
**Risk**: LOW - Diagnostic filtering only

---

### 6. Migration Infrastructure (Keep for Safety)

**File**: `src/editor/edgeMigration.ts`
**Lines**: 34, 149, 243-244, 275-280
**Why**: Validates and migrates legacy bus edges
**Action**: KEEP - Needed for backward compatibility
**Risk**: NONE - Leave as-is

**File**: `src/editor/bus-block/migration.ts`
**Lines**: Throughout
**Why**: Edge migration utilities
**Action**: KEEP - Migration infrastructure
**Risk**: NONE - Leave as-is

---

## Secondary Files (Update After Main Work)

### 7. Default Sources & Validation

**File**: `src/editor/defaultSources/validate.ts`
**Lines**: 310, 400, 407, 415
**Action**: Phase 2 - Update to patchStore
**Risk**: LOW - Validation logic

---

### 8. Debug Utilities

**File**: `src/editor/stores/DebugStore.ts**
**Lines**: Not shown in grep (2 references)
**Why**: Debug inspection
**Action**: Phase 2 - Update to patchStore
**Risk**: NONE - Debug only

---

### 9. Tests (Update with Main Code)

**Action**: Update after Phase 3 type cleanup
**Expected**: Test utilities need edge construction instead of array construction

---

## Conversion Utilities (Already Exist)

**File**: `src/editor/bus-block/conversion.ts`
**Functions**: `convertBusToBlock()`, `convertBlockToBus()`
**Why**: Bidirectional Bus ↔ BusBlock conversion
**Action**: KEEP - Used by PatchStore.buses getter

**File**: `src/editor/compiler/bus-block-utils.ts`
**Functions**: `getBusBlocks()`, `isBusBlock()`, `getBusBlockCombineMode()`
**Why**: Compiler utilities for BusBlock recognition
**Action**: KEEP - Already used by compiler

---

## Files That Will Need Edge Construction Logic

### New Utilities Needed (Phase 1)

**Location**: `src/editor/stores/PatchStore.ts` (add these)

```typescript
// Extract busId from BusBlock params
// Preserve adapterChain, lensStack from edge
```

```typescript
// Extract busId from BusBlock params
// Preserve adapterChain, lensStack from edge
```

```typescript
// Set to.kind = 'port', to.blockId = BusBlock.id, to.slotId = 'in'
```

```typescript
// Set from.kind = 'port', from.blockId = BusBlock.id, from.slotId = 'out'
```

**Estimated effort**: 2-3 hours to implement and test

---

## Dependency Graph

```
Phase 0: Fix Current Tests
  └─> lenses.test.ts, ConstToSignal.ts, arithmetic.ts, ease.ts, shaping.ts
        (NOT bus-related - recent transform work)

Phase 1: Migrate Data
  ├─> BusStore.ts (redirect arrays)
  ├─> RootStore.ts (update serialization)

Phase 2: Delete BusStore
  ├─> ModulationTableStore.ts (13 updates) ← CRITICAL
  ├─> RootStore.ts (11 updates)
  ├─> PatchStore.ts (10 updates + add methods from BusStore)
  ├─> defaultSources/validate.ts (5 updates)
  ├─> DebugStore.ts (2 updates)
  ├─> RootStore.ts (delete busStore property)
  └─> DELETE: BusStore.ts

Phase 3: Type Cleanup
  ├─> types.ts (simplify Endpoint, delete interfaces)
  └─> ~20 files with compile errors (TypeScript guided)

Phase 4: Remove kind Checks
  ├─> Compiler passes (4 files)
  └─> Stores (3 files)
```

---

## Files to Read in Order (For Implementer)

### Before Starting:
1. `.agent_planning/bus-block-unification/STATUS-2026-01-02-bus-cleanup.md` - This evaluation
2. `.agent_planning/bus-block-unification/AUDIT-2026-01-02-unification.md` - Architecture audit
3. `.agent_planning/bus-block-unification/STATUS-2026-01-01-sprint34.md` - Sprint status

### Phase 1 Implementation:
4. `src/editor/stores/PatchStore.ts` - Where new getters go
5. `src/editor/bus-block/conversion.ts` - Pattern for edge conversion
6. `src/editor/stores/BusStore.ts` - Arrays to redirect
7. `src/editor/stores/RootStore.ts` - Serialization to update

### Phase 2 Implementation:
8. `src/editor/modulation-table/ModulationTableStore.ts` - Biggest user (13 sites)
9. `src/editor/stores/RootStore.ts` - Lifecycle methods
10. `src/editor/stores/PatchStore.ts` - Bus creation helpers
11. `src/editor/defaultSources/validate.ts` - Validation logic

### Phase 3 Implementation:
12. `src/editor/types.ts` - Type definitions
13. Follow TypeScript compiler errors

### Phase 4 Implementation:
14. Compiler passes (pass1, pass6, pass7, resolveWriters)
15. Store utilities (PatchStore, SelectionStore, DiagnosticStore)

---

## Test Files (Update After Main Code)

### Bus-Specific Tests:
- `src/editor/__tests__/bus-compilation.test.ts`
- `src/editor/__tests__/field-bus-compilation.test.ts`
- `src/editor/__tests__/edgeMigration.test.ts`
- `src/editor/compiler/__tests__/bus-block-utils.test.ts`
- `src/editor/compiler/passes/__tests__/pass7-bus-lowering.test.ts`
- `src/editor/semantic/__tests__/busSemantics.test.ts`
- `src/editor/bus-block/__tests__/migration.test.ts`

### Store Tests:
- `src/editor/stores/__tests__/BusStore.events.test.ts` - DELETE with BusStore
- `src/editor/stores/__tests__/DiagnosticStore.test.ts`
- `src/editor/stores/__tests__/DebugUIStore.test.ts`

---

## Summary for Implementer

**Start Here**:
1. Read STATUS-2026-01-02-bus-cleanup.md (this evaluation)
2. Fix current test failures (Phase 0)

**Critical Files** (highest impact):
- `src/editor/stores/PatchStore.ts` - New home for bus data/methods
- `src/editor/modulation-table/ModulationTableStore.ts` - Main user (13 sites)
- `src/editor/stores/RootStore.ts` - Serialization and lifecycle

**Don't Touch** (migration infrastructure):
- `src/editor/edgeMigration.ts`
- `src/editor/bus-block/migration.ts`

**Total Effort**: 10-16 hours across 4 phases
**Files Modified**: ~40 files
**Files Deleted**: 1 file (BusStore.ts)

---

**Document**: RELEVANT-FILES-2026-01-02-bus-cleanup.md
**Generated**: 2026-01-02 10:00
**Scope**: module:bus-cleanup:20260102-100000
