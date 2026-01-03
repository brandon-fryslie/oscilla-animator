# Status Report: Undo-Redo Phase 4 Evaluation
**Timestamp**: 2025-12-27-153000
**Agent**: project-evaluator
**Scope**: project/undo-redo-phase4
**Confidence**: FRESH (just evaluated)
**Git Commit**: f4cb96f (Value Slots)

---

## Executive Summary

**Phase 4 is a collection of largely independent features, NOT a cohesive sprint**

Phase 4 scope breaks down into four distinct areas with different complexity, dependencies, and value:

| Area | Complexity | Dependencies | User Value | Recommendation |
|------|-----------|--------------|------------|----------------|
| expandMacro() | VERY HIGH | Architecture decision needed | LOW (rarely undone) | DEFER or SKIP |
| Block position undo | HIGH | Gesture buffer, ViewStateStore changes | MEDIUM | Separate sprint |
| IndexedDB persistence | MEDIUM | None (standalone) | HIGH (session survival) | Separate sprint |
| Advanced History UI | MEDIUM-HIGH | None (uses existing HistoryStore) | MEDIUM | Future polish |

**Critical Finding**: These four areas should NOT be bundled into a single sprint. They have different dependencies, different risk profiles, and can be delivered independently.

---

## Previous Phase Status

### Phase 1: COMPLETE (Foundation)
- Op types, TxBuilder, HistoryStore: 100%
- Undo/redo logic, keyboard shortcuts: 100%
- History Panel (basic): 100%
- 66 unit tests passing

### Phase 2: COMPLETE (Store Migration)
- PatchStore methods migrated: addBlock, removeBlock, updateBlock, updateBlockParams, connect, disconnect
- 87 tests passing (66 unit + 21 integration)

### Phase 3: DEFERRED
- replaceBlock, addBlockAtIndex, lens operations planned but not implemented
- User explicitly deferred implementation

---

## Area 1: expandMacro() Undo

### Current State
**Status**: NOT STARTED - REQUIRES ARCHITECTURAL DECISION

**Location**: `src/editor/stores/PatchStore.ts:478-665` (187 lines)

**Code Analysis**:
```typescript
expandMacro(expansion: MacroExpansion, macroKey?: string): BlockId {
  // Clear the patch first - macros replace everything
  this.root.clearPatch();  // <-- THE PROBLEM

}
```

### The Problem: clearPatch() is Destructive

`clearPatch()` in `RootStore.ts:379-412`:
- Clears PatchStore: blocks, connections
- Clears ViewStateStore: lane blockIds
- Recreates default buses
- Emits `PatchCleared` event

**This is not a transaction - it's a complete state reset.**

### Options for Making expandMacro() Undoable

**Option A: Single Mega-Transaction (Capture Everything)**
```typescript
runTx(store, { label: 'Expand Macro' }, tx => {
  // Remove all existing entities (with captured state for inverse)
  for (const block of store.patchStore.blocks) {
    tx.removeBlockCascade(block.id);
  }
  for (const bus of store.busStore.buses) {
    if (!isDefaultBus(bus)) tx.removeBusCascade(bus.id);
  }
  // Add all new entities from expansion
  for (const macroBlock of expansion.blocks) {
    tx.add('blocks', createBlock(macroBlock));
  }
});
```

**Pros**: True undo - restores exact previous state
**Cons**:
- HUGE ops array (entire old patch + entire new patch)
- Inverse computation expensive
- May hit performance issues with large patches
- clearPatch() also touches Kernel, uiStore - what about those?

**Option B: Checkpoint Operation (Cannot Undo Past)**
- Mark expandMacro as a "checkpoint" that clears history
- User cannot undo past a macro expansion
- Simple but loses history

**Pros**: Easy to implement
**Cons**: Violates "undo everything" principle

**Option C: Snapshot-Based Undo**
- Before expandMacro: capture full patch snapshot
- Undo = restore snapshot (not replay ops)
- Similar to Option A but different mechanism

**Pros**: Clean conceptual model
**Cons**: Still need snapshot infra, same size issues

### Why expandMacro Undo Has LOW User Value

Macro expansion is typically done:
1. At project start (tutorial macros)
2. Intentionally to reset and start fresh
3. Rarely accidentally

**Users almost never want to undo a macro expansion** - they expand a macro TO start over.

### Recommendation: DEFER or SKIP

Given:
- HIGH complexity
- LOW user value
- Requires architecture decision
- Other areas provide more value

**Recommend**: Skip expandMacro undo for now. Users can use Save/Load for safety.

---

## Area 2: Block Position Undo

### Current State
**Status**: INFRASTRUCTURE PARTIALLY EXISTS - GESTURE BUFFER NEEDED

