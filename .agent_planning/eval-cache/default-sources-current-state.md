# Default Sources - Current State

**Cached**: 2025-12-30 02:24
**Source**: project-evaluator (default-sources-hidden-blocks evaluation)
**Confidence**: HIGH (direct file inspection)

## Overview

Default sources provide fallback values for block inputs when no wire or bus listener is connected. Current implementation is **constant-value only** - cannot use time-varying or bus-driven defaults.

---

## Architecture (Current)

### Data Model

**File**: `src/editor/stores/DefaultSourceStore.ts`

**Key types**:
```typescript
class DefaultSource implements DefaultSourceState {
  id: string;           // ⚠️ Currently RANDOM via root.generateId('ds')
  type: TypeDesc;       // World/domain descriptor
  value: unknown;       // The constant value
  uiHint?: UIControlHint;
  rangeHint?: { min/max/step };
}
```

**Storage**:
- `sources: Map<string, DefaultSource>` - all default source instances
- `blockSlotIndex: Map<blockId, Map<slotId, dsId>>` - lookup index

**Lifecycle**:
1. **Creation**: `createDefaultSourcesForBlock(blockId, inputs)` - called when block added
2. **Update**: `setDefaultValueForInput(blockId, slotId, value)` - called from UI
3. **Deletion**: `removeDefaultSourcesForBlock(blockId)` - called when block removed

**⚠️ RED FLAG - Random IDs**:
```typescript
// Line 191 - uses random ID generation
const dsId = this.root.generateId('ds'); // NOT DETERMINISTIC
```

---

## UI Integration

**File**: `src/editor/Inspector.tsx`

**Component**: `DefaultSourcesSection` (lines 1301-1388)

**Behavior**:
- Finds inputs with default sources via `store.defaultSourceStore.getDefaultSourceForInput(blockId, slotId)`
- Checks if input is driven: `isInputDriven(blockId, slotId, connections, listeners)`
- Splits into two sections:
  - **Active** (undriven): Editable controls
  - **Overridden** (driven): Read-only with "driven" badge

**Control rendering**: Uses `DefaultSourceControl` component (not examined in detail)

---

## Compiler Integration

### Legacy Compiler Path

**File**: `src/editor/compiler/compileBusAware.ts`

**Function**: `resolveDefaultSource(block, portName, kind, defaultSourceValues)`

**Logic** (lines 1369-1384):
1. Look up slot definition
2. Check if slot has `defaultSource` metadata
3. Priority: `defaultSourceValues[blockId:portName]` (runtime-edited) > `slot.defaultSource.value` (static)
4. Create constant `Artifact` via `createDefaultArtifact(value, kind)`

**Integration point**: Line 676 in main compile loop - when input has no wire/listener, call `resolveDefaultSource()`

### IR Compiler Path

**File**: `src/editor/compiler/passes/pass1-normalize.ts`

**Function**: `pass1Normalize(patch)`

**Logic** (lines 63-95):
1. For each block input:
   - Check if has wire: `connections.some(...)`
   - Check if has listener: `listeners.some(...)`
   - If neither AND `input.defaultSource != null`: attach default
2. Create `DefaultSourceAttachment[]` with `constId`
3. Return `NormalizedPatch` with `defaultSources` field

**Type**: `DefaultSourceAttachment` (IR type, different from plan type)
```typescript
{
  blockId: string;
  slotId: string;
  constId: ConstId;  // Numeric index
  type: { world, domain };
}
```

### Compiler Patch Conversion

**File**: `src/editor/compiler/integration.ts`

**Function**: `editorToPatch(store)` (lines 401-425)

**What it does**:
1. Build `defaultSourceValues` lookup map: `blockId:slotId -> value`
2. Loop through all blocks/inputs
3. Call `store.defaultSourceStore.getDefaultSourceForInput(blockId, inputId)`
4. Add to map: `defaultSourceValues[${blockId}:${inputId}] = ds.value`

**Returns**: `CompilerPatch` with:
- `defaultSources: Record<string, unknown>` - full DefaultSourceState objects
- `defaultSourceValues: Record<string, unknown>` - just the values (lookup-friendly)

---

## Type Definitions

### Editor Types

**File**: `src/editor/types.ts`

