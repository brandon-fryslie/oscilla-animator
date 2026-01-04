# Evaluation: Default Source Normalization Chaos
**Timestamp**: 2026-01-04-010000
**Scope**: project/full (default source normalization)
**Confidence**: FRESH
**Git Commit**: 541671b

## Executive Summary

**STATUS**: CRITICAL DUPLICATION - 5 systems doing normalization
**ROOT CAUSE**: Multiple incomplete migrations left competing systems in place
**IMPACT**: Type mismatches because different systems select different provider types
**VERDICT**: DELETE 4 systems, keep GraphNormalizer as single source of truth

---

## Complete Inventory of Normalization Systems

### System 1: GraphNormalizer.ts ✅ KEEP - SINGLE SOURCE OF TRUTH
**Location**: `src/editor/graph/GraphNormalizer.ts`
**Purpose**: Pure function RawGraph → NormalizedGraph, creates structural blocks+edges
**Status**: NEW (2026-01-03), intended to replace all others
**What it does**:
- Scans RawGraph for unconnected inputs with defaultSource
- Creates structural provider blocks (DSConst*, DomainN)
- Creates structural edges from providers to inputs
- Tags artifacts with `role: { kind: 'structural' }`
- Uses deterministic IDs: `${blockId}_default_${slotId}`

**Provider selection logic** (Lines 38-81):
```typescript
function selectProviderType(world: SlotWorld, domain: string): string {
  const normalizedWorld = world === 'config' ? 'scalar' : world;

  if (world === 'config' && domain === 'domain') {
    return 'DomainN';
  }

  const mapping: Record<string, string> = {
    'scalar:float': 'DSConstScalarFloat',
    'scalar:int': 'DSConstScalarInt',
    // ... etc
    'signal:float': 'DSConstSignalFloat',
    'signal:int': 'DSConstSignalInt',
    // ... etc
    'field:float': 'DSConstFieldFloat',
    // ... etc
  };

  return mapping[key] || 'DSConstSignalFloat'; // Fallback
}
```

**Used by**: `PatchStore.getNormalizedGraph()` (Lines 146-160)
**Integration**: Cached in `normalizedCache`, invalidated on mutations

**VERDICT**: ✅ **KEEP** - This is the correct architecture

---

### System 2: pass0-materialize.ts ❌ DELETE
**Location**: `src/editor/compiler/passes/pass0-materialize.ts`
**Purpose**: DUPLICATE of GraphNormalizer - creates same structural blocks+edges
**Status**: OLD (2025-12-31), supposed to be REPLACED by GraphNormalizer
**What it does**: EXACT SAME THING AS GraphNormalizer

**Provider selection logic** (Lines 24-63):
```typescript
function selectProviderType(world: SlotWorld, domain: string): string {
  // IDENTICAL CODE TO GraphNormalizer
  // except has more mappings (bool, vec3) that GraphNormalizer doesn't
}
```

**Used by**: `compile.ts` Line 118: `const materialized = pass0Materialize(patch);`

**THE PROBLEM**:
- GraphNormalizer runs BEFORE compilation (in PatchStore)
- pass0Materialize runs DURING compilation
- **Both create provider blocks for the SAME inputs**
- **Different code paths = different provider type selection**
- **Result: Type mismatches**

**VERDICT**: ❌ **DELETE ENTIRE FILE** - redundant with GraphNormalizer

---

### System 3: pass1-normalize.ts ❌ MOSTLY DELETE
**Location**: `src/editor/compiler/passes/pass1-normalize.ts`
**Purpose**: Creates `DefaultSourceAttachment[]` and `constPool` entries
**Status**: OLD, partially overlapping with GraphNormalizer
**What it does** (Lines 90-115):
- Scans for unwired inputs with defaultSource
- Creates `DefaultSourceAttachment` entries (NOT blocks/edges)
- Creates `constPool` entries for default values
- Returns `NormalizedPatch` with these metadata structures

**THE PROBLEM**:
- This doesn't create blocks - just metadata
- The metadata is REDUNDANT with GraphNormalizer's structural blocks
- The constPool entries are REDUNDANT with provider block params
- But: Still used for freezing block IDs to indices (Lines 76-82)

**VERDICT**: ⚠️ **PARTIALLY DELETE**
- DELETE all defaultSource/constPool logic (Lines 90-115)
- KEEP block ID freezing and edge canonicalization
- RENAME to `pass1-canonicalize.ts` to reflect actual purpose

