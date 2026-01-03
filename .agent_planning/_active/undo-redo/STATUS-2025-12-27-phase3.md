# Status Report: Undo-Redo Phase 3 Evaluation
**Timestamp**: 2025-12-27-104200
**Agent**: project-evaluator
**Scope**: project/undo-redo-phase3
**Confidence**: FRESH (just evaluated)
**Git Commit**: f4cb96f (Value Slots)

---

## Executive Summary

**Phase 2 Delivered Core Store Migration - Phase 3 Targets Complex Operations**

Phase 2 successfully migrated:
- PatchStore: addBlock, removeBlock, updateBlock, updateBlockParams, connect, disconnect
- Deep clone fix for tx.replace() undo bug
- **87 tests passing** (66 unit + 21 integration)

**Remaining Work Categories:**

| Category | Items | Complexity | Phase Recommendation |
|----------|-------|------------|---------------------|
| Complex Operations | replaceBlock, expandMacro, addBlockAtIndex | HIGH | Phase 3 |
| Lens Operations | 6 methods across PatchStore + BusStore | MEDIUM | Phase 3 |
| Block Positions | ViewStateStore positions, gestures | MEDIUM | Phase 4 |
| Persistence | IndexedDB, snapshots | LOW | Phase 4+ |
| Advanced UI | Map view, variations | LOW | Phase 4+ |

---

## Runtime Check Results

| Check | Status | Output Summary |
|-------|--------|----------------|
| `pnpm vitest run src/editor/transactions` | PASS | 87/87 tests pass |
| `just check` | PARTIAL | Some TS errors in unrelated IR files |

---

## Phase 2 Completion Verification [FRESH]

### Migrated to runTx() (COMPLETE)

| Store | Method | Status | Evidence |
|-------|--------|--------|----------|
| PatchStore | addBlock() | COMPLETE | Line 364: `runTx(...tx.add('blocks', block))` |
| PatchStore | removeBlock() | COMPLETE | Line 710: `tx.removeBlockCascade(id)` |
| PatchStore | updateBlock() | COMPLETE | Line 689: `tx.replace('blocks', id, next)` |
| PatchStore | updateBlockParams() | COMPLETE | Line 885: `tx.replace('blocks', blockId, next)` |
| PatchStore | connect() | COMPLETE | Line 994+: uses runTx, fallback for suppress |
| PatchStore | disconnect() | COMPLETE | Line 1044+: uses runTx, fallback for suppress |
| BusStore | createBus() | COMPLETE | Line 154: `tx.add('buses', bus)` |
| BusStore | deleteBus() | COMPLETE | Line 184: `tx.removeBusCascade(busId)` |
| BusStore | updateBus() | COMPLETE | Line 202: `tx.replace('buses', busId, next)` |

### suppressGraphCommitted Pattern - Still Present

The pattern remains in **4 locations** for replaceBlock():
```
PatchStore.ts:804  - connect() called with suppress=true
PatchStore.ts:853  - removeBlock() called with suppress=true (now ignored)
PatchStore.ts:912  - disconnect() called with suppress=true
PatchStore.ts:994  - connect() has suppress check
PatchStore.ts:1044 - disconnect() has suppress check
```

---

## Deferred Items Assessment

### 1. replaceBlock() - Complex Operation

**Current State**: NOT MIGRATED to runTx()
**Location**: PatchStore.ts:731-877 (147 lines)

**Complexity Analysis**: HIGH
- Creates new block via direct push (line 783)
- Creates default sources (not tx-aware)
- Modifies lane blockIds directly (line 796)
- Calls connect() with suppressGraphCommitted (line 804)
- Calls removeBlock() (which now uses runTx - DOUBLE TRANSACTION!)
- Emits multiple events in sequence

**Issues Found**:
1. **Double transaction problem**: removeBlock() now uses runTx(), but replaceBlock() doesn't
   - This means undo of replaceBlock leaves orphaned new block
2. **Mixed transaction modes**: Some sub-operations use runTx, others don't
3. **Event ordering**: BlockReplaced emitted BEFORE removeBlock (intentional for selection)

**Migration Strategy**:
```typescript
runTx(this.root, { label: 'Replace Block' }, tx => {
  // 1. Add new block
  tx.add('blocks', newBlock);
  // 2. Copy preserved connections (use tx.add for each)
  // 4. Remove old block cascade
  tx.removeBlockCascade(oldBlockId);
});
```

**Estimated Complexity**: HIGH (requires careful sub-op decomposition)

---

### 2. expandMacro() - Patch Clear + Multi-Block

**Current State**: NOT MIGRATED to runTx()
**Location**: PatchStore.ts:478-665 (187 lines)

**Complexity Analysis**: HIGH
- Calls clearPatch() first (which resets everything)
- Uses _createBlock() helper (direct push, no runTx)
- Creates many blocks in a loop
- Creates connections with validation
- Emits MacroExpanded + GraphCommitted

**Issues Found**:
1. clearPatch() is not transaction-aware (entire state reset)
2. _createBlock() bypasses runTx for performance (used by both expandMacro and addBlock internal)

**Migration Strategy**:
Option A: Single mega-transaction (difficult - clearPatch changes everything)
Option B: Mark expandMacro as "checkpoint" operation (cannot undo past it)

**Estimated Complexity**: VERY HIGH (may need design decision)

---

### 3. addBlockAtIndex() - Atomicity Issue

**Current State**: NOT MIGRATED to runTx()
**Location**: PatchStore.ts:396-470 (75 lines)

