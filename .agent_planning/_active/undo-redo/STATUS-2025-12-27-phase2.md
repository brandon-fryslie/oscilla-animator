# Status Report: Undo-Redo Phase 2 Evaluation
**Timestamp**: 2025-12-27-043500
**Agent**: project-evaluator
**Scope**: project/undo-redo-phase2
**Confidence**: FRESH (just evaluated)
**Git Commit**: f4cb96f (Value Slots)

---

## Executive Summary

**Sprint 1 Delivered Core Foundation - Sprint 2 Needs Store Migration**

Sprint 1 successfully delivered:
- Complete Op types and inverse computation
- TxBuilder with cascade helpers
- HistoryStore with tree-based revision tracking
- Undo/redo logic with branching support
- Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
- History Panel UI component
- **66 transaction tests passing**

However, the "conservative migration" approach means most store methods still bypass runTx(), making undo non-functional for most real user operations.

**Current State**: Foundation complete (100%), Store migration incomplete (~15%)
**Critical Gap**: User cannot undo most operations because stores use direct mutations

---

## Runtime Check Results

| Check | Status | Output Summary |
|-------|--------|----------------|
| `just test` (full) | FAIL | TypeScript errors in unrelated files (IR/BusChannel) |
| `vitest run src/editor/transactions` | PASS | 66/66 tests pass |

### Note on Test Failures
The TypeScript errors are unrelated to undo-redo and appear to be from parallel IR/compiler work:
- `BusChannel.tsx`: Missing `getPublishersByBus`, `getListenersByBus` methods
- `buildSchedule.ts`: Missing `id` property on `StepMeshMaterialize`
- `BusStore.ts`: Unused import warning

---

## What Sprint 1 Delivered (COMPLETE)

### 1. Op Types and Inverses (P0-1)
**Status**: COMPLETE
**Files**: `src/editor/transactions/ops.ts`

- 8 Op types defined: Add, Remove, Update, SetBlockPosition, SetTimeRoot, SetTimelineHint, Many
- `computeInverse(op)` correctly inverts all types
- `validateOp(op)` validates structure
- 20 unit tests for inversion logic

### 2. TxBuilder Core (P0-2)
**Status**: COMPLETE
**Files**: `src/editor/transactions/TxBuilder.ts`

- `runTx(store, spec, build)` function works correctly
- `TxBuilder` methods: add(), remove(), replace(), setTimeRoot(), many()
- Inverse ops computed at commit time
- GraphCommitted events emitted with diff summary
- 26 unit tests for TxBuilder

### 3. Cascade Helpers (P0-3)
**Status**: COMPLETE
**Files**: `src/editor/transactions/TxBuilder.ts` (lines 336-421)

- `removeBlockCascade(blockId)` removes block + connections + publishers + listeners + default sources + lane membership
- `removeBusCascade(busId)` removes bus + all publishers + all listeners
- Both generate Many ops with correct sub-op ordering
- 4 tests for cascade helpers

### 4. HistoryStore (P0-4)
**Status**: COMPLETE
**Files**: `src/editor/stores/HistoryStore.ts`

- Revision tree with parent/child links
- `RevisionNode` stores ops, inverseOps, label, timestamp
- `addRevision()` creates new nodes
- `getRevision()`, `getParent()`, `getChildren()` for tree navigation
- Supports branching (multiple children per parent)
- 22 tests for HistoryStore

### 5. Undo/Redo Operations (P0-5)
**Status**: COMPLETE
**Files**: `src/editor/stores/HistoryStore.ts`

- `undo()` applies inverse ops, moves to parent
- `redo()` applies forward ops, moves to preferred child
- `canUndo` / `canRedo` computed properties
- Preferred child tracking for redo path selection

### 6. Keyboard Shortcuts (P1-1)
**Status**: COMPLETE
**Files**: `src/editor/Editor.tsx` (lines 563-594)

- Cmd+Z triggers undo
- Cmd+Shift+Z triggers redo
- Ignores text input fields (INPUT, TEXTAREA, contentEditable)
- Console logs on success

### 7. History Panel UI (P1-2)
**Status**: COMPLETE
**Files**: `src/editor/components/HistoryPanel.tsx`, `HistoryPanel.css`