---

### System 4: DefaultSourceStore.ts ❌ MOSTLY DELETE
**Location**: `src/editor/stores/DefaultSourceStore.ts`
**Purpose**: Creates `DefaultSourceAttachment` with provider selection logic
**Status**: OLD, overlapping with GraphNormalizer
**What it does**:
- Manages `DefaultSourceState` instances (observable values)
- Creates `DefaultSourceAttachment` with provider selection
- Uses `CONST_PROVIDER_MAPPING` for provider type selection

**Provider selection logic** (Lines 184-214):
```typescript
createDefaultAttachmentForSlot(...) {
  const blockType = CONST_PROVIDER_MAPPING[slotType] ?? 'DSConstSignalFloat';
  // Uses DIFFERENT mapping than GraphNormalizer!
}
```

**THE PROBLEM**:
- Uses `CONST_PROVIDER_MAPPING` (string-based: "Signal<float>")
- GraphNormalizer uses world+domain (structured: "signal:float")
- **DIFFERENT mappings = DIFFERENT provider types selected**
- This is the ROOT CAUSE of type mismatches

**VERDICT**: ⚠️ **MOSTLY DELETE**
- DELETE `createDefaultAttachmentForSlot()`, `createAttachmentWithProvider()`, `rebuildAttachmentsFromBlocks()`
- DELETE `attachmentsByTarget` Map
- KEEP `sources` Map (still needed for UI value editing)
- KEEP `ensureDefaultSource()`, `setDefaultValue()`, `getDefaultSource()`
- SIMPLIFY to just value storage, not attachment creation

**Reasoning**: The UI still needs to edit default values, but GraphNormalizer should create the structure

---

### System 5: constProviders.ts ❌ DELETE
**Location**: `src/editor/defaultSources/constProviders.ts`
**Purpose**: Defines `CONST_PROVIDER_MAPPING` used by DefaultSourceStore
**Status**: OLD, duplicates GraphNormalizer's mapping
**What it does**:
- Exports `CONST_PROVIDER_MAPPING` with string-based keys
- Keys like "Signal<float>", "Field<vec2>", etc.
- Different format than GraphNormalizer's world:domain format

**THE PROBLEM**:
```typescript
// constProviders.ts - string-based
'Signal<float>': 'DSConstSignalFloat'
'Signal<int>': 'DSConstSignalInt'

// GraphNormalizer.ts - structured
'signal:float': 'DSConstSignalFloat'
'signal:int': 'DSConstSignalInt'
```

**VERDICT**: ❌ **DELETE** - GraphNormalizer's mapping is the source of truth

---

## Secondary Files (Support Systems)

### defaultSourceUtils.ts (compiler/ir/)
**Location**: `src/editor/compiler/ir/defaultSourceUtils.ts`
**Purpose**: Helper for materializing defaultSource values into IR
**What it does**: Converts TypeDesc+value → ValueRefPacked for IR
**Used by**: pass6-block-lowering, pass8-link-resolution
**VERDICT**: ✅ **KEEP** - Legitimate IR utility, not doing normalization

### defaultSources.ts (compiler/ir/)
**Location**: `src/editor/compiler/ir/defaultSources.ts`
**Purpose**: Type definitions for DefaultSourceIR table
**What it does**: Just types, no logic
**VERDICT**: ❌ **DELETE** - No longer needed if pass1 doesn't create DefaultSourceTable

### default-source-providers.ts (blocks/)
**Location**: `src/editor/blocks/default-source-providers.ts`
**Purpose**: Block DEFINITIONS for DSConst* blocks
**What it does**: Defines the actual block schemas (inputs, outputs, params)
**VERDICT**: ✅ **KEEP** - These are legitimate block definitions

### compiler/blocks/defaultSources/
**Location**: `src/editor/compiler/blocks/defaultSources/*.ts`
**Purpose**: Block COMPILERS for DSConst* blocks
**What it does**: How to compile DSConst* blocks to IR
**VERDICT**: ✅ **KEEP** - Legitimate compiler blocks

### allowlist.ts
**Location**: `src/editor/defaultSources/allowlist.ts`
**Purpose**: Defines which blocks can be providers
**What it does**: Imports from constProviders, adds Oscillator
**VERDICT**: ⚠️ **SIMPLIFY** - Remove dependency on constProviders.ts

