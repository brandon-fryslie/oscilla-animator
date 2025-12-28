# Evaluation: Layout as Projection (Issue #3)
Timestamp: 2025-12-21-115000
Scope: issue/layout-projection
Confidence: FRESH
Git Commit: d5fe183

## Summary

**Status**: NOT_STARTED (architectural debt exists)
**Spec Location**: `design-docs/10-Refactor-for-UI-prep/4-Layout-As-Projection.md`
**Priority**: Issue #3 in refactor queue (after Port Identity #1, Time Authority #2)

This evaluation assesses the current state of layout separation from patch semantics.

---

## What the Spec Requires

### Core Principles (Non-Negotiable)

**Principle A: Patch Document Must Be UI-Agnostic**

The patch's semantic meaning must be completely determined by:
- Blocks (types + params)
- Relationships (wires, buses, publishers/listeners, composite bindings)
- Time/root constraints
- Project-level settings that affect compilation

**Nothing about pixel positions, lanes, or UI grouping may be required to compile correctly.**

**Principle B: Layout Lives in "ViewState", Not "Patch"**

Layouts are derived or stored separately as UI preferences. A layout may be persisted, but it is **not patch semantics**.

### End-State Data Model

**PatchDocument (semantic)** - Contains NO layout:
```typescript
{
  blocks: Block[]
  connections: Connection[]
  buses/publishers/listeners
  timeRoot (explicit or validated)
  composites (defs)
  settings (semantic only: seed defaults, etc.)
}
```

**ViewState (projection)** - Stored per layout profile:
```typescript
type ViewState = {
  activeViewId: string;
  views: Record<string, ViewLayout>;
}

type ViewLayout =
  | GraphLayout
  | TableLayout
  | PerformanceLayout
```

**GraphLayout** stores:
- Which subgraph is currently open/focused
- Optional pinned nodes
- Collapsed groups
- Viewport (pan/zoom)
- Stable node ordering hints (NOT x/y coordinates)

**Key**: Layout stores hints and preferences, not geometry.

### Why This Matters

**Current pain with lanes embedded in patch:**
1. Lanes encode 3 things at once:
   - Visual grouping
   - Ordering
   - Implied "flow" narrative

2. Actual system flow is **buses + compilation dependencies**, not lane order. Lanes become a story that often lies.

3. Block position is derived from lane membership + array order:
   - Rearranging UI becomes a semantic patch change (in diffs, history, undo logs)
   - Different UIs can't coexist because they all want to "own" lanes
   - Moving blocks spams history with non-semantic changes

---

## Current State Assessment

### What Exists

**Lanes are deeply embedded in patch semantics:**

1. **PatchStore** (`src/editor/stores/PatchStore.ts`):
   - `lanes: Lane[]` - Observable state (lines 56)
   - Lane operations: add/remove/rename/collapse/pin/reorder
   - Block-to-lane assignment: `lane.blockIds` array
   - Lane switching with block migration (lines 1013-1042)

2. **Patch Serialization** (`src/editor/stores/RootStore.ts`):
   - `toJSON()` persists lanes as part of patch (line 170)
   - `loadPatch()` restores lanes from patch (line 188)
   - Lanes are serialized in **every patch file**

3. **Lane Layouts** (`src/editor/laneLayouts.ts`):
   - Preset layouts: SIMPLE_LAYOUT (5 lanes), DETAILED_LAYOUT (9 lanes)
   - Layout switching migrates blocks between lanes based on `LaneKind` mapping
   - Templates define: id, kind, label, description, flowStyle

4. **UI Settings**:
   - `advancedLaneMode` is stored in patch settings (line 678 in types.ts)
   - Toggling mode switches between 'simple' and 'detailed' layouts
   - **This is layout state bleeding into patch semantics**

5. **Types** (`src/editor/types.ts`):
   - `Lane` interface with `blockIds: BlockId[]` (line 592)
   - `PatchDocument` includes `lanes: Lane[]` (line 662)
   - `LaneKind`, `LaneFlavor`, `LaneFlowStyle` define lane taxonomy