- Collapsible panel with revision list
- Current revision highlighted
- Undo/Redo buttons with disabled state
- Shows label, timestamp, revision ID

---

## What Remains (INCOMPLETE)

### PatchStore Methods NOT Using runTx()

**Status**: MOSTLY INCOMPLETE

| Method | Uses runTx()? | Notes |
|--------|---------------|-------|
| `connect()` | PARTIAL | Only without `suppressGraphCommitted` option |
| `disconnect()` | PARTIAL | Only without `suppressGraphCommitted` option |
| `addBlock()` | NO | Direct push to `blocks` array |
| `removeBlock()` | NO | Direct filter on `blocks` array |
| `updateBlock()` | NO | Direct Object.assign |
| `updateBlockParams()` | NO | Direct Object.assign on params |
| `replaceBlock()` | NO | Uses suppress flag, direct mutations |
| `expandMacro()` | NO | Clears patch directly, creates entities |
| `addBlockAtIndex()` | NO | Direct push |
| `updateConnection()` | NO | Direct array modification |
| `addLensToConnection()` | NO | Direct mutation |
| `removeLensFromConnection()` | NO | Direct mutation |
| `updateConnectionLens()` | NO | Direct mutation |
| `setConnectionEnabled()` | NO | Direct mutation |

**Evidence from PatchStore.ts**:
- Line 673: `this.blocks = this.blocks.filter(...)` (direct mutation)
- Line 651: `Object.assign(block, updates)` (direct mutation)
- Line 506: `this.connections.push(connection)` (inside expandMacro)

### BusStore Methods NOT Using runTx()

**Status**: PARTIALLY MIGRATED

| Method | Uses runTx()? | Notes |
|--------|---------------|-------|
| `createBus()` | YES | Migrated |
| `deleteBus()` | NO | Direct filter on arrays |
| `updateBus()` | NO | Direct assignment |
| `addPublisher()` | YES | Migrated |
| `removePublisher()` | YES | Migrated |
| `addListener()` | YES | Migrated |
| `removeListener()` | YES | Migrated |
| `updatePublisher()` | NO | Direct array modification |
| `updateListener()` | NO | Direct array modification |
| `addLensToStack()` | NO | Direct array modification |
| `removeLensFromStack()` | NO | Direct array modification |
| `clearLensStack()` | NO | Direct modification |
| `reorderPublisher()` | NO | Direct sortKey modification |

**Evidence from BusStore.ts**:
- Lines 187-191: `deleteBus()` uses direct filter
- Line 206-208: `updateBus()` uses direct assignment
- Line 267-282: `updatePublisher()` uses direct array replacement

### Deferred Items from Sprint 1

1. **Gesture Buffer** - Not started
   - Working state overlay
   - Consolidation for continuous edits (drags)
   - Preview policies

2. **IndexedDB Persistence** - Not started
   - History persisted across sessions

3. **Advanced History UI** - Not started
   - Map view (tree visualization)
   - Variation chooser

---

## Data Flow Verification

| Flow | Input | Process | Store | Retrieve | Display |
|------|-------|---------|-------|----------|---------|
| Connect via UI | OK | runTx | OK | OK | OK |
| Disconnect via UI | OK | runTx | OK | OK | OK |
| Add block | OK | BYPASS | BYPASS | N/A | N/A |
| Remove block | OK | BYPASS | BYPASS | N/A | N/A |
| Update params | OK | BYPASS | BYPASS | N/A | N/A |
| Add publisher | OK | runTx | OK | OK | OK |
| Remove publisher | OK | runTx | OK | OK | OK |
| Add listener | OK | runTx | OK | OK | OK |
| Remove listener | OK | runTx | OK | OK | OK |
| Replace block | OK | BYPASS | BYPASS | N/A | N/A |
| Expand macro | OK | BYPASS | BYPASS | N/A | N/A |

**BYPASS = Operation does not go through transaction system, cannot be undone**

---

## LLM Blind Spot Check

### Pagination & Lists
- Not applicable (history panel shows all revisions)

### State & Persistence
- ISSUE: History is in-memory only, lost on refresh
- ISSUE: No snapshot intervals implemented (spec says every 25 revisions)

