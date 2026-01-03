# Event System Phase C - Current Status

**Generated**: 2025-12-20 (Phase C)
**Phase**: C (Connection events + PatchStore decoupling)
**Previous Phase**: B (Bus lifecycle events - COMPLETED)

---

## Phase B Completion Summary

Phase B successfully delivered bus lifecycle events and decoupled BusStore from UIStateStore:

### Completed in Phase B

1. **Bus Binding Events** (`src/editor/events/types.ts`)
   - Both include: bindingId, busId, blockId, port, direction ('publish' | 'subscribe')

2. **Bus Lifecycle Events** (`src/editor/events/types.ts`)
   - `BusCreatedEvent` - Emitted when new bus created (includes busId, name, busType)
   - `BusDeletedEvent` - Emitted before bus removed (includes busId, name)

3. **BusStore Decoupling** (`src/editor/stores/BusStore.ts`)
   - Line 147-153: `createBus()` emits `BusCreated` event
   - Direct mutation of `uiStore.selectedBusId` removed from `deleteBus()`

4. **Event Integration** (`src/editor/stores/RootStore.ts`)
   - Demonstrates event-driven UI coordination pattern

---

## Current Phase C Scope

Phase C focuses on **connection events** and **completing PatchStore decoupling from UIStateStore**.

### Remaining Cross-Store Coupling

**PatchStore → UIStateStore** (line 400-401 in PatchStore.ts):
```typescript
// Deselect if selected
if (this.root.uiStore.uiState.selectedBlockId === id) {
  this.root.uiStore.uiState.selectedBlockId = null;
}
```

**Impact**: This is the ONLY remaining direct cross-store mutation in the patch/bus domain stores.

---

## Connection Event Requirements

### Current Connection Handling

**PatchStore.connect()** (line 552-577):
- Creates connections between block ports
- Prevents duplicate connections
- Does NOT emit events (silent operation)
- Used by:
  - Macro expansion (line 274)
  - Block replacement (line 479)
  - Manual user connections

**PatchStore.disconnect()** (line 582-584):
- Removes connection by ID
- Does NOT emit events (silent operation)
- Simple filter operation

**PatchStore.removeConnection()** (line 586-588):
- Duplicate of disconnect() - should consolidate
- Also does not emit events

### Missing Events

From design doc (`design-docs/4-Event-System/1-Events.md`):
- **ConnectionAdded** - Not yet defined
- **ConnectionRemoved** - Not yet defined

### Use Cases

Connection events enable:
1. **Undo/Redo System**: Reconstruct patch topology changes
2. **Patch Diff Visualization**: Show what changed between versions
3. **Connection History**: Track how patch evolved
4. **Collaboration**: Sync connection changes across users (future)

---

## Implementation Analysis

### Connection Event Emission Points

1. **PatchStore.connect()** (line 576)
   - Emit AFTER connection added to `this.connections`
   - Include: connectionId, from {blockId, slotId}, to {blockId, slotId}

2. **PatchStore.disconnect()** (line 583)
   - Emit AFTER connection removed
   - Include same data as ConnectionAdded

3. **Macro Expansion** (line 270-276)
   - Currently creates multiple connections via `connect()` in a loop
   - Each `connect()` call should emit individual event
   - Expected: N ConnectionAdded events for N connections in macro

4. **Block Replacement** (line 474-480)
   - Currently recreates preserved connections
   - Each `connect()` call should emit event
   - Automatically handled if events added to `connect()`

### Selection Clearing Migration

**Current Implementation** (PatchStore.ts line 400-402):
- Direct mutation in `removeBlock()` after state changes
- Occurs BEFORE `BlockRemoved` event emission (line 405-409)
- Tightly couples PatchStore to UIStateStore

**Target Implementation**:
- Remove lines 400-402 from PatchStore


---

## Event System Maturity

### Events Implemented (11 total)
1. MacroExpanded ✓
2. PatchLoaded ✓
3. PatchCleared ✓
4. CompileSucceeded ✓
5. CompileFailed ✓
6. BlockAdded ✓
7. BlockRemoved ✓
8. BindingAdded ✓ (Phase B)
9. BindingRemoved ✓ (Phase B)
10. BusCreated ✓ (Phase B)
11. BusDeleted ✓ (Phase B)