---

## The Core Problem Visualized

```
User creates Circle block with unwired 'radius' input (Signal:float)

┌─────────────────────────────────────────────────────────────────┐
│ PATH 1: GraphNormalizer (NEW - 2026-01-03)                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Sees unwired input, checks defaultSource                     │
│ 2. Calls selectProviderType(world='signal', domain='float')     │
│ 3. Looks up 'signal:float' in mapping                           │
│ 4. Returns 'DSConstSignalFloat'                                 │
│ 5. Creates DSConstSignalFloat block + edge                      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
                    NormalizedGraph with provider
                               ↓
                          Sent to compiler
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ PATH 2: pass0Materialize (OLD - 2025-12-31)                    │
├─────────────────────────────────────────────────────────────────┤
│ 1. ALSO sees unwired input (ignores existing provider!)         │
│ 2. ALSO calls selectProviderType(world='signal', domain='float')│
│ 3. ALSO creates DSConstSignalFloat block + edge                 │
│ 4. NOW THERE ARE TWO PROVIDERS FOR THE SAME INPUT               │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ PATH 3: DefaultSourceStore (UI updates)                        │
├─────────────────────────────────────────────────────────────────┤
│ 1. UI wants to create attachment for editing                    │
│ 2. Calls createDefaultAttachmentForSlot(slotType='Signal<float>')│
│ 3. Looks up 'Signal<float>' in CONST_PROVIDER_MAPPING          │
│ 4. Returns 'DSConstSignalFloat' (happens to match)             │
│ 5. But for other types, might not match!                        │
└─────────────────────────────────────────────────────────────────┘

RESULT: Type mismatches when mappings disagree
```

---

## Exact Changes Required

### Phase 1: Delete Redundant Normalization

#### 1. DELETE pass0-materialize.ts
```bash
rm src/editor/compiler/passes/pass0-materialize.ts
```

**Update**: `src/editor/compiler/compile.ts`
- Line 30: DELETE `import { pass0Materialize } from './passes/pass0-materialize';`
- Line 118: DELETE `const materialized = pass0Materialize(patch);`
- Line 125: CHANGE `const normalized = pass1Normalize(patchForPasses);`
  → `const normalized = pass1Normalize(patch);`

**Reasoning**: GraphNormalizer already ran in PatchStore. Structural blocks are in the graph.

#### 2. SIMPLIFY pass1-normalize.ts

**DELETE** (Lines 90-115):
```typescript
// Step 3: Identify unwired inputs and create default sources
const defaults: DefaultSourceAttachment[] = [];
const constPool = new Map<ConstId, unknown>();
// ... entire loop creating defaults ...
```

**CHANGE** return type:
```typescript
export interface NormalizedPatch {
  blockIndexMap: Map<string, BlockIndex>;
  blocks: Map<string, unknown>;
  edges: readonly Edge[];
  // DELETE these:
  // defaults: DefaultSourceAttachment[];
  // constPool: Map<ConstId, unknown>;
}
```

**RENAME**: `pass1-normalize.ts` → `pass1-canonicalize.ts`
**UPDATE**: Import in `compile.ts`

#### 3. DELETE constProviders.ts
```bash
rm src/editor/defaultSources/constProviders.ts
```

**UPDATE**: `allowlist.ts`
- DELETE `import { DEFAULT_CONST_PROVIDER_BLOCKS } from './constProviders';`
- INLINE the const provider specs directly
- Use world:domain format, not string format

#### 4. DELETE defaultSources.ts (IR types)
```bash
rm src/editor/compiler/ir/defaultSources.ts
```

**Reasoning**: No longer creating DefaultSourceTable in pass1

#### 5. SIMPLIFY DefaultSourceStore.ts

**DELETE these methods**:
- `createDefaultAttachmentForSlot()` (Lines 184-214)
- `createAttachmentWithProvider()` (Lines 229-307)
- `rebuildAttachmentsFromBlocks()` (Lines 318-367)
- `getAttachmentForInput()` (Lines 152-155)
- `setAttachmentForInput()` (Lines 160-163)
- `removeAttachmentForInput()` (Lines 168-171)

**DELETE these properties**:
- `attachmentsByTarget: Map<string, DefaultSourceAttachment>` (Line 92)

