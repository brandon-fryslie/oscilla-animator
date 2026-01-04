# Dead Code & Duplication Audit Report

**Date**: 2026-01-03
**Codebase**: oscilla-animator_codex
**Total Lines**: ~154,375 lines in src/

---

## Executive Summary

| Category | Status | Impact |
|----------|--------|--------|
| **Unimported Files** | ❌ Critical | 103 files not reachable from entry point |
| **Backup/Orig Files** | ⚠️ High | 4 files (2,346+ lines) committed to repo |
| **Deprecated Code** | ⚠️ High | ~40+ deprecated exports still present |
| **Code Duplication** | ⚠️ Medium | Significant patterns, especially DefaultSource blocks |
| **Unused Dependencies** | ⚠️ Medium | 2 npm packages |

**Overall Efficiency Rating**: **Bloated** (>15% dead/unused code)

---

## P0 - Critical Issues

### 1. Backup Files Committed to Repository

These should be deleted immediately:

| File | Lines |
|------|-------|
| `src/editor/modulation-table/ModulationTableStore.ts.orig` | 913 |
| `src/editor/runtime/executor/RuntimeState.ts.orig` | 664 |
| `src/editor/stores/PatchStore.ts.orig` | 769 |
| `src/editor/compiler/compileBusAware.ts.backup` | 1,315 |
| **Total** | **3,661 lines** |

**Action**: Delete these files and add `*.orig`, `*.backup`, `*.bak` to `.gitignore`

---

## P1 - High Priority Issues

### 2. Unimported Files (103 files)

The following files are not reachable from the entry point (`src/main.tsx`). They may be:
- Dead code that should be deleted
- Code in development that needs wiring
- Test utilities that should be marked differently

**Major Dead Areas** (entire directories/modules unreachable):

#### Compositor Module (~8 files)
```
src/editor/compositor/compositor.ts
src/editor/compositor/index.ts
src/editor/compositor/resources.ts
src/editor/compositor/rewrite.ts
src/editor/compositor/scoped.ts
src/editor/compositor/selection.ts
src/editor/compositor/selectors.ts
src/editor/compositor/stack.ts
src/editor/compositor/tree-adapter.ts
```

#### Compiler Passes (~8 files)
```
src/editor/compiler/passes/index.ts
src/editor/compiler/passes/pass0-materialize.ts
src/editor/compiler/passes/pass1-normalize.ts
src/editor/compiler/passes/pass2-types.ts
src/editor/compiler/passes/pass3-time.ts
src/editor/compiler/passes/pass4-depgraph.ts
src/editor/compiler/passes/pass5-scc.ts
src/editor/compiler/passes/pass7-bus-lowering.ts
```

#### Unified Compiler (~12 files)
```
src/editor/compiler/unified/index.ts
src/editor/compiler/unified/blocks/DelayBlock.ts
src/editor/compiler/unified/blocks/FlowFieldOriginBlock.ts
src/editor/compiler/unified/blocks/HistoryBlock.ts
src/editor/compiler/unified/blocks/IntegrateBlock.ts
src/editor/compiler/unified/blocks/LinearPhaseBlock.ts
src/editor/compiler/unified/blocks/PhaseMachineBlock.ts
src/editor/compiler/unified/blocks/RadialOriginBlock.ts
src/editor/compiler/unified/DependencyGraph.ts
src/editor/compiler/unified/FieldExpr.ts
src/editor/compiler/unified/RuntimeAdapter.ts
src/editor/compiler/unified/StateBlock.ts
src/editor/compiler/unified/TimeCtx.ts
src/editor/compiler/unified/UnifiedCompiler.ts
```

#### Debug UI Components (~4 files)
```
src/editor/debug-ui/FieldHeatmap.tsx
src/editor/debug-ui/FieldHistogram.tsx
src/editor/debug-ui/FieldVisualizationMode.tsx
src/editor/debug-ui/PrintsTab.tsx
```

#### IR Module (~7 files)
```
src/editor/ir/index.ts
src/editor/ir/schema/CompiledProgramIR.ts
src/editor/ir/time/TimeDerivation.ts
src/editor/ir/types/BufferDesc.ts
src/editor/ir/types/DebugIndex.ts
src/editor/ir/types/Indices.ts
src/editor/ir/types/typeConversion.ts
```

#### Lenses Module (~5 files)
```
src/editor/lenses/index.ts
src/editor/lenses/lensInstances.ts
src/editor/lenses/LensRegistry.ts
src/editor/lenses/lensResolution.ts
src/editor/lenses/printSink.ts
```

#### Miscellaneous Dead UI Components
```
src/editor/BusCreationDialog.tsx
src/editor/BusPicker.tsx
src/editor/DragOverlayContent.tsx
src/editor/HelpModal.tsx
src/editor/LayoutSelector.tsx
src/editor/PublishMenu.tsx
src/editor/TrashZone.tsx
```

**Action**: Review each file - either wire it into the app or delete it.

---

### 3. Deprecated Adapters Module (441 lines)

The entire `src/editor/adapters/` directory is marked deprecated:

| File | Lines | Replacement |
|------|-------|-------------|
| `AdapterRegistry.ts` | 248 | `TRANSFORM_REGISTRY` from transforms/TransformRegistry.ts |
| `autoAdapter.ts` | 193 | `TRANSFORM_REGISTRY.findAdapters()` |