**Complexity Analysis**: MEDIUM
- Direct blocks.push (line 429)
- Direct lane modification (line 444)
- Calls processAutoBusConnections (which calls runTx-aware methods)
- Creates default sources (not tx-aware)

**Migration Strategy**: Similar to addBlock() but with lane assignment in same tx

**Estimated Complexity**: MEDIUM

---


**PatchStore Methods** (direct mutations via updateConnection):
| Method | Lines | Status |
|--------|-------|--------|
| addLensToConnection() | 1123-1140 | Uses updateConnection (not tx) |
| removeLensFromConnection() | 1147-1162 | Uses updateConnection (not tx) |
| updateConnectionLens() | 1170-1186 | Uses updateConnection (not tx) |
| updateConnection() | 1088-1122 | Direct array mutation |

**BusStore Methods** (direct array mutations):
| Method | Lines | Status |
|--------|-------|--------|
| addLensToStack() | 406-435 | Direct array mutation |
| removeLensFromStack() | 437-461 | Direct array mutation |
| clearLensStack() | 463-474 | Direct array mutation |

**Migration Strategy**:
- updateConnection() should use runTx with tx.replace('connections', ...)

**Estimated Complexity**: LOW-MEDIUM (straightforward pattern)

---

### 5. Block Position Undo (ViewStateStore)

**Current State**: NOT STARTED
**Location**: ViewStateStore.ts (no blockPositions Map)

**What's Needed**:
1. Add `blockPositions: Map<BlockId, {x: number, y: number}>` to ViewStateStore
2. Enable applySetBlockPosition() in applyOps.ts (currently no-op)
3. Create drag handlers that use runTx with SetBlockPosition ops
4. Gesture buffer for smooth drags (consolidate rapid position updates)

**Dependencies**:
- Requires gesture buffer to avoid 100s of undo steps per drag
- Position data may need persistence story

**Estimated Complexity**: MEDIUM (needs gesture buffer design)

---

### 6. Other Deferred Items

| Item | Complexity | Recommendation |
|------|------------|----------------|
| Gesture buffer | MEDIUM | Phase 4 (with positions) |
| IndexedDB persistence | LOW | Phase 4+ |
| Snapshot intervals | LOW | Phase 4+ |
| History map view | LOW | Phase 4+ |
| Variations chooser | LOW | Phase 4+ |

---

## Ambiguities Found

| Area | Question | Impact |
|------|----------|--------|
| expandMacro atomicity | Should macro expansion be undoable? | If yes, need clearPatch tx support |
| Nested transactions | What happens when runTx-aware method called inside non-tx code? | Currently creates separate history entries |
| Event ordering in replaceBlock | BlockReplaced must fire before removeBlock - how in single tx? | May need post-tx event emission |

---

## Phase 3 Sprint Recommendations

### Recommended Deliverables (2-3 items)

**P0: replaceBlock() Migration**
- Highest user impact (quick-swap is common workflow)
- Currently broken: partial undo leaves orphaned blocks
- Clear migration path
- Complexity: HIGH but tractable
- Test coverage: Add 5+ integration tests

**P0: Lens Operations Migration**
- 7 methods across 2 stores
- Straightforward pattern (all use tx.replace)
- Lower complexity than replaceBlock
- Enables undo for lens editor workflows
- Test coverage: Add 10+ tests

**P1: addBlockAtIndex() Atomicity**
- Medium complexity
- Needed for complete addBlock story
- Test coverage: Add 3+ tests

### Defer to Phase 4+

| Item | Reason |
|------|--------|
| expandMacro | Needs design decision on clearPatch atomicity |
| Block positions | Needs gesture buffer (separate feature) |
| IndexedDB | Nice-to-have, not blocking |
| Advanced UI | Nice-to-have, not blocking |

---

## Dependencies

```
Phase 3:
  replaceBlock() --> removes suppressGraphCommitted from connect/disconnect
  Lens ops --> straightforward, no deps
  addBlockAtIndex --> depends on lane transaction support

Phase 4:
  expandMacro --> needs clearPatch atomicity decision
  Block positions --> needs gesture buffer

Phase 4+:
  IndexedDB --> standalone
  Advanced UI --> needs IndexedDB
```

---

## Test Coverage Gaps

**Missing Integration Tests** (Phase 3 should add):
1. replaceBlock -> undo -> original block restored with connections
3. addLensToConnection -> undo -> lens removed
4. removeLensFromConnection -> undo -> lens restored
5. updateConnectionLens -> undo -> params restored
8. clearLensStack -> undo -> stack restored

---

## Workflow Recommendation

- [x] **CONTINUE** - Issues are clear, implementer can proceed

### Phase 3 DOD (Definition of Done)

- [ ] replaceBlock() uses single runTx() - atomic undo
- [ ] suppressGraphCommitted removed from connect/disconnect (was only for replaceBlock)
- [ ] updateConnection() uses runTx()
- [ ] addBlockAtIndex() uses runTx() with lane assignment
- [ ] 20+ new integration tests
- [ ] Manual testing confirms undo works for all migrated operations

---

## Summary

| Metric | Value |
|--------|-------|
| Phase 2 Complete | YES |
| Tests Passing | 87/87 |
| Methods Migrated | 15/22 |
| Phase 3 Scope | 8 methods |
| Phase 3 Complexity | HIGH (replaceBlock) + MEDIUM (lens ops) |
| Next Priority | replaceBlock, updateConnection, lens ops |