**KEEP these** (UI still needs them):
- `sources: Map<string, DefaultSourceState>` - value storage
- `ensureDefaultSource()` - create/update values
- `setDefaultValue()` - update values
- `getDefaultSource()` - read values
- `getDefaultSourceForInput()` - read by blockId+slotId
- `setDefaultValueForInput()` - update by blockId+slotId

**SIMPLIFY** `createDefaultSourcesForBlock()` (Lines 443-496):
- Remove attachment creation logic
- Keep only DefaultSourceState creation for values
- GraphNormalizer creates the structure, this just stores editable values

---

### Phase 2: Ensure GraphNormalizer is Complete

#### 1. VERIFY provider type mappings are complete

**Check**: Does GraphNormalizer's `selectProviderType()` have ALL types?

**Current GraphNormalizer mappings** (Lines 50-70):
- scalar: float, int, string, waveform ✅
- signal: float, int, color, vec2, point, phase, time ✅
- field: float, color, vec2 ✅

**Missing from pass0's mapping**:
- signal: bool, vec3
- scalar: bool, color, vec2

**ACTION**: Add these to GraphNormalizer if they exist as block types

#### 2. VERIFY ID generation is deterministic

**GraphNormalizer** (Line 104-106):
```typescript
function generateProviderId(blockId: string, slotId: string): string {
  return `${blockId}_default_${slotId}`;
}
```

**pass0-materialize** (Line 69-71):
```typescript
function generateProviderId(blockId: string, inputId: string): string {
  return `ds_${blockId}_${inputId}`;
}
```

**PROBLEM**: Different formats!

**ACTION**: Standardize on GraphNormalizer's format
**Or**: Use pass0's `ds_` prefix for clarity

**DECISION NEEDED**: Which ID format is canonical?

#### 3. VERIFY edge creation is correct

**GraphNormalizer** (Lines 235-249):
```typescript
const providerOutputPort = providerType === 'DomainN' ? 'domain' : 'out';

const edge: Edge = {
  id: `${providerId}_edge`,
  from: { kind: 'port', blockId: providerId, slotId: providerOutputPort },
  to: { kind: 'port', blockId: block.id, slotId: inputDef.id },
  enabled: true,
  role: { kind: 'default', meta: { defaultSourceBlockId: providerId } },
};
```

**ACTION**: Verify this matches expected Edge schema

---

### Phase 3: Update Compiler Integration

#### 1. VERIFY PatchStore integration

**Current** (`PatchStore.ts` Lines 146-160):
```typescript
getNormalizedGraph(): NormalizedGraph {
  if (this.normalizedCache === null) {
    const rawGraph = {
      blocks: this.blocks.filter(b => b.role?.kind === 'user'),
      edges: this.edges.filter(e => e.role?.kind === 'user'),
    };
    this.normalizedCache = normalize(rawGraph);
  }
  return this.normalizedCache;
}
```

**PROBLEM**: Filters to user-only, but what if structural blocks already exist?

**ACTION**: Add migration to DELETE old structural blocks on load

#### 2. VERIFY compiler receives normalized graph

**Current** (`compile.ts`):
```typescript
// Line 118: DELETE this
const materialized = pass0Materialize(patch);

// Compiler should receive getNormalizedGraph() from PatchStore
```

**ACTION**: Change compile() to accept NormalizedGraph, not raw Patch

---

## Files to DELETE Entirely

1. ❌ `src/editor/compiler/passes/pass0-materialize.ts`
2. ❌ `src/editor/defaultSources/constProviders.ts`
3. ❌ `src/editor/compiler/ir/defaultSources.ts`

---

## Files to MODIFY (Simplify)

1. ⚠️ `src/editor/compiler/passes/pass1-normalize.ts` → `pass1-canonicalize.ts`
   - Remove defaultSource/constPool logic
   - Keep block ID freezing

2. ⚠️ `src/editor/stores/DefaultSourceStore.ts`
   - Remove attachment creation methods
   - Remove CONST_PROVIDER_MAPPING dependency
   - Keep value storage only

3. ⚠️ `src/editor/defaultSources/allowlist.ts`
   - Remove constProviders.ts import
   - Inline const provider specs
   - Use world:domain format

4. ⚠️ `src/editor/compiler/compile.ts`
   - Remove pass0Materialize call
   - Update pass1 call
   - Accept NormalizedGraph instead of Patch