**Action**: Complete migration to TRANSFORM_REGISTRY and delete this directory.

---

### 4. Deprecated Bus-Aware Compiler (124 lines + backup)

`src/editor/compiler/compileBusAware.ts` is deprecated in favor of pass-based pipeline.

**Action**: Verify no imports remain, then delete along with backup.

---

## P2 - Medium Priority Issues

### 5. Unused Dependencies

From `depcheck` analysis:

| Package | Status |
|---------|--------|
| `@dnd-kit/sortable` | Not imported anywhere |
| `@mui/x-data-grid` | Not imported anywhere |

**Action**: Remove from package.json if truly unused.

---

### 6. Code Duplication - DefaultSource Blocks (11 files)

**Location**: `src/editor/compiler/blocks/defaultSources/`

These 11 files share 70-90% identical code:
- `DSConstSignalFloat.ts`
- `DSConstSignalInt.ts`
- `DSConstSignalColor.ts`
- `DSConstSignalPoint.ts`
- `DSConstScalarFloat.ts`
- `DSConstScalarInt.ts`
- `DSConstScalarString.ts`
- `DSConstScalarWaveform.ts`
- `DSConstFieldFloat.ts`
- `DSConstFieldColor.ts`
- `DSConstFieldVec2.ts`

Each contains:
- Nearly identical IR lowering function
- Same `registerBlockType()` pattern
- Same legacy BlockCompiler export pattern

**Recommendation**: Create a factory function that generates these blocks from configuration:

```typescript
// Proposed: src/editor/compiler/blocks/defaultSources/createConstBlock.ts
export function createConstBlock(config: {
  kind: 'signal' | 'scalar' | 'field';
  type: 'float' | 'int' | 'color' | 'point' | ...;
  // ... other type-specific config
}): BlockCompiler { ... }
```

**Savings**: ~800-1000 lines of duplicated code

---

### 7. Scattered Validation Functions

29 `validate*` functions across 14 files with similar patterns:

**High overlap files**:
- `src/editor/defaultSources/validate.ts` (600+ lines)
- `src/editor/transforms/validate.ts` (170 lines)
- `src/editor/semantic/busContracts.ts` (~200 lines)
- `src/editor/compiler/passes/combine-utils.ts` (~200 lines)

**Common pattern**: Error accumulation, diagnostic creation, early returns.

**Recommendation**: Extract shared validation utilities:
- Common error accumulation pattern
- Diagnostic factory functions
- Type guard validators

---

### 8. Multiple Materialization Implementations

Similar logic in:
- `src/editor/runtime/executor/steps/executeMaterialize.ts`
- `src/editor/runtime/executor/steps/executeMaterializePath.ts`
- `src/editor/runtime/executor/steps/executeMaterializeColor.ts`
- `src/editor/runtime/executor/steps/executeMaterializeTestGeometry.ts`
- `src/editor/runtime/executor/steps/executeMeshMaterialize.ts`
- `src/editor/runtime/field/Materializer.ts`
- `src/editor/runtime/field/RenderSinkMaterializer.ts`

**Recommendation**: Extract common materialization base or utility functions.

---

## P3 - Low Priority / Technical Debt

### 9. Deprecated Type Exports (~40 occurrences)

Many `@deprecated` exports remain in:
- `src/core/types.ts` (TypeWorld 'special')
- `src/editor/types.ts` (TransformLegacyStep, SlotType stub, BlockKind)
- `src/editor/compiler/ir/types.ts` (multiple deprecated type helpers)
- `src/editor/compiler/ir/schedule.ts` (deprecated batch slots)
- `src/editor/compiler/ir/IRBuilderImpl.ts` (legacy register methods)

**Recommendation**: Set a timeline for removing deprecated exports and migrate consumers.

---

### 10. Commented-Out Code Blocks

~17 instances of commented-out function/import statements detected. Examples:
- `src/editor/modulation-table/ModulationTableStore.ts:908`
- `src/editor/semantic/graph.ts:99-109`
- `src/editor/compiler/unified/__tests__/UnifiedCompiler.test.ts:163,194`

**Recommendation**: Delete commented code or restore if needed.

---

### 11. TODO Comments Indicating Incomplete Work

~50 TODO comments found, including:
- Tests disabled with "TODO: Re-enable" (4 files)
- "TODO: BROKEN" in ModulationTableStore
- Multiple IR integration TODOs

**Recommendation**: Triage TODOs - fix, delete, or convert to GitHub issues.

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total source lines | ~154,375 |
| Unimported files | 103 |
| Backup files to delete | 4 (3,661 lines) |
| Deprecated modules to migrate | 3 (~700 lines) |
| Duplicated block generators | 11 (~1,000 lines saveable) |
| Unused npm dependencies | 2 |
| TODO comments | ~50 |
| @deprecated markers | ~40 |

**Estimated cleanup impact**: 10,000-15,000 lines of dead/redundant code removal possible.

---

## Recommended Action Plan

1. **Immediate** (P0): Delete .orig and .backup files, update .gitignore
2. **This Sprint** (P1): Audit 103 unimported files - wire or delete
3. **Next Sprint** (P2):
   - Remove unused npm deps
   - Create DefaultSource block factory
   - Complete adapter migration
4. **Backlog** (P3):
   - Remove deprecated exports
   - Clean up commented code
   - Triage TODOs