### Cleanup & Resources
- OK: RevisionNode stores plain data, no cleanup needed

### Error Messages
- OK: TxBuilder throws clear errors for invalid operations

### Edge Cases
- OK: Empty transaction handled (creates revision with no ops)
- OK: Undo at root returns false gracefully
- OK: Redo at leaf returns false gracefully

---

## Test Suite Assessment

**Quality Score: 4/5**

| Question | Status |
|----------|--------|
| If I delete implementation and leave stubs, do tests fail? | YES - Good |
| If I introduce obvious bug, do tests catch it? | MOSTLY - Good |
| Do tests exercise real user flows? | PARTIAL - Unit tests only |
| Do tests use real systems or mock everything? | REAL - Uses actual RootStore |
| Do tests cover error conditions? | YES - Good |

### Coverage Gaps

User actions WITHOUT test coverage:
- Add block via UI -> undo (NO - addBlock bypasses runTx)
- Update block params via UI -> undo (NO - updateBlockParams bypasses runTx)
- Replace block via UI -> undo (NO - replaceBlock bypasses runTx)
- Expand macro -> undo (NO - expandMacro bypasses runTx)
- Update bus properties -> undo (NO - updateBus bypasses runTx)
- Drag block position -> undo (NO - position not tracked)

### Missing Integration Tests

The test suite covers the transaction system in isolation but lacks:
1. End-to-end tests: UI action -> store mutation -> undo -> verify state
2. Tests that verify `suppressGraphCommitted` path works with undo
3. Tests for operations that currently bypass runTx

---

## Implementation Red Flags

### Dual-Path Mutations (Critical)

**Flag**: PatchStore methods have dual-path behavior via `suppressGraphCommitted` flag

```typescript
// From PatchStore.connect() (lines 970-998)
if (options?.suppressGraphCommitted === true) {
  // Direct mutation for internal use (not yet migrated)
  this.connections.push(connection);
} else {
  // Use transaction system for user-facing calls
  runTx(this.root, { label: 'Connect' }, tx => {
    tx.add('connections', connection);
  });
}
```

**Problem**: The `suppressGraphCommitted` path is used by:
- `replaceBlock()` - calls connect/disconnect with suppress=true
- `removeBlock()` - calls disconnect with suppress=true
- `expandMacro()` - doesn't use runTx at all

**Impact**: Complex operations that compose simpler ones don't get undo support.

### Incomplete Cascades

**Flag**: `removeBlock()` in PatchStore duplicates cascade logic instead of using TxBuilder

```typescript
// PatchStore.removeBlock() does its own cascade (lines 666-713)
this.blocks = this.blocks.filter((b) => b.id !== id);
this.root.defaultSourceStore.removeDefaultSourcesForBlock(id);
for (const conn of connectionsToRemove) {
  this.disconnect(conn.id, { suppressGraphCommitted: true });
}
```

This duplicates TxBuilder.removeBlockCascade() but doesn't use it.

### Missing applyOps for Some Op Types

**Flag**: `SetBlockPosition` and `SetTimelineHint` are no-ops in applyOps.ts

```typescript
// applyOps.ts lines 228-248
function applySetBlockPosition(_blockId, _next, _store) {
  // TODO: Enable when ViewStateStore has blockPositions Map
}

function applySetTimelineHint(_next, _store) {
  // Timeline hint storage is not yet implemented
}
```

Block positions are critical for undo (especially after drag operations).

---

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| Block position undo | Should block drag positions be undoable? | Deferred (SetBlockPosition is no-op) | Users can't undo block movements |
| suppressGraphCommitted | When should this flag be used? | Used for "internal" calls | Complex operations don't get undo |
| Snapshot intervals | Should snapshots be created automatically? | Not implemented | Missing performance optimization |
| Event emission during undo | Should WireAdded/WireRemoved fire during undo? | No events during undo | Listeners might not update correctly |

---

## Recommended Priority for Phase 2

### Priority 1: Complete PatchStore Migration (P0)

These methods must use runTx() for undo to work:

1. **addBlock()** - Most common operation
2. **removeBlock()** - Should use TxBuilder.removeBlockCascade()
3. **updateBlockParams()** - Used on every param drag
4. **replaceBlock()** - Complex but important for quick-swap UX