### Events Still Missing from Design Doc
- ConnectionAdded (Phase C deliverable)
- ConnectionRemoved (Phase C deliverable)
- BlockParamsUpdated (Phase D)
- TimeRootChanged (Phase E)
- PlaybackStarted (Phase F)
- PlaybackStopped (Phase F)
- DiagnosticAdded (Phase G)
- DiagnosticCleared (Phase G)

### Cross-Store Coupling Status

**Eliminated**:
- BusStore → UIStateStore (removed in Phase B) ✓
- BusStore selection clearing (now event-driven) ✓

**Remaining**:
- PatchStore → UIStateStore (line 400-401) - Phase C deliverable
- UIStateStore → PatchStore (layout switching) - Low priority, different pattern
- Multiple stores → LogStore (direct logging) - Phase H (logging events)

---

## Test Coverage

### Existing Tests
- Event emission tests: Phase A events (MacroExpanded, BlockAdded, etc.)
- Bus event tests: Phase B events (BindingAdded, BusCreated, etc.)
- Integration tests: Event-driven selection clearing for buses

### Tests Needed for Phase C
1. Unit: `connect()` emits `ConnectionAdded` with correct payload
2. Unit: `disconnect()` emits `ConnectionRemoved` with correct payload
3. Unit: Macro expansion emits N `ConnectionAdded` events
4. Integration: Removing selected block clears `uiStore.selectedBlockId`
5. Integration: Removing non-selected block preserves selection

---

## Technical Constraints

1. **Event Synchronicity**: All events must remain synchronous (design requirement)
2. **Post-Commit Emission**: Events emitted AFTER state changes
3. **Non-Blocking Handlers**: Event handlers cannot affect control flow
4. **No Reentrancy**: Events cannot trigger state mutations in domain stores
5. **Connection Deduplication**: `connect()` already checks for duplicates - event should only emit if connection actually created

---

## Known Edge Cases

### Connection Events

1. **Duplicate Connection Attempts**: `connect()` returns early if connection exists (line 566)
   - Event should NOT be emitted for duplicate attempts
   - Only emit when connection actually created

2. **Macro Expansion Batching**: Macros can create 10+ connections
   - Each should emit individual event (design requirement)
   - Performance: Events are synchronous and cheap - batching not needed yet
   - Future: Could add batch flag to event payload if needed

3. **Block Removal Cascade**: Removing block removes all its connections (line 378-388)
   - Currently done via silent filter
   - Should emit `ConnectionRemoved` for each removed connection
   - Risk: Multiple events emitted - ensure handlers are idempotent

### Selection Clearing

1. **Event Order**: `BlockRemoved` currently emitted AFTER selection clearing
   - Need to verify handler runs correctly when order changes
   - Test: Selection clearing should work even if moved to event handler

2. **Race Conditions**: None expected (synchronous events)
   - All state changes and events occur in single MobX action
   - No async coordination needed

---

## Metrics

- **Total Events Defined**: 11 (after Phase B)
- **Emission Points**: 9 identified locations
- **Cross-Store Coupling Sites**: 1 remaining (PatchStore → UIStateStore)
- **Direct LogStore Calls**: ~10 (deferred to Phase H)

---

## Phase C Success Criteria

Phase C complete when:
1. `ConnectionAdded` and `ConnectionRemoved` events defined
2. `PatchStore.connect()` emits `ConnectionAdded` (with duplicate check)
3. `PatchStore.disconnect()` emits `ConnectionRemoved`
4. Block removal emits `ConnectionRemoved` for each cascade-deleted connection
5. Direct UIStore mutation removed from `PatchStore.removeBlock()`
6. `RootStore` subscribes to `BlockRemoved` and clears selection
7. All unit and integration tests pass
8. Zero direct cross-store mutations in PatchStore and BusStore

---

## Deferred to Future Phases

**Phase D**: BlockParamsUpdated event (param change tracking)
**Phase E**: TimeRootChanged event (runtime coordination)
**Phase F**: Playback events (telemetry)
**Phase G**: Diagnostic events (compiler integration)
**Phase H**: Logging events (complete LogStore decoupling)
