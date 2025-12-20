# Definition of Done: Event System Phase C

**Generated**: 2025-12-20
**Plan**: PLAN-2025-12-20-phase-c.md
**Design Doc**: design-docs/4-Event-System/1-Events.md
**Phase**: C (Connection events + PatchStore decoupling)

---

## Sprint Scope

This sprint delivers **2 deliverables** from P1:
1. Connection Lifecycle Events (ConnectionAdded, ConnectionRemoved)
2. PatchStore Decoupling (Remove UIStore mutation from removeBlock)

**Deferred**: Param events (P3), playback events (P3), diagnostic events (future), logging events (future)

---

## Acceptance Criteria

### Deliverable 1: Connection Lifecycle Events

#### Event Type Definitions
- [ ] `ConnectionAddedEvent` type defined in `src/editor/events/types.ts`
  - Includes: `connectionId: string`, `from: { blockId, slotId }`, `to: { blockId, slotId }`
- [ ] `ConnectionRemovedEvent` type defined in `src/editor/events/types.ts`
  - Includes: `connectionId: string`, `from: { blockId, slotId }`, `to: { blockId, slotId }`
- [ ] Both events added to `EditorEvent` discriminated union
- [ ] Event types have TSDoc comments with "Emitted by:" and "When:" sections

#### Event Emission - connect()
- [ ] `PatchStore.connect()` emits `ConnectionAdded` AFTER connection pushed to array (line 576)
- [ ] Event includes connectionId, from, to (all data from Connection object)
- [ ] Event NOT emitted if duplicate connection detected (early return line 566)
- [ ] Event emitted AFTER state change committed (follows post-commit principle)

#### Event Emission - disconnect()
- [ ] `PatchStore.disconnect()` captures connection data BEFORE removal
- [ ] `disconnect()` emits `ConnectionRemoved` AFTER connection removed from array
- [ ] Event includes connectionId, from, to (captured before deletion)
- [ ] Event NOT emitted if connectionId not found (early return if not exists)

#### Event Emission - Cascade Deletion
- [ ] Block removal (line 378-388) emits `ConnectionRemoved` for each cascade-deleted connection
- [ ] Refactored to iterate and call `disconnect()` for each connection (not silent filter)
- [ ] OR manually emit events in loop if direct `disconnect()` call not feasible
- [ ] Number of events emitted equals number of connections removed

#### Code Consolidation
- [ ] `removeConnection(id)` method consolidated to call `disconnect(id)`
- [ ] OR `removeConnection()` removed entirely and all call sites use `disconnect()`
- [ ] Zero code duplication between disconnect/removeConnection

#### Automatic Coverage (via connect())
- [ ] Macro expansion connections (line 274) emit events automatically via `connect()`
- [ ] Block replacement connections (line 479) emit events automatically via `connect()`
- [ ] Manual user connections emit events automatically via `connect()`
- [ ] No additional emission code needed beyond `connect()` and `disconnect()`

---

### Deliverable 2: PatchStore Decoupling

#### Remove Direct Mutation
- [ ] Direct mutation of `uiStore.selectedBlockId` removed from `PatchStore.removeBlock()` (line 400-402)
- [ ] Lines 400-402 deleted entirely (if-statement and mutation)
- [ ] Existing `BlockRemoved` event emission unchanged (line 405-409 kept as-is)
- [ ] No other code changes in `PatchStore.removeBlock()` method

#### Add Event Listener
- [ ] `RootStore.setupEventListeners()` adds `BlockRemoved` event listener
- [ ] Listener checks if `event.blockId === uiStore.selectedBlockId`
- [ ] Listener sets `uiStore.selectedBlockId = null` if condition true
- [ ] Listener does nothing if condition false (no spurious mutations)
- [ ] Listener pattern matches `BusDeleted` listener (line 70-75) for consistency

#### Verify Zero Coupling
- [ ] Grep verification: `grep -r "uiStore" src/editor/stores/PatchStore.ts` returns zero matches (or only type imports)
- [ ] Grep verification: `grep -r "uiStore" src/editor/stores/BusStore.ts` returns zero matches
- [ ] No direct property access to UIStateStore from domain stores
- [ ] All UI coordination happens via events only

---

## Testing Requirements

### Unit Tests - Connection Events

**File**: `src/editor/stores/__tests__/PatchStore.test.ts`

- [ ] Test: `connect()` emits `ConnectionAdded` with correct connectionId, from, to
- [ ] Test: `connect()` with duplicate connection does NOT emit event
- [ ] Test: `disconnect()` emits `ConnectionRemoved` with correct connectionId, from, to
- [ ] Test: `disconnect()` with non-existent connectionId does NOT emit event
- [ ] Test: Block removal emits N `ConnectionRemoved` events for N cascade-deleted connections
- [ ] Test: Event payload structure matches Connection type

### Integration Tests - Connection Events

**File**: `src/editor/stores/__tests__/integration/events.test.ts` (or similar)

- [ ] Test: Macro expansion emits multiple `ConnectionAdded` events (one per connection)
- [ ] Test: Block replacement emits `ConnectionAdded` for recreated connections
- [ ] Test: Event payloads contain valid blockIds and slotIds
- [ ] Test: Connection event order matches connection creation order (deterministic)

### Unit Tests - Selection Decoupling

**File**: `src/editor/stores/__tests__/RootStore.test.ts`

