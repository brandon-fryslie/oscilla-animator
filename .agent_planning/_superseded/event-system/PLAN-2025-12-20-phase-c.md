# Event System Phase C - Implementation Plan

**Generated**: 2025-12-20
**Source**: STATUS-2025-12-20-phase-c.md
**Design Doc**: design-docs/4-Event-System/1-Events.md
**Phase**: C (Connection events + PatchStore decoupling)

---

## Executive Summary

Event System Phase B successfully delivered bus lifecycle events and decoupled BusStore from UIStateStore. Phase C completes the **connection event infrastructure** and **eliminates the last direct cross-store mutation** in PatchStore.

**Total Gap**: 2 missing event types, 1 cross-store coupling site, 3 event emission points

**Recommended Focus**: Deliver both P1 items in a single focused sprint (2-3 days complexity).

**Sprint Scope**: 2 deliverables - connection events + selection decoupling.

---

## Work Package Breakdown

### P1 (High): Connection Lifecycle Events

Connection events are foundational for undo/redo, patch diffing, and collaboration features.

---

#### P1-1: ConnectionAdded and ConnectionRemoved Events

**Status**: Not Started
**Effort**: Medium (3-5 days complexity)
**Dependencies**: None (reuses existing Connection type)
**Spec Reference**: design-docs/4-Event-System/1-Events.md (implied by patch lifecycle) • **STATUS Reference**: STATUS-2025-12-20-phase-c.md "Connection Event Requirements"

##### Description

Emit events when connections are created or removed between blocks. This provides complete observability of patch topology changes.

**Current State** (STATUS lines 23-37):
- `PatchStore.connect()` (line 552-577) creates connections silently
- `PatchStore.disconnect()` (line 582-584) removes connections silently
- `PatchStore.removeConnection()` (line 586-588) is a duplicate of disconnect()
- Macro expansion (line 274) creates multiple connections in a loop - no events
- Block replacement (line 479) recreates connections - no events
- Block removal (line 378-388) cascade-deletes connections - no events

**Target Architecture**:
- `PatchStore.connect()` emits `ConnectionAdded` AFTER connection created
- `PatchStore.disconnect()` emits `ConnectionRemoved` AFTER connection removed
- Event includes: connectionId, from {blockId, slotId}, to {blockId, slotId}
- Macro expansion automatically emits N events for N connections
- Block removal emits `ConnectionRemoved` for each cascade-deleted connection

**Implementation Steps**:

1. **Define Event Types** (`src/editor/events/types.ts`)
   ```typescript
   export interface ConnectionAddedEvent {
     type: 'ConnectionAdded';
     connectionId: string;
     from: { blockId: string; slotId: string };
     to: { blockId: string; slotId: string };
   }

   export interface ConnectionRemovedEvent {
     type: 'ConnectionRemoved';
     connectionId: string;
     from: { blockId: string; slotId: string };
     to: { blockId: string; slotId: string };
   }
   ```

2. **Emit from connect()** (`PatchStore.ts` line 576)
   ```typescript
   this.connections.push(connection);

   // Emit ConnectionAdded event AFTER connection created
   this.root.events.emit({
     type: 'ConnectionAdded',
     connectionId: connection.id,
     from: connection.from,
     to: connection.to,
   });
   ```

3. **Emit from disconnect()** (`PatchStore.ts` line 583)
   ```typescript
   // Get connection data BEFORE removal (for event)
   const connection = this.connections.find((c) => c.id === connectionId);
   if (!connection) return;

   this.connections = this.connections.filter((c) => c.id !== connectionId);

   // Emit ConnectionRemoved event AFTER removal
   this.root.events.emit({
     type: 'ConnectionRemoved',
     connectionId: connection.id,
     from: connection.from,
     to: connection.to,
   });
   ```

4. **Consolidate removeConnection()** (`PatchStore.ts` line 586-588)
   - Replace `removeConnection(id)` body with `this.disconnect(id)`
   - This ensures event emitted consistently
   - Or remove `removeConnection()` entirely and use `disconnect()` everywhere

5. **Emit on Block Removal Cascade** (`PatchStore.ts` line 378-388)
   ```typescript
   // Remove connections involving this block
   const removedConnections = this.connections.filter(
     (c) => c.from.blockId === id || c.to.blockId === id
   );

   for (const conn of removedConnections) {
     this.disconnect(conn.id);  // This will emit ConnectionRemoved
   }
   ```

##### Acceptance Criteria