### What Does NOT Exist

**No ViewState separation:**
- No `ViewState` store or type
- No `ViewLayout` abstraction
- No separate storage for layout preferences
- No concept of "active view" vs "patch semantics"

**No algorithmic layout:**
- No auto-layout based on semantic relationships
- No deterministic positioning from graph structure
- No stability mechanism for incremental changes

**No multi-view infrastructure:**
- Can't have multiple views of same patch
- Can't switch between table/graph/performance views
- Each UI would fight over lane ownership

### Evidence: Lanes Are Semantic, Not Projection

**File: `src/editor/stores/PatchStore.ts`**

Lines 303-308: Block creation requires lane assignment
```typescript
this.blocks.push(block);

// Add to lane - use array spread to ensure MobX detects the change
if (laneObj) {
  laneObj.blockIds = [...laneObj.blockIds, id];
}
```

Lines 612-614: Block removal mutates lanes
```typescript
// Remove from lanes
for (const lane of this.lanes) {
  lane.blockIds = lane.blockIds.filter((bid) => bid !== id);
}
```

Lines 1013-1042: Layout switching is a patch mutation
```typescript
switchLayout(layoutId: string): void {
  // ...
  this.lanes = this.createLanesFromLayout(newLayout);
  this.currentLayoutId = layoutId;
  // Migrate blocks to new lanes...
}
```

**File: `src/editor/stores/RootStore.ts`**

Lines 170, 188: Lanes serialized in patch
```typescript
toJSON(): Patch {
  return {
    // ...
    lanes: this.patchStore.lanes.map((l) => ({ ...l })),
  };
}

loadPatch(patch: Patch): void {
  this.patchStore.lanes = patch.lanes;
  // ...
}
```

**File: `src/editor/types.ts`**

Lines 678: Layout mode is a patch setting
```typescript
settings: {
  // ...
  advancedLaneMode?: boolean;
}
```

This means switching from simple to detailed view **changes the patch document**.

---

## Partial Work: Modulation Table Has ViewState Pattern

**Good news**: The modulation table already demonstrates the correct pattern.

**File: `src/editor/modulation-table/types.ts`**

Lines 210-270: `TableViewState` interface
```typescript
export interface TableViewState {
  readonly id: string;
  readonly name: string;

  // Focus
  focusedBlockId?: BlockId;
  focusedBusId?: string;
  focusedCell?: { rowKey: RowKey; busId: string };

  // Column behavior
  pinnedBusIds: string[];
  hiddenBusIds: string[];

  // Row behavior
  collapsedGroups: Record<GroupKey, boolean>;
  hiddenRowKeys: Record<RowKey, boolean>;

  // Filters
  rowFilter: RowFilter;
  colFilter: ColFilter;

  // Sorting
  busSort: BusSortMode;
  rowSort: RowSortMode;

  // UX options
  showOnlyBoundCells: boolean;
  showOnlyCompatibleColumnsForFocusedRow: boolean;
}
```

**This is exactly the right pattern:**
- View state stored separately from patch
- Contains UI preferences (collapsed, hidden, focused)
- Filtering and sorting are projections
- Could have multiple named views

**Comments in file (lines 5-9) confirm the philosophy:**
```
/**
 * Modulation Table Types
 *
 * Data structures for the table-based modulation UI.
 * The table is a projection of the Patch, not a separate data store.
```

**The modulation table got this right. The main patch bay did not.**

---

## What Changes Are Needed

### Phase 1: Introduce ViewState Without Breaking Existing UI

1. **Create ViewState store** (`src/editor/stores/ViewStateStore.ts`):
   - Manage multiple named views
   - Store lane-based layout as one view type ("LaneLayout")
   - Migrate lane UI state (collapsed, pinned) to ViewState
   - Keep lanes in PatchStore temporarily for compatibility

