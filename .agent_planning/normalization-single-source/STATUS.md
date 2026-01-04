# Status: Graph Normalization Single Source of Truth

## Completed (P0, P1)

### P0-1: Delete pass0-materialize.ts ✓
- File deleted
- compile.ts updated to remove import and call
- Compiler now expects pre-normalized patches

### P0-2: Delete constProviders.ts ✓  
- File deleted
- No remaining imports found

### P0-3: Delete ir/defaultSources.ts ✓
- File deleted
- Export removed from ir/index.ts

### P0-4: Simplify pass1-normalize.ts ✓
- Lines 90-115 deleted (defaults scanning)
- NormalizedPatch.defaults and constPool removed
- Pass1 now only does block ID freezing and edge canonicalization

### P0-5: Strip DefaultSourceStore ✓
- 6 attachment methods deleted
- attachmentsByTarget Map deleted
- root store reference deleted
- Store now only manages values

### P1-1: Add missing provider type mappings ✓
- All existing DSConst* blocks mapped in GraphNormalizer
- Missing blocks documented (not yet implemented)

### P1-2: Verify ID format ✓
- JSDoc added documenting canonical format: `${blockId}_default_${slotId}`

### P1-3: Update allowlist.ts ✓
- Const provider specs inlined
- No dependency on deleted constProviders.ts

## Remaining Work (P2 - TypeScript Errors)

### Type Errors to Fix

1. **RootStore.ts** (lines 84, 258, 294-297, 302):
   - Line 84: `this.defaultSourceStore.setRoot(this)` - method doesn't exist
   - Line 259: `attachmentsByTarget.values()` - property doesn't exist
   - Lines 294-297: `setAttachmentForInput()` - method doesn't exist  
   - Line 308: `rebuildAttachmentsFromBlocks()` - method doesn't exist

2. **integration.ts** (lines 427, 463, 527):
   - Lines 427, 527: `attachmentsByTarget` - property doesn't exist
   - Line 463: Type mismatch (unknown vs string)

3. **validate.ts** (line 52, 58, 66, 74, 82, 90):
   - Line 52: `attachmentsByTarget` - property doesn't exist
   - Lines 58-90: Type mismatches due to attachmentsByTarget removal

4. **pass3-time.test.ts** (line 23):
   - defaults/constPool properties removed from NormalizedPatch

### Solution

These errors are expected - they reference the attachment system we just deleted.
Per the DoD, P2 work includes:
- P2-1: Update compile.ts integration (compiler receives NormalizedGraph)
- P2-2: Add PatchStore migration (delete old structural blocks)

These files will need updating as part of P2 work. For now, the cleanest approach
is to temporarily comment out the broken code with TODO markers pointing to P2.

## Summary

- **3 files deleted**: pass0-materialize.ts, constProviders.ts, ir/defaultSources.ts
- **5 files simplified**: pass1-normalize.ts, patches.ts, DefaultSourceStore.ts, allowlist.ts, GraphNormalizer.ts, ir/index.ts
- **GraphNormalizer is now the single source of truth** for default source materialization
- **TypeScript errors**: Expected - old code references deleted attachment system
- **Next**: Fix remaining TypeScript errors as part of P2 work