- [ ] `ConnectionAddedEvent` type defined in `types.ts` with connectionId, from, to
- [ ] `ConnectionRemovedEvent` type defined in `types.ts` with connectionId, from, to
- [ ] Both events added to `EditorEvent` discriminated union
- [ ] `PatchStore.connect()` emits `ConnectionAdded` AFTER connection created (line 576)
- [ ] Event NOT emitted if duplicate connection detected (line 566 early return)
- [ ] `PatchStore.disconnect()` emits `ConnectionRemoved` AFTER removal (line 583)
- [ ] Event payload includes connection data (captured BEFORE removal)
- [ ] `removeConnection()` consolidated to call `disconnect()` (or removed entirely)
- [ ] Block removal cascade emits `ConnectionRemoved` for each deleted connection
- [ ] Macro expansion connections emit individual `ConnectionAdded` events (via connect())
- [ ] Block replacement connections emit events (via connect() - automatic)

##### Testing Requirements

**Unit Tests** (`src/editor/stores/__tests__/PatchStore.test.ts`):
- [ ] Test: `connect()` emits `ConnectionAdded` with correct payload
- [ ] Test: Duplicate connection attempt does NOT emit event
- [ ] Test: `disconnect()` emits `ConnectionRemoved` with correct payload
- [ ] Test: Disconnecting non-existent connection does not emit event
- [ ] Test: Block removal emits N `ConnectionRemoved` events for N connections

**Integration Tests**:
- [ ] Test: Macro expansion emits multiple `ConnectionAdded` events
- [ ] Test: Block replacement emits events for recreated connections
- [ ] Test: Event payloads match Connection type structure

##### Technical Notes

**Duplicate Detection** (line 559-566):
- `connect()` already checks for duplicate connections
- Early return if connection exists (line 566)
- Event should only be emitted AFTER line 576 (when connection actually created)
- No event on duplicate attempts - correct behavior

**Macro Expansion Performance**:
- Macros can create 10+ connections in rapid succession
- Each `connect()` call emits individual event (design requirement)
- Events are synchronous and cheap - no batching needed
- Future optimization: Add `batchContext` to event payload if needed

**Cascade Deletion**:
- Block removal currently uses silent filter (line 378-388)
- Must emit event for each removed connection
- Refactor to iterate and call `disconnect()` for each
- Alternative: Emit events manually in loop (less DRY)

**Connection Data Capture**:
- `disconnect()` must capture connection data BEFORE removal
- Event emitted AFTER removal (post-commit principle)
- Use `.find()` to get connection before `.filter()` removes it

---

### P1 (High): PatchStore Decoupling

Complete the decoupling of PatchStore from UIStateStore by removing the last direct mutation.

---

#### P1-2: Remove UIStore Mutation from PatchStore.removeBlock()

**Status**: Not Started
**Effort**: Small (1-2 days complexity)
**Dependencies**: None (reuses existing BlockRemoved event from Phase A)
**Spec Reference**: design-docs/4-Event-System/1-Events.md Phase B principles • **STATUS Reference**: STATUS-2025-12-20-phase-c.md "Selection Clearing Migration"

##### Description

`PatchStore.removeBlock()` currently directly clears `uiStore.selectedBlockId` if the removed block was selected. This is the LAST remaining direct cross-store mutation in the domain stores. Convert to event-driven architecture using the existing `BlockRemoved` event.

**Current Coupling** (PatchStore.ts line 400-402):
```typescript
// Deselect if selected
if (this.root.uiStore.uiState.selectedBlockId === id) {
  this.root.uiStore.uiState.selectedBlockId = null;
}
```

**Current Event** (PatchStore.ts line 405-409):
```typescript
// Emit BlockRemoved event AFTER state changes committed
this.root.events.emit({
  type: 'BlockRemoved',
  blockId: id,
  blockType,
});
```

**Target Architecture**:
- Remove lines 400-402 from `PatchStore.removeBlock()`
- Add `BlockRemoved` event listener in `RootStore.setupEventListeners()`
- Listener checks if removed block was selected and clears selection
- Pattern mirrors `BusDeleted` event listener (RootStore.ts line 70-75)

**Implementation Steps**:

1. **Remove Direct Mutation** (`PatchStore.ts` line 400-402)
   - Delete the if-statement that clears `uiStore.selectedBlockId`
   - Keep the `BlockRemoved` event emission (already correct)

