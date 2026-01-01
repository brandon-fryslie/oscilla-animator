# Phase 0 Compatibility Cleanup - Eval Cache

**Cached**: 2026-01-01
**Scope**: phase0.5-compat-cleanup
**Confidence**: HIGH
**Source**: project-evaluator STATUS-2026-01-01.md

---

## Legacy Code Categories

**7 major categories** of removal targets after Phase 0 completion:

### 1. Deprecated Type Definitions
- **Location**: `src/editor/types.ts`
- **Types**: Connection (lines 744-779), Publisher (302-330), Listener (334-356)
- **Status**: Marked `@deprecated`, still used in 44-46 files
- **Risk**: HIGH - foundational types

### 2. Migration Helper Code
- **Location**: `src/editor/edgeMigration.ts` (315 lines)
- **Purpose**: Bidirectional Edge ↔ Connection/Publisher/Listener conversion
- **Current usage**: Pass 1 calls `convertFromEdges()` for legacy passes
- **Removal blocker**: Compiler passes still use legacy arrays
- **Risk**: LOW - well-isolated module

### 3. Dual-Path Execution in Compiler
- **Pass 1**: Lines 99-122 (format detection), 140-156 (dual connectivity check)
- **Pass 2**: Line 460 (legacy wire format)
- **Pass 7**: Lines 164-177 (dual publisher retrieval), 88-119 (`getPublishersFromEdges()`)
- **Impact**: ~15-20% code overhead, multiple sources of truth
- **Risk**: HIGH - core compilation logic

### 4. Legacy Transform Storage
- **Problem**: Edge uses `lensStack`/`adapterChain` instead of `transforms` array
- **Target**: Unified `transforms?: TransformStep[]` field
- **Files affected**: 20 files
- **TransformStep type**: Already exists in `src/editor/transforms/types.ts:27-29`
- **Risk**: MEDIUM - serialization format change

### 5. Patch Interface Legacy Arrays
- **Current**: `connections`, `publishers`, `listeners` still required
- **Target**: Remove legacy arrays, make `edges: Edge[]` required
- **Also remove**: `defaultSources`, `defaultSourceAttachments` (materialized by Pass 0)
- **Risk**: HIGH - breaking change for serialization

### 6. PatchStore Legacy Arrays
- **Location**: `src/editor/stores/PatchStore.ts`
- **Issue**: Maintains both `connections` and `edges` observables
- **Methods**: Parallel add/remove/update methods for both types
- **Risk**: HIGH - central data structure, affects UI and transactions

### 7. Registry Facades
- **Files**: `src/editor/lenses/LensRegistry.ts`, `src/editor/adapters/AdapterRegistry.ts`
- **Status**: Original registries still export APIs
- **Blocker**: Compiler still imports from old registries (Sprint 4 incomplete)
- **Risk**: LOW - isolated, TransformRegistry working

---

## Critical Path Sequence

**MUST BE SEQUENTIAL**:
1. Phase 1: Make edges authoritative (1-2 weeks)
2. Phase 2: Compiler edges-only (1 week)
3. Phase 3: Remove migration helpers (1 day)
4. Phase 4: Clean type definitions (1 day)

**PARALLEL TRACKS**:
- Track A: Transform storage unification (1 week)
- Track B: Registry cleanup (2-3 days)

**Total Effort**: 3-5 weeks (sequential + parallel)

---

## Key Dependencies

```
Patch.edges required → PatchStore cleanup + Compiler edges-only
                    → Migration helpers removal
                    → Deprecated types removal

Transform field addition (parallel, independent)
Registry cleanup (parallel, blocked by Sprint 4 deliverable 3)
```

---

## Ambiguities

1. **Transform field naming**: `transforms` vs `transformStack`?
2. **Migration timeline**: All phases together or incremental?
3. **Patch version bump**: Required when removing legacy arrays?
4. **Transaction ops**: Do all ops need Edge type support?
5. **Serialization compat**: Keep legacy arrays during save?

---

## Removal Blockers

**Before any removal can happen**:
- All patches must populate `edges` array
- Compiler passes must use edges exclusively
- Transaction system must support Edge type
- UI components must create edges, not connections

**Sprint 4 incomplete work**:
- Compiler still imports from LensRegistry/AdapterRegistry
- TRANSFORM_REGISTRY created but unused

---

## File Change Summary

**Phase 1** (4 files): types.ts, PatchStore.ts, UI components, migration utility
**Phase 2** (5 files): pass1/2/7/8-*.ts, ir/patches.ts
**Phase 3** (2 files): DELETE edgeMigration.ts and test
**Phase 4** (1 file): types.ts (remove interfaces)
**Track A** (3+ files): types.ts, migrate.ts, edge creation points, compiler
**Track B** (4+ files): pass6/8-*.ts, DELETE old registries

---

## Break-It Finding

**Ambiguous behavior**: Patch with `edges=[]` and `connections=filled` uses connections (fallback)

**Should**: Empty edges array should be valid, not trigger fallback

**Recommendation**: Add `edgesAuthoritative: boolean` flag during migration

---

## Estimated Timeline

- **Minimum viable cleanup**: 2-3 weeks (edges authoritative + dual-path removal)
- **Full cleanup**: 3-5 weeks (includes transform unification + registry cleanup)
- **Interleaved with other work**: 6-8 weeks

---

## Usage Notes for Evaluators

**When evaluating future work**:
- Check if it depends on cleanup (e.g., new edge features blocked by legacy arrays)
- Consider migration overhead if adding new connection types
- Verify new code uses edges, not connections/publishers/listeners

**When evaluating bugs**:
- Dual-path execution can cause "works in one path, fails in other" bugs
- Transform storage split can cause adapter/lens application inconsistencies
- Migration helpers might mask underlying edge creation bugs