**Patch interface** (line 726):
```typescript
export interface Patch {
  version: number;
  blocks: Block[];
  connections: Connection[];
  buses: Bus[];
  publishers: Publisher[];
  listeners: Listener[];
  defaultSources: DefaultSourceState[];  // Array of default source objects
  settings: { ... };
  composites?: CompositeDefinition[];
}
```

**⚠️ MISSING**: No `defaultSourceAttachments` field (required by plan)

### Compiler Types

**File**: `src/editor/compiler/types.ts`

**CompilerPatch interface** (line 544):
```typescript
export interface CompilerPatch {
  blocks: readonly BlockInstance[];
  connections: readonly CompilerConnection[];
  buses: readonly Bus[];
  listeners: readonly Listener[];
  publishers: readonly Publisher[];
  defaultSources?: Record<string, unknown>;      // Full objects
  defaultSourceValues?: Record<string, unknown>; // Just values
  output?: PortRef;
}
```

---

## Block Registry

**File**: `src/editor/blocks/registry.ts`

**Key functions**:
- `getBlockDefinitions(includeComposites)` - returns all block defs
- `getBlockTags(definition)` - normalizes tags (form/subcategory)
- `BLOCK_DEFS_BY_TYPE` - static map built at module load

**Tag support**: ✅ Already supports arbitrary tags via `BlockTags` type

**No filtering**: Registry does not filter hidden blocks

---

## Block Library (Palette)

**File**: `src/editor/BlockLibrary.tsx`

**Key function**: `groupBlocksByForm(blocks)` (lines 46-85)

**Behavior**:
- Groups blocks by form (macro/composite/primitive)
- Sub-groups by subcategory
- Sorts by priority then label

**⚠️ NO FILTERING**: Does not check for `tags.hidden` or any exclusion criteria

**Impact**: Any block in registry will appear in palette unless filtered

---

## Slot Default Source Metadata

**Example** (from `src/editor/blocks/domain.ts`):

```typescript
input('n', 'Element Count', 'Scalar:int', {
  tier: 'primary',
  defaultSource: {
    value: 100,
    world: 'scalar',
    uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
  },
})
```

**Fields**:
- `value: unknown` - default value (constant)
- `world: SlotWorld` - signal/field/scalar/config
- `uiHint?: UIControlHint` - how to render control

**Current limitation**: Only supports constant values, not blocks

---

## Existing "Const" Blocks

**Found**:
- `FieldConstNumber` - Field<float> constant
- `FieldConstColor` - Field<color> constant
- `PathConst` - Path constant

**⚠️ NOT SUITABLE**: These are Field/Path domain, not Signal/Scalar

**Required** (from plan): `DSConstSignalFloat`, `DSConstSignalInt`, etc.

---

## Key Limitations (Why this feature exists)

1. **No time-varying defaults**: Cannot use Oscillator/LFO as default
2. **No bus-driven defaults**: Cannot read from global buses
3. **Random IDs**: Cannot rebuild mappings after load (line 191)
4. **Inline constants**: Not modeled as graph nodes (special-case in compiler)

---

## Integration Points for New Feature

### 1. Store Changes
**Location**: `src/editor/stores/DefaultSourceStore.ts`
- Add: `attachmentsByTarget: Map<string, DefaultSourceAttachment>`
- Change: Deterministic ID generation (replace line 191)
- Add: Methods to create/update provider attachments

### 2. Compiler Injection
**Location**: `src/editor/compiler/integration.ts`
- Add: `injectDefaultSourceProviders(store, patch)` function
- Call in: `editorToPatch()` after line 413
- Inject: Hidden blocks + wires + bus listeners

### 3. UI Extension
**Location**: `src/editor/Inspector.tsx`
- Extend: `DefaultSourcesSection` component
- Add: Provider selection dropdown
- Add: Provider config panel (for block providers)

### 4. Type Extensions
**Location**: `src/editor/types.ts`
- Add: `Patch.defaultSourceAttachments: DefaultSourceAttachment[]`

### 5. Registry Filtering
**Location**: `src/editor/BlockLibrary.tsx`
- Add: Filter `tags.hidden === true` blocks in `groupBlocksByForm()`

---

## Notes

- System is well-structured for extension
- Current constant-only model is complete and working
- Main gap: No concept of "provider blocks" anywhere in codebase
- Compiler injection point is clear (`editorToPatch`)
- UI extension point is clear (`DefaultSourcesSection`)