2. **Add Event Listener** (`RootStore.ts` after line 75)
   ```typescript
   // BlockRemoved → Clear selection if removed block was selected
   this.events.on('BlockRemoved', (event) => {
     if (this.uiStore.uiState.selectedBlockId === event.blockId) {
       this.uiStore.uiState.selectedBlockId = null;
     }
   });
   ```

3. **Verify Zero Coupling**
   - Run grep: `grep -r "uiStore" src/editor/stores/PatchStore.ts`
   - Expected: Only type imports, no direct property access
   - Run grep: `grep -r "uiStore" src/editor/stores/BusStore.ts`
   - Expected: Zero matches (already clean from Phase B)

##### Acceptance Criteria

- [ ] Direct mutation of `uiStore.selectedBlockId` removed from `PatchStore.removeBlock()`
- [ ] Existing `BlockRemoved` event emission unchanged (no modifications needed)
- [ ] `RootStore.setupEventListeners()` adds `BlockRemoved` event listener
- [ ] Listener checks if `event.blockId === selectedBlockId` before clearing
- [ ] Zero imports/references to UIStateStore in PatchStore.ts (verified by grep)
- [ ] Pattern matches `BusDeleted` listener implementation (consistent style)

##### Testing Requirements

**Unit Tests** (`src/editor/stores/__tests__/RootStore.test.ts`):
- [ ] Test: `BlockRemoved` event listener registered in constructor
- [ ] Test: Listener clears selection when removed block was selected
- [ ] Test: Listener does NOT clear selection when different block removed

**Integration Tests**:
- [ ] Test: Removing selected block clears `uiStore.selectedBlockId`
- [ ] Test: Removing non-selected block preserves `uiStore.selectedBlockId`
- [ ] Test: Multiple block removals handle selection correctly
- [ ] Test: Block removal + selection clearing is atomic (single MobX action)

##### Technical Notes

**Event Order**:
- Current: Selection clearing happens BEFORE `BlockRemoved` event emission
- Target: Selection clearing happens IN RESPONSE to `BlockRemoved` event
- Risk: Low - events are synchronous, handler runs immediately after emission
- Benefit: Demonstrates event-driven pattern, enables future event replay

**Handler Idempotency**:
- If `selectedBlockId` is already null, setting to null is no-op
- Handler is naturally idempotent (safe to call multiple times)

**MobX Reactivity**:
- Event handler modifies observable (`uiStore.selectedBlockId`)
- Handler runs inside same MobX action as `removeBlock()`
- UI reactions fire after action completes (batched, efficient)

**Testing Strategy**:
- Unit tests verify handler logic in isolation
- Integration tests verify end-to-end behavior (remove block → selection clears)
- Use `toJS()` to snapshot state before/after for assertions

---

## Dependency Graph

```
P1-1 (ConnectionAdded/Removed) → No dependencies
P1-2 (Remove UIStore Mutation) → Depends on BlockRemoved event (Phase A ✓)
```

**Critical Path**: P1-1 and P1-2 can be implemented in parallel (no dependencies).

**Recommended Order**:
1. P1-1 first (connection events) - larger scope, foundational
2. P1-2 second (selection decoupling) - quick win, completes decoupling goal

---

## Recommended Sprint Planning

### Sprint 1: Connection Events + Selection Decoupling (P1-1 + P1-2)

**Scope**: Deliver both P1 items in a single sprint
**Outcome**: Connection topology fully observable, zero cross-store coupling in domain stores

**Work Items**:
1. Define `ConnectionAdded` and `ConnectionRemoved` event types
2. Emit `ConnectionAdded` from `PatchStore.connect()` (with duplicate check)
3. Emit `ConnectionRemoved` from `PatchStore.disconnect()` (with data capture)
4. Refactor block removal to emit events for cascade-deleted connections
5. Consolidate `removeConnection()` to use `disconnect()`
6. Remove direct UIStore mutation from `PatchStore.removeBlock()`
7. Add `BlockRemoved` event listener to `RootStore.setupEventListeners()`
8. Write unit tests for connection events (5 tests)
9. Write integration tests for selection clearing (3 tests)
10. Verify zero cross-store coupling with grep

**Acceptance**:
- All connection creations/deletions emit events
- PatchStore has zero UIStateStore imports/references
- All tests pass (`just test`)
- Type checking passes (`just typecheck`)

**Estimated Complexity**: Medium (3-5 days complexity, not time)
- Connection events: Medium complexity (multiple emission points, cascade handling)
- Selection decoupling: Small complexity (simple refactor, existing event)
- Testing: Medium complexity (unit + integration tests for both)

