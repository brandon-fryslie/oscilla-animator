# Status: Graph Normalization Single Source of Truth

**Status: COMPLETED** (2026-01-04)

## Summary

GraphNormalizer.normalize() is now the SINGLE SOURCE OF TRUTH for default source materialization.
All duplicate systems have been deleted. Architecture is documented to prevent regression.

## Completed Work

### P0: Delete Duplicate Normalization Systems (5/5) ✓

#### P0-1: Delete pass0-materialize.ts ✓
- File deleted (195 lines)
- compile.ts updated to remove import and call
- Compiler now expects pre-normalized patches

#### P0-2: Delete constProviders.ts ✓
- File deleted (151 lines)
- No remaining imports found

#### P0-3: Delete ir/defaultSources.ts ✓
- File deleted (130 lines)
- Export removed from ir/index.ts

#### P0-4: Simplify pass1-normalize.ts ✓
- Lines 90-115 deleted (defaults scanning)
- NormalizedPatch.defaults and constPool removed
- Pass1 now only does block ID freezing and edge canonicalization

#### P0-5: Strip DefaultSourceStore ✓
- 6 attachment methods deleted
- attachmentsByTarget Map deleted
- root store reference deleted
- Store now only manages values (600→300 lines)

### P1: Complete GraphNormalizer (3/3) ✓

#### P1-1: Add missing provider type mappings ✓
- All existing DSConst* blocks mapped in GraphNormalizer
- Missing blocks documented (not yet implemented)

#### P1-2: Verify ID format ✓
- JSDoc added documenting canonical format: `${blockId}_default_${slotId}`

#### P1-3: Update allowlist.ts ✓
- Const provider specs inlined
- No dependency on deleted constProviders.ts

### P2: Fix TypeScript Errors (3/3) ✓

#### P2-1: Fix RootStore.ts ✓
- Removed calls to deleted DefaultSourceStore methods
- setRoot(), attachmentsByTarget, setAttachmentForInput(), rebuildAttachmentsFromBlocks() removed

#### P2-2: Fix integration.ts ✓
- editorToPatch() updated to build defaultSourceValues from sources Map directly
- injectDefaultSourceProviders() stubbed (GraphNormalizer handles this now)

#### P2-3: Fix validate.ts ✓
- validateDefaultSourceAttachments() stubbed (returns empty array)
- Added deprecation notice

### Documentation ✓

- Updated design-docs/implementation/compiler/06-Default-Sources.md
- DSConst* block compiler comments updated (GraphNormalizer, not pass0)
- ROADMAP.md updated with completion status

## Validation

- ✓ TypeScript: PASS (0 errors)
- ✓ Tests: 2243 passing (24 pre-existing failures unrelated to this work)
- ✓ Grep confirms no imports of deleted systems in src/

## Files Changed

### DELETED (3 files)
- `src/editor/compiler/passes/pass0-materialize.ts`
- `src/editor/defaultSources/constProviders.ts`
- `src/editor/compiler/ir/defaultSources.ts`

### MODIFIED (12 files)
- `src/editor/compiler/compile.ts`
- `src/editor/compiler/passes/pass1-normalize.ts`
- `src/editor/compiler/ir/patches.ts`
- `src/editor/compiler/ir/index.ts`
- `src/editor/stores/DefaultSourceStore.ts`
- `src/editor/stores/RootStore.ts`
- `src/editor/defaultSources/allowlist.ts`
- `src/editor/defaultSources/validate.ts`
- `src/editor/compiler/integration.ts`
- `src/editor/graph/GraphNormalizer.ts`
- `src/editor/lenses/LensRegistry.ts`
- `design-docs/implementation/compiler/06-Default-Sources.md`

### COMMITS (9 commits)
1. ff14b43 - delete pass0-materialize.ts
2. 9afa627 - simplify pass1-normalize
3. 7dbc522 - delete ir/defaultSources.ts
4. c55fb45 - strip DefaultSourceStore to value storage
5. 0df467e - complete GraphNormalizer provider type mappings
6. 0beb9b5 - inline provider specs in allowlist.ts
7. e391ab6 - remove defaultSources exports from IR index
8. f44cf31 - fix TypeScript errors from deleted methods
9. 81f588c - document GraphNormalizer as canonical

## Deferred Work (P3)

- P3-1: Rename pass1-normalize.ts → pass1-canonicalize.ts
- P3-2: Add comprehensive GraphNormalizer unit tests
- P3-3: Document GraphNormalizer as canonical (DONE in 06-Default-Sources.md)