**Existing Code**:
1. `SetBlockPosition` Op type: EXISTS (`src/editor/transactions/ops.ts`)
2. `applySetBlockPosition()`: NO-OP (`src/editor/transactions/applyOps.ts:228-231`)
3. ViewStateStore blockPositions Map: DOES NOT EXIST
4. Gesture buffer: DOES NOT EXIST

### What's Missing

**1. ViewStateStore Position Storage**

Current ViewStateStore has NO `blockPositions` Map. Block positions are:
- Calculated dynamically via `projectionLayout` computed property
- Stored implicitly in lane order (`lane.blockIds`)

**This is a fundamental design issue**: Block positions aren't persisted as data, they're derived from lane membership.

**Question**: What does "undo block position" mean?
- Undo drag within a lane? (reorder)
- Undo drag between lanes?
- Undo position in projection view?

Lane view = implicit positions
Projection view = computed positions

**Neither stores user-defined pixel positions.**

**2. Gesture Buffer (REQUIRED for Position Undo)**

From `design-docs/6-Transactions/4-GestureBufferSpec.md`:
- Gesture buffer coalesces continuous edits (drags) into one revision
- Without it, dragging a block creates 60+ undo steps per second
- Spec defines full API: `beginGesture()`, `updateGesture()`, `commitGesture()`

**Estimated complexity**: HIGH
- Working state overlay (ops list + indices)
- Consolidation rules (latest position only)
- Integration with TxBuilder
- Integration with UI drag handlers

**3. UI Integration**

Where are blocks dragged?
- `BlockCard.tsx`: Lane reordering via react-dnd
- `PatchCanvas.tsx`: Projection view (if it exists)

Would need to wrap drag handlers with gesture API.

### Recommendation: SEPARATE SPRINT

Block position undo requires:
1. Design decision on what "position" means (lane order vs. pixel coords)
2. Full gesture buffer implementation
3. ViewStateStore changes
4. UI handler integration

**Estimated complexity**: HIGH (full sprint)
**Prerequisites**: Clear position semantics, gesture buffer design

---

## Area 3: IndexedDB Persistence

### Current State
**Status**: NOT STARTED - STANDALONE FEATURE

**No existing code** - grep for IndexedDB/idb/Dexie found nothing.

### What's Needed

**1. Storage Schema**
```typescript
interface HistoryDB {
  // Revisions table
  revisions: {
    id: number;
    parentId: number;
    ops: Op[];
    inverseOps: Op[];
    label: string;
    timestamp: number;
    snapshotData?: unknown;
  };

  // Metadata
  meta: {
    currentRevisionId: number;
    nextRevisionId: number;
    rootPreferredChildId?: number;
  };
}
```

**2. Library Choice**
- **idb** (small wrapper): Recommended - simple, typed
- **Dexie**: More features, larger bundle
- Raw IndexedDB: More work, no abstraction

**3. Integration Points**
- `HistoryStore.addRevision()`: Write to IDB after adding to memory
- `HistoryStore` constructor: Load from IDB on init
- Snapshot strategy: Full patch every N revisions

**4. Challenges**
- Op serialization (must be JSON-safe - already are)
- Large revision trees (may need cleanup/compaction)
- Cross-tab coordination (one tab at a time per project?)

### Value Assessment

**User Value**: HIGH
- History survives page refresh
- History survives browser crash
- Enables "pick up where I left off"

**Complexity**: MEDIUM
- Standard IndexedDB patterns
- No architectural decisions needed
- HistoryStore already has clean data model

### Recommendation: GOOD CANDIDATE FOR NEAR-TERM SPRINT

This is:
- Standalone (no other feature depends on it)
- Well-defined (clear scope)
- High value (users lose history on refresh)
- Medium complexity (known patterns)

---

## Area 4: Advanced History UI

### Current State
**Status**: BASIC UI EXISTS - ADVANCED FEATURES NOT STARTED

**Existing** (`src/editor/components/HistoryPanel.tsx`):
- Collapsible panel with revision list
- Current revision highlighted
- Undo/Redo buttons with disabled state
- Shows label, timestamp, revision ID
- ~125 lines, basic but functional

**Missing** (from `design-docs/6-Transactions/8-HistoryPanelUI.md`):
1. Pinned revisions (bookmarks)
2. Variation expansion (inline branch view)
3. Redo choice overlay (when multiple children)
4. Map view (tree visualization)
5. Context menu (bookmark, rename, etc.)
6. Virtualized list for 100+ revisions
7. Keyboard navigation
8. Compile status badges

### Complexity Assessment

| Feature | Complexity | Dependencies |
|---------|------------|--------------|
| Pinned revisions | LOW | HistoryStore.bookmark() needed |
| Variation expansion | MEDIUM | Already have getChildren() |
| Redo choice overlay | MEDIUM | UI-only |
| Map view | HIGH | Canvas/SVG rendering, layout algorithm |
| Context menu | LOW | UI-only |
| Virtualized list | MEDIUM | react-window or similar |
| Keyboard nav | LOW | Event handlers |
| Compile status | MEDIUM | Needs status tracking per revision |