### Priority 2: Complete BusStore Migration (P0)

1. **deleteBus()** - Should use TxBuilder.removeBusCascade()
2. **updateBus()** - Name changes, combine mode changes
3. **updatePublisher()** / **updateListener()** - Enable/disable, sortKey

### Priority 3: Enable Position Undo (P1)

1. Implement `blockPositions` Map in ViewStateStore
2. Enable `applySetBlockPosition()` in applyOps.ts
3. Modify block drag handlers to use runTx()

### Priority 4: Verify and Test (P0)

1. Integration tests for add/remove/update -> undo flow
2. Manual testing with Chrome DevTools MCP
3. Verify MobX reactivity preserved after undo

### Deferred to Future Sprints

- Gesture buffer (continuous edit consolidation)
- IndexedDB persistence
- Snapshot intervals
- History panel map view

---

## Dependencies and Risks

### Dependencies

1. **MobX Reactivity**: Update ops use Object.assign to preserve references
   - Risk: If array replacement used instead, MobX observers may not update
   - Mitigation: All tests use real MobX stores

2. **Event System**: runTx emits GraphCommitted, but fine-grained events (BlockAdded, WireAdded) are still emitted separately
   - Risk: Double-event emission during normal flow, no events during undo
   - Current: Acceptable - events serve different purposes

3. **Compiler Integration**: GraphCommitted triggers recompile
   - Risk: Undo should trigger recompile too
   - Current: Works because applyOps triggers MobX change detection

### Risks

1. **Breaking Changes**: Migrating methods to runTx() could break callers expecting direct mutation
   - Mitigation: Keep public API the same, change implementation
   - Test: Run full test suite after each method migration

2. **Performance**: Transaction overhead on every operation
   - Current: Negligible - 66 tests run in 63ms
   - Future: May need gesture buffer for drag operations

3. **Event Ordering**: Events fire in different order with transactions
   - Risk: UI components relying on event order may break
   - Mitigation: Events still fire after commit, should be compatible

---

## Recommendations

### Immediate Actions

1. **Migrate addBlock()** - Highest impact, most common operation
2. **Migrate removeBlock()** - Replace direct cascade with TxBuilder.removeBlockCascade()
3. **Migrate updateBlockParams()** - Every param slider uses this

### Integration Test Needed

```typescript
// This test does NOT exist and SHOULD
it('undoes addBlock operation', () => {
  const initialBlocks = rootStore.patchStore.blocks.length;

  // Add a block (currently bypasses runTx)
  rootStore.patchStore.addBlock('Constant');
  expect(rootStore.patchStore.blocks.length).toBe(initialBlocks + 1);

  // Undo
  rootStore.historyStore.undo();
  expect(rootStore.patchStore.blocks.length).toBe(initialBlocks);
});
```

This test would FAIL with current implementation because addBlock() doesn't use runTx().

### Phase 2 DOD

- [ ] All PatchStore action methods use runTx() exclusively
- [ ] All BusStore action methods use runTx() exclusively
- [ ] User can undo: addBlock, removeBlock, updateParams, connect, disconnect
- [ ] User can undo: replaceBlock, expandMacro
- [ ] Integration tests verify undo for all entity types
- [ ] Manual testing confirms undo works in real UI

---

## Verdict

**CONTINUE** - Issues are clear, implementation path defined

Sprint 1 delivered solid foundation. Sprint 2 needs systematic migration of store methods to runTx(). The dual-path mutation pattern (`suppressGraphCommitted`) should be eliminated - all mutations should flow through runTx().

### Workflow

- [ ] CONTINUE - Implementer can proceed with store migration
- [ ] PAUSE - Not needed, requirements are clear

---

## Summary

| Metric | Value |
|--------|-------|
| Foundation Complete | 100% |
| PatchStore Migrated | ~15% (connect/disconnect only) |
| BusStore Migrated | ~50% (create/add/remove routing) |
| Tests Passing | 66/66 |
| User-Facing Undo Works | NO (most operations bypass runTx) |
| Next Priority | Migrate addBlock, removeBlock, updateBlockParams |