- [ ] Test: `BlockRemoved` event listener registered in `setupEventListeners()`
- [ ] Test: Listener clears selection when removed block was selected
- [ ] Test: Listener does NOT clear selection when different block removed
- [ ] Test: Listener handles null selectedBlockId gracefully (no error)

### Integration Tests - Selection Decoupling

**File**: `src/editor/stores/__tests__/integration/selection.test.ts` (or similar)

- [ ] Test: Removing selected block clears `uiStore.selectedBlockId` (end-to-end)
- [ ] Test: Removing non-selected block preserves `uiStore.selectedBlockId`
- [ ] Test: Removing multiple blocks handles selection correctly
- [ ] Test: Selection clearing happens atomically with block removal (single MobX action)

---

## Code Quality Checks

### Event System Invariants
- [ ] All events emitted AFTER state changes committed (post-commit principle)
- [ ] Event handlers in `RootStore.setupEventListeners()` are non-blocking
- [ ] Event handlers do not mutate domain store state (only UI state allowed)
- [ ] Event payloads are plain data objects (no methods, no store references)
- [ ] Event payloads include all data needed to reconstruct operation (for undo/redo)

### Documentation
- [ ] New event types have TSDoc comments describing when/why they're emitted
- [ ] Event comments include "Emitted by:" listing all emission sites
- [ ] Event comments include "When:" describing trigger condition
- [ ] `EditorEvent` union type updated with new events (ConnectionAdded, ConnectionRemoved)

### Code Consistency
- [ ] Connection event emission pattern matches existing patterns (BlockAdded, BusCreated)
- [ ] Selection clearing listener pattern matches BusDeleted listener
- [ ] Event naming follows convention (PastTenseAction + Event suffix)
- [ ] Event type discriminants use string literals (not enums)

---

## Integration Checks

### Build and Type Safety
- [ ] `just typecheck` passes with no errors
- [ ] `just build` completes successfully
- [ ] No new TypeScript errors introduced
- [ ] No new linter warnings introduced (`just lint`)

### Test Suite
- [ ] `just test` passes all tests
- [ ] New unit tests added (minimum 9 tests: 6 connection, 3 selection)
- [ ] New integration tests added (minimum 4 tests: 2 connection, 2 selection)
- [ ] No regressions in existing event tests (Phase A, Phase B events still work)
- [ ] Test coverage for edge cases (duplicates, non-existent IDs, null selection)

### Manual Testing
- [ ] Create connection between blocks → `ConnectionAdded` event visible (if logging enabled)
- [ ] Remove connection → `ConnectionRemoved` event visible
- [ ] Expand macro → Multiple `ConnectionAdded` events logged (one per connection)
- [ ] Remove block with connections → Multiple `ConnectionRemoved` events for cascade
- [ ] Remove selected block → Selection clears in UI
- [ ] Remove non-selected block → Selection preserved in UI

---

## Definition of "Done"

This sprint is **DONE** when:

1. **All acceptance criteria checkboxes above are checked**
2. **All code quality checks pass**
3. **All integration checks pass**
4. **All tests pass** (`just test`)
5. **Type checking passes** (`just typecheck`)
6. **Grep verification passes** (zero UIStore refs in domain stores)
7. **Code reviewed** (self-review against design doc principles)
8. **Manual testing complete** (all scenarios tested in browser)

---

## Out of Scope (Deferred to Future Sprints)

The following are explicitly **NOT** included in this sprint:

### Phase D - Parameter Events
- BlockParamsUpdated event (parameter change tracking)

### Phase E - Runtime Events
- TimeRootChanged event (time system coordination)

### Phase F - Playback Events
- PlaybackStarted event (player started)
- PlaybackStopped event (player paused)

### Phase G - Diagnostic Events
- DiagnosticAdded event (compilation errors/warnings)
- DiagnosticCleared event (errors cleared)

### Phase H - Logging Events
- Conversion of LogStore calls to events
- Complete LogStore decoupling from domain stores

### Future - Selection Events
- BlockSelected event (optional, may be too fine-grained)
- BusSelected event (optional, may not be needed)

These remain in the backlog for future sprints.

---

## Success Metrics

**Events Implemented After Phase C**: 13 total
- Phase A: 7 events (Macro, Patch, Compile, Block lifecycle)
- Phase B: 4 events (Bus lifecycle, Binding lifecycle)
- Phase C: 2 events (Connection lifecycle)

**Cross-Store Coupling After Phase C**: 0 direct mutations
- PatchStore → UIStateStore: Eliminated ✓
- BusStore → UIStateStore: Eliminated (Phase B) ✓
- All coordination via events ✓

**Code Health**:
- Event coverage: 13 event types
- Event listeners: 3 (MacroExpanded, BusDeleted, BlockRemoved)
- Emission points: 11+ identified locations
- Test coverage: 20+ event-related tests

---

## Phase C Deliverables Summary

1. **Connection Events**: Complete observability of patch topology changes
2. **PatchStore Decoupling**: Zero cross-store coupling in domain stores
3. **Event-Driven Architecture**: All domain coordination via events
4. **Foundation for Undo/Redo**: Connection events enable state reconstruction
5. **Clean Architecture**: Domain stores have single responsibility (no UI concerns)

Phase C completes the core event infrastructure for patch operations (blocks, connections, buses).