2. **Separate layout state from patch state**:
   - Move `advancedLaneMode` from patch settings to ViewState
   - Move `currentLayoutId` from PatchStore to ViewState
   - Move lane UI properties (collapsed, pinned) to ViewState

3. **Update serialization**:
   - Keep lanes in patch format (for backward compatibility)
   - Optionally serialize ViewState separately
   - On load, reconstruct ViewState from lanes if needed

### Phase 2: Make Lane Layout a Projection

4. **Compute lane assignments from semantics**:
   - Use block category/type to infer lane kind
   - Derive block order from stable sort key (not array index)
   - Make lane assignment **read-only** in UI (derived, not editable)

5. **Deprecate lane editing operations**:
   - Remove moveBlockToLane, reorderBlockInLane
   - Remove addLane, removeLane, renameLane
   - Remove toggleLaneCollapsed, toggleLanePinned (move to ViewState)

6. **Optional: Deterministic auto-layout**:
   - Build adjacency graph from wires + buses
   - Apply layout algorithm (hierarchical, force-directed, or custom)
   - Ensure stability: same graph → same positions

### Phase 3: Remove Lanes from Patch Document

7. **Stop serializing lanes in patch**:
   - Remove `lanes: Lane[]` from PatchDocument type
   - Remove from toJSON/loadPatch
   - **Breaking change**: requires migration

8. **Replace with semantic-only data**:
   - Patch contains only: blocks, connections, buses, settings
   - Layout is reconstructed from ViewState on load
   - If no ViewState, use default projection

### Dependencies & Blockers

**Depends on:**
- Issue #1 (Port Identity) - ViewState needs stable port references
- Issue #2 (Time Authority) - Time UI mode affects layout

**Blocks:**
- Nothing currently blocks starting Phase 1

**Risks:**
- Large refactor across many files
- Breaks existing saved patches (requires migration)
- UI components assume lanes exist and are mutable

---

## Ambiguities Found

**Question 1: Should lane switching be preserved at all?**

**Context**: Current UI lets users switch between "simple" (5 lanes) and "detailed" (9 lanes) layouts. This changes which lanes exist and where blocks appear.

**Options:**
- **A**: Remove layout switching entirely - pick one canonical projection
- **B**: Keep layout switching as ViewState - multiple named views per patch
- **C**: Make layouts user-configurable - save custom view arrangements

**How it was guessed**: Current code assumes (B) - layout switching exists but is semantic. Spec doc suggests (B) with ViewState separation.

**Impact**:
- (A) simplifies architecture, loses UX flexibility
- (B) matches spec, moderate complexity, preserves UX
- (C) most flexible, highest complexity

**Recommendation**: Option B - keep multiple named views in ViewState.

---

**Question 2: How granular should ViewState be?**

**Context**: ViewState could be per-user, per-patch, per-session, or global.

**Options:**
- **A**: Global ViewState - all patches use same view preferences
- **B**: Per-patch ViewState - each patch remembers its own view
- **C**: Hybrid - global defaults + per-patch overrides

**How it was guessed**: Current code is per-patch (advancedLaneMode in patch settings). Modulation table doesn't persist ViewState at all.

**Impact**:
- (A) loses context when switching patches
- (B) bloats patch files with view state
- (C) best UX, needs careful serialization strategy

**Recommendation**: Option C - store in separate file alongside patch, with global defaults.

---

**Question 3: What happens to lane-based UI components?**

**Context**: Many UI components assume lanes exist and can be edited:
- LaneHeader (collapse/pin/rename)
- BlockPalette (filter by lane)
- DragDrop (drop into lane)