### Value Assessment

**Immediate value**: Variation expansion, redo choice overlay
- Users currently can't choose which branch to redo
- getChildren() already works

**Deferred value**: Map view, compile status
- Nice-to-have, not blocking

### Recommendation: INCREMENTAL POLISH

Add features incrementally based on user feedback:
1. P1: Variation expansion + redo choice overlay
2. P2: Pinned revisions
3. P3: Map view, compile status

---

## Dependencies Graph

```
Phase 3 (deferred)
├── replaceBlock migration
├── addBlockAtIndex migration
└── lens operations migration

Phase 4 Areas (INDEPENDENT):

expandMacro undo ─────────────> Architecture decision (clearPatch)
                                 └─> HIGH complexity, LOW value

Block position undo ──────────> ViewStateStore position storage
                               > Gesture buffer implementation
                               > UI drag handler integration
                                 └─> HIGH complexity, MEDIUM value

IndexedDB persistence ────────> NONE (standalone)
                                 └─> MEDIUM complexity, HIGH value

Advanced History UI ──────────> HistoryStore.bookmark() (new)
                               > Variation UI components
                                 └─> MEDIUM complexity, MEDIUM value
```

---

## Ambiguities Found

| Area | Question | Impact |
|------|----------|--------|
| expandMacro | Should macro expansion be undoable at all? | Architecture decision needed |
| Block positions | What does "position" mean? Lane order or pixel coords? | Design decision needed |
| Gesture buffer | Full spec exists but no implementation plan | Blocks position undo |
| IndexedDB | Cross-tab coordination strategy? | Edge case handling |
| History UI | Which features are P1 vs P2? | Prioritization needed |

---

## Recommendations

### DO NOT Bundle Phase 4 as Single Sprint

These are four independent workstreams. Bundling them creates:
- Unclear success criteria
- Dependency confusion
- Risk of partial delivery

### Recommended Sprint Breakdown

**Sprint 4A: IndexedDB Persistence** (RECOMMENDED NEXT)
- Scope: History survives page refresh
- Complexity: MEDIUM
- Value: HIGH
- Dependencies: None
- Deliverables:
  - [ ] IDB wrapper module
  - [ ] HistoryStore persistence integration
  - [ ] Load on init, save on change
  - [ ] Basic error handling

**Sprint 4B: History UI Polish**
- Scope: Variation expansion, redo choice, bookmarks
- Complexity: MEDIUM
- Value: MEDIUM
- Dependencies: None
- Deliverables:
  - [ ] Inline variation expansion
  - [ ] Redo choice overlay
  - [ ] Bookmark/pin revisions
  - [ ] Keyboard navigation

**Sprint 4C: Gesture Buffer + Position Undo**
- Scope: Block moves create single undo step
- Complexity: HIGH
- Value: MEDIUM
- Dependencies: Position semantics decision
- Deliverables:
  - [ ] Gesture buffer implementation
  - [ ] ViewStateStore changes (if pixel positions)
  - [ ] UI integration

**Sprint 4D: expandMacro Undo (OPTIONAL)**
- Scope: Macro expansion is undoable
- Complexity: VERY HIGH
- Value: LOW
- Dependencies: Architecture decision
- Recommendation: SKIP unless user explicitly requests

### Immediate Next Steps

1. **User decision needed**: Which area provides most value to YOU?
   - IndexedDB (survive refresh)?
   - History UI polish (better navigation)?
   - Position undo (undo block drags)?

2. **If IndexedDB**: Ready to plan Sprint 4A
3. **If Position Undo**: Need gesture buffer design first
4. **If History UI**: Ready to plan Sprint 4B

---

## Runtime Check Results

| Check | Status | Output Summary |
|-------|--------|----------------|
| `pnpm vitest run src/editor/transactions` | FAIL | Registry validation errors (unrelated to undo-redo) |
| Ops unit tests | PASS | 20/20 (ops.test.ts works in isolation) |

**Note**: Test failures are due to block registry validation errors from parallel IR/compiler work, NOT undo-redo issues.

---

## Verdict

**PAUSE** - User decision needed on priority

Phase 4 is not a single sprint but four independent features. Before planning implementation:

1. Which feature area is highest priority for the user?
2. For expandMacro: Is it even needed? (low value)
3. For position undo: What does "position" mean semantically?

---

## Summary

| Metric | Value |
|--------|-------|
| Phase 1-2 Complete | YES |
| Phase 3 | DEFERRED |
| Phase 4 Areas | 4 independent features |
| Ready for Implementation | IndexedDB, History UI |
| Needs Decision First | expandMacro, Position Undo |
| Recommended Next | Sprint 4A (IndexedDB) |
