# Layout Architecture Assessment

**Cached**: 2025-12-21
**Confidence**: FRESH
**Source**: project-evaluator (layout-projection evaluation)

## Current State: Lanes Are Semantic, Not Projection

### Lane System Architecture

**Lanes are embedded in patch semantics:**

1. **Storage**: `PatchStore.lanes: Lane[]` - observable MobX state
2. **Serialization**: Lanes persisted in every patch file via `RootStore.toJSON()`
3. **Block Assignment**: Each lane owns `blockIds: BlockId[]` array
4. **Layout Switching**: Changes patch structure by migrating blocks between lanes

**Evidence locations:**
- `src/editor/stores/PatchStore.ts` lines 303-308: Block creation assigns to lane
- `src/editor/stores/PatchStore.ts` lines 612-614: Block removal mutates lanes
- `src/editor/stores/PatchStore.ts` lines 1013-1042: Layout switching mutates patch
- `src/editor/stores/RootStore.ts` lines 170, 188: Lanes in serialization
- `src/editor/types.ts` line 662: `PatchDocument` includes `lanes: Lane[]`

### Consequences

**This violates "Layout as Projection" principle:**
- Moving blocks changes patch semantics (triggers revision, appears in diffs)
- Switching layouts (simple ↔ detailed) mutates patch document
- UI preferences (advancedLaneMode) stored in patch settings
- Can't have multiple views of same patch
- Each UI would fight over lane ownership

### Lane Types and Presets

**LaneKind taxonomy** (types.ts lines 523-530):
- Scene, Phase, Fields, Scalars, Spec, Program, Output

**Preset layouts** (laneLayouts.ts):
- SIMPLE_LAYOUT: 5 lanes (clean, learning-friendly)
- DETAILED_LAYOUT: 9 lanes (granular, advanced)

**Block-to-lane mapping**:
- Based on `LaneKind` (structural value type)
- Uses `inferCategory()` to map kind → category
- Migration logic preserves blocks during layout switch

## Reference Implementation: Modulation Table

**Good pattern exists in codebase:**

`src/editor/modulation-table/types.ts` (lines 210-270): `TableViewState`

**What it does right:**
- View state stored separately from patch
- Contains UI preferences (collapsed, hidden, focused, filters)
- Multiple sorting/filtering modes as projections
- Comment confirms: "The table is a projection of the Patch, not a separate data store"

**This is the correct pattern for all layouts.**

## What's Missing: ViewState Separation

**No ViewState infrastructure:**
- No `ViewStateStore` or equivalent
- No `ViewLayout` abstraction
- No concept of "active view" vs "patch semantics"
- No multi-view capability

**No algorithmic layout:**
- No auto-layout from semantic graph structure
- No deterministic positioning algorithm
- No stability guarantees for incremental changes

## Migration Path

### Phase 1: Introduce ViewState (Non-Breaking)
- Create `ViewStateStore` alongside existing stores
- Migrate UI state (collapsed, pinned) to ViewState
- Move `advancedLaneMode` from patch settings to ViewState
- Keep lanes in patch for backward compatibility

### Phase 2: Make Lanes Read-Only (Semi-Breaking)
- Compute lane assignments from block semantics
- Remove lane mutation operations (move, reorder, rename)
- Derive layout from stable sort keys

### Phase 3: Remove Lanes from Patch (Breaking)
- Stop serializing lanes
- Reconstruct layout from ViewState on load
- **Requires migration for saved patches**

## Invariants to Enforce

**After migration:**
1. Changing ViewState MUST NOT increment patch revision
2. Same blocks + connections MUST produce same visual layout (deterministic)
3. Layout preferences MUST survive serialization independently
4. Multiple views MUST coexist for same patch

## Priority

**Issue #3 in refactor queue** (per 1-Overview.md):
1. Port Identity (fixes composite/macro/bus bugs)
2. Time Authority (unifies player vs patch time)
3. **Layout as Projection** ← This issue
4. Shared Validation Layer
5. Bus Semantics Module

**Should tackle after #1 and #2, before multi-UI work.**