**Options:**
- **A**: Keep lane UI, make it read-only (show inferred lanes, can't edit)
- **B**: Replace with different grouping (by category, by type, by role)
- **C**: Remove lane UI entirely, use flat or graph view

**How it was guessed**: Spec suggests lanes are toxic, but doesn't mandate removal. Could be read-only projection.

**Impact**:
- (A) preserves UX familiarity, requires "lane computation" logic
- (B) requires UX redesign, might be clearer for users
- (C) requires complete UI overhaul

**Recommendation**: Start with (A) for Phase 1, migrate to (B) in Phase 2-3.

---

## Recommendations

### Immediate Actions

1. **Read the modulation table implementation** - it already has the right pattern
2. **Create ViewStateStore** - migrate UI-only state out of patch
3. **Stop persisting advancedLaneMode in patch** - move to ViewState

### Medium-Term (After Port Identity + Time Authority)

4. **Make lane assignment computed** - derive from block semantics
5. **Remove lane mutation operations** - lanes become read-only projection
6. **Implement deterministic layout algorithm** - stable positions from graph

### Long-Term (Multi-UI Phase)

7. **Remove lanes from PatchDocument** - breaking change, needs migration
8. **Add GraphLayout, TableLayout, PerformanceLayout** - multiple view types
9. **Implement view switching** - same patch, different projections

---

## Test Coverage Assessment

**Current state**: No tests for layout-as-projection (doesn't exist yet)

**Tests needed when implementing:**

1. **ViewState isolation**:
   - Changing ViewState doesn't trigger patch revision increment
   - Multiple views can exist for same patch
   - ViewState survives serialization round-trip

2. **Computed lane assignment**:
   - Same blocks → same lanes (deterministic)
   - Block category determines lane kind
   - Adding block doesn't require specifying lane

3. **Layout stability**:
   - Small edits don't cause layout jitter
   - Block order is stable across sessions
   - Layout survives patch reload

4. **Backward compatibility**:
   - Old patches with lanes can load
   - Lanes are migrated to ViewState
   - Blocks end up in correct locations

---

## Verdict

- [X] **NOT_STARTED** - This is architectural debt, not implemented
- [ ] CONTINUE - N/A (not in progress)
- [ ] PAUSE - N/A (no ambiguities blocking start)

**Rationale**:

**Current state violates both core principles:**
1. ✗ Patch is NOT UI-agnostic - contains lanes with blockIds arrays
2. ✗ Layout does NOT live in ViewState - embedded in PatchDocument

**Evidence from code:**
- Lanes serialized in every patch file (RootStore.ts:170)
- Layout mode stored in patch settings (types.ts:678)
- Block-to-lane assignment is mutable state (PatchStore.ts:303-308)
- Switching layouts mutates patch (PatchStore.ts:1013-1042)

**Good news:**
- Modulation table already demonstrates correct ViewState pattern
- Lane system is well-abstracted, could be replaced incrementally
- No implementation started means no half-done migration to clean up

**Recommendation**:
Priority #3 in refactor queue is appropriate. Tackle after Port Identity (#1) and Time Authority (#2), but before adding multi-UI features.

Start with Phase 1 (introduce ViewState) as a non-breaking change.

---

## Files Involved

**Core implementation files:**
- `src/editor/stores/PatchStore.ts` - Owns lanes, needs refactor
- `src/editor/stores/UIStateStore.ts` - Could become ViewStateStore
- `src/editor/stores/RootStore.ts` - Serialization logic
- `src/editor/laneLayouts.ts` - Layout definitions
- `src/editor/types.ts` - Lane, PatchDocument types

**Reference implementation (correct pattern):**
- `src/editor/modulation-table/types.ts` - TableViewState (lines 210-270)
- `src/editor/modulation-table/ModulationTableStore.ts` - View projection

**Spec:**
- `design-docs/10-Refactor-for-UI-prep/4-Layout-As-Projection.md` - Complete spec
- `design-docs/10-Refactor-for-UI-prep/1-Overview.md` - Issue #3 ranking

**Tests to create:**
- `src/editor/stores/__tests__/ViewStateStore.test.ts`
- `src/editor/__tests__/layout-projection.test.ts`