---

## Risk Assessment

### High-Risk Items

1. **Cascade Deletion Events**: Block removal must emit event for each deleted connection
   - **Mitigation**: Refactor to iterate and call `disconnect()` instead of silent filter
   - **Fallback**: Manually emit events in loop if `disconnect()` refactor too complex

2. **Event Order Sensitivity**: Selection clearing moved from direct mutation to event handler
   - **Mitigation**: Events are synchronous - handler runs immediately, no timing issues
   - **Testing**: Integration tests verify selection clearing still works

### Medium-Risk Items

1. **Connection Data Capture**: `disconnect()` must capture data BEFORE removal
   - **Mitigation**: Use `.find()` before `.filter()` to get connection
   - **Risk**: If connection not found, return early without emitting event (correct)

2. **Duplicate Event Emissions**: Multiple code paths create connections (macro, replacement, manual)
   - **Mitigation**: All paths use `connect()` helper - single emission point
   - **Testing**: Integration tests verify macro expansion emits N events

### Low-Risk Items

1. **Test Coverage**: Need to add new test files or extend existing
   - **Impact**: Low - existing test infrastructure works well
   - **Mitigation**: Follow Phase B test patterns (already proven)

---

## Success Criteria

**Phase C Complete When**:
- [ ] All P1 items delivered and tested
- [ ] `ConnectionAdded` and `ConnectionRemoved` events defined
- [ ] All connection creations emit `ConnectionAdded` (connect, macro, replacement)
- [ ] All connection deletions emit `ConnectionRemoved` (disconnect, cascade)
- [ ] Zero direct cross-store mutations in PatchStore and BusStore
- [ ] All unit and integration tests pass
- [ ] Type checking passes (`just typecheck`)
- [ ] Grep verification: No UIStateStore references in domain stores

**Long-term Success**:
- Connection events enable undo/redo implementation (future feature)
- Event system is complete for core patch operations (blocks, connections, buses)
- Domain stores fully decoupled from UI state (clean architecture)

---

## Deferred to Future Phases

**Phase D**: BlockParamsUpdated event (parameter change tracking)
**Phase E**: TimeRootChanged event (runtime coordination)
**Phase F**: Playback events (PlaybackStarted, PlaybackStopped)
**Phase G**: Diagnostic events (DiagnosticAdded, DiagnosticCleared)
**Phase H**: Logging events (complete LogStore decoupling)

These remain in the backlog for future sprints.

---

## Implementation Checklist

### Pre-Implementation
- [ ] Read STATUS-2025-12-20-phase-c.md completely
- [ ] Review existing event patterns (MacroExpanded, BusDeleted)
- [ ] Review Connection type definition (`src/editor/types.ts`)
- [ ] Identify all connection creation/deletion sites in codebase

### Implementation
- [ ] Define ConnectionAdded and ConnectionRemoved event types
- [ ] Add events to EditorEvent union
- [ ] Emit ConnectionAdded from connect() (after line 576)
- [ ] Add duplicate check bypass (no event on early return line 566)
- [ ] Emit ConnectionRemoved from disconnect() (after data capture)
- [ ] Refactor block removal cascade (line 378-388 to use disconnect())
- [ ] Consolidate removeConnection() to call disconnect()
- [ ] Remove UIStore mutation from PatchStore.removeBlock() (line 400-402)
- [ ] Add BlockRemoved listener to RootStore.setupEventListeners()
- [ ] Write unit tests for connection events (5 tests minimum)
- [ ] Write integration tests for selection clearing (3 tests minimum)

### Verification
- [ ] Run `just typecheck` - no errors
- [ ] Run `just test` - all tests pass
- [ ] Run `just lint` - no new warnings
- [ ] Grep verification: `grep -r "uiStore" src/editor/stores/PatchStore.ts` returns zero matches
- [ ] Grep verification: `grep -r "uiStore" src/editor/stores/BusStore.ts` returns zero matches
- [ ] Manual test: Create connection → event logged (if logging enabled)
- [ ] Manual test: Remove connection → event logged
- [ ] Manual test: Remove selected block → selection clears
- [ ] Manual test: Expand macro → multiple ConnectionAdded events

### Post-Implementation
- [ ] Update event documentation if needed
- [ ] Clean up any deprecated code (removeConnection if consolidated)
- [ ] Run full test suite one more time
- [ ] Ready for next phase (Phase D)
