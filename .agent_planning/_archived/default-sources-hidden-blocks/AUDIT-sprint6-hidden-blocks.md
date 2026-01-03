# Audit: Sprint 6 - Hide Provider Blocks from UI
Date: 2025-12-30
Sprint: 6 of 18 (Default Sources as Hidden Blocks)

## Overview
Sprint 6 successfully hides all DSConst* provider blocks from user-facing UI while keeping them available for internal compiler use.

## Implementation

### 1. Centralized Filter Helper
**File**: `src/editor/blocks/registry.ts`
**Function**: `isBlockHidden(definition: BlockDefinition): boolean`

```typescript
export function isBlockHidden(definition: BlockDefinition): boolean {
  return getBlockTags(definition).hidden === true;
}
```

**Purpose**: Provides single source of truth for determining if a block should be hidden from UI.

**Documentation**: Includes comprehensive JSDoc explaining:
- What hidden blocks are (e.g., default source providers)
- Where they should NOT appear (palette, context menus, search results)
- Where they MAY appear (debug/diagnostic UIs)

### 2. BlockLibrary Filtering
**File**: `src/editor/BlockLibrary.tsx`

**Changes**:
1. Import `isBlockHidden` (line 8)
2. Filter in `groupBlocksByForm()` function (line 50):
   ```typescript
   const visibleBlocks = blocks.filter(def => !isBlockHidden(def));
   ```
3. Filter in search results (line 192):
   ```typescript
   if (isBlockHidden(b)) return false;
   ```
4. Added documentation to component (lines 160-161)

**Effect**: DSConst* blocks do not appear in:
- Block palette (organized view)
- Search results

### 3. BlockContextMenu Filtering
**File**: `src/editor/BlockContextMenu.tsx`

**Changes**:
1. Import `isBlockHidden` (line 10)
2. Filter replacement options (line 88):
   ```typescript
   const visibleDefinitions = allDefinitions.filter(def => !isBlockHidden(def));
   ```
3. Added documentation to component (line 25)

**Effect**: DSConst* blocks do not appear in:
- "Replace with..." context menu

## Audit of Block List Locations

### User-Facing (Hidden Blocks Filtered)
1. **BlockLibrary.tsx** - Block palette and search
   - Status: FILTERED
   - Method: `isBlockHidden()` in `groupBlocksByForm()` and search filter

2. **BlockContextMenu.tsx** - Right-click replacement menu
   - Status: FILTERED
   - Method: `isBlockHidden()` before passing to `findCompatibleReplacements()`

### System/Internal (Hidden Blocks May Appear)
1. **BLOCK_DEFS_BY_TYPE** (registry.ts) - Block definition map
   - Status: INCLUDES HIDDEN
   - Reason: Internal registry must include all blocks for compiler

2. **getBlockDefinitions()** (registry.ts) - Get all definitions
   - Status: INCLUDES HIDDEN
   - Reason: Core registry function used by both UI and compiler

3. **Block compilers** (compiler/blocks/defaultSources/)
   - Status: INCLUDES HIDDEN
   - Reason: Compiler needs to execute these blocks

### Not Checked (No Block Iteration Found)
Searched for but found no relevant code:
- Diagnostic formatters - would use friendly names from error context
- Export/import utilities - would handle blocks by ID, not by browsing
- Block analytics/statistics - none found in codebase

## Verification

### TypeScript Compilation
```bash
just typecheck
```
**Result**: SUCCESS - No type errors

### Test Suite
```bash
just test
```
**Result**: SUCCESS - All tests pass (61 test files, 1000+ tests)

### Block Lowering Coverage
Test output confirms all 9 DSConst* blocks are in IR-Ready category:
- DSConstFieldColor
- DSConstFieldFloat
- DSConstFieldVec2
- DSConstScalarString
- DSConstScalarWaveform
- DSConstSignalColor
- DSConstSignalFloat
- DSConstSignalInt
- DSConstSignalPoint

## Acceptance Criteria

Sprint 6 DOD requirements:
- [x] Helper function `isBlockHidden(definition)` exists
- [x] Returns true if `getBlockTags(def).hidden === true`
- [x] BlockLibrary filters hidden blocks
- [x] `groupBlocksByForm()` uses filter
- [x] No hidden blocks appear in user-facing UI
- [x] Audit documented (this file)

## Summary

All 9 DSConst* provider blocks are successfully hidden from user-facing UI:
- BlockLibrary (palette and search)
- BlockContextMenu (replacement options)

Blocks remain available for:
- Internal registry lookups
- Compiler execution
- Future compiler injection (Sprint 9+)

No regressions detected in test suite.