5. ⚠️ `src/editor/graph/GraphNormalizer.ts`
   - Add missing provider type mappings
   - Verify ID generation format

---

## Files to KEEP (No Changes)

1. ✅ `src/editor/blocks/default-source-providers.ts` - Block definitions
2. ✅ `src/editor/compiler/blocks/defaultSources/*.ts` - Block compilers
3. ✅ `src/editor/compiler/ir/defaultSourceUtils.ts` - IR helper
4. ✅ `src/editor/graph/types.ts` - Graph types
5. ✅ `src/editor/transforms/normalize.ts` - Transform normalization (unrelated)

---

## Migration Path

### Step 1: Verify GraphNormalizer Completeness
- Add missing provider type mappings
- Standardize ID generation
- Add tests for edge cases

### Step 2: Delete Redundant Systems
- Delete pass0-materialize.ts
- Delete constProviders.ts
- Delete defaultSources.ts (IR)
- Update compile.ts imports

### Step 3: Simplify Overlapping Systems
- Simplify pass1-normalize.ts (rename to pass1-canonicalize.ts)
- Simplify DefaultSourceStore.ts (value storage only)
- Simplify allowlist.ts (inline specs)

### Step 4: Update Integration Points
- Change compile() to accept NormalizedGraph
- Add migration to delete old structural blocks
- Update PatchStore to handle mixed graphs during transition

### Step 5: Verify End-to-End
- Test that providers are created exactly once
- Test that type mismatches are gone
- Test that UI value editing still works

---

## Root Cause Analysis

**WHY did this happen?**

1. **Sprint 2 (2025-12-31)**: Created pass0-materialize as "unified default sources"
2. **Graph Normalization (2026-01-03)**: Created GraphNormalizer to "replace pass0"
3. **BUT**: Never deleted pass0-materialize
4. **AND**: DefaultSourceStore still had its own provider selection
5. **AND**: pass1-normalize still creating constPool entries
6. **RESULT**: 5 systems doing the same work differently

**The fix was always obvious**: Delete everything except GraphNormalizer.

**Why wasn't it done?** Incomplete migration. Old systems left "just in case."

---

## Success Criteria

After fixes:

1. ✅ GraphNormalizer is the ONLY system creating structural blocks+edges
2. ✅ No duplicate provider blocks created
3. ✅ Type mismatches eliminated
4. ✅ UI value editing still works (via DefaultSourceStore values)
5. ✅ Compiler integration clean (no redundant passes)

---

## Verdict

**WORKFLOW**: PAUSE

**REASON**: Need user confirmation on:
1. Which ID format to use (`${blockId}_default_${slotId}` vs `ds_${blockId}_${inputId}`)
2. Whether to delete old structural blocks on migration (breaking change)
3. Whether DefaultSourceStore should keep ANY attachment logic (or pure value storage)

Once confirmed, implementation is straightforward: delete files, remove functions, update imports.

**Estimated Cleanup**:
- 3 files deleted entirely
- 5 files simplified (remove ~500 lines)
- 1 file enhanced (GraphNormalizer mappings)
- Clean, single-path normalization

---

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| ID Format | Should provider IDs be `${blockId}_default_${slotId}` or `ds_${blockId}_${inputId}`? | GraphNormalizer uses first, pass0 uses second | Inconsistent IDs if both run |
| Migration | Should old structural blocks be deleted on load? | Assumed filter in PatchStore handles it | May leave orphaned blocks |
| DefaultSourceStore | Should it keep ANY attachment logic or be pure value storage? | Removed all attachment logic | UI might need some attachment API |
| Provider Mappings | Are all possible type combinations covered? | GraphNormalizer has subset of pass0's mappings | Missing types may fall back to wrong provider |

---

## Recommendations (Priority Order)

1. **CRITICAL**: Delete pass0-materialize.ts immediately (causing duplicate providers)
2. **CRITICAL**: Simplify DefaultSourceStore (causing type mismatches)
3. **HIGH**: Simplify pass1-normalize (creating redundant metadata)
4. **HIGH**: Add missing provider mappings to GraphNormalizer
5. **MEDIUM**: Standardize ID generation format
6. **MEDIUM**: Add migration for old structural blocks
7. **LOW**: Rename pass1 to pass1-canonicalize (clarity)

---

**End of Evaluation**
