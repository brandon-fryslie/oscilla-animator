# Unified Edge Architecture Proposal

## Current State: Three Connection Types

```
Wire:       BlockA.output ──────────────> BlockB.input     (enforced 1:1)
```


## Proposed: Unified Edges with Combine-at-Input

```
Edge:       Source.port ────────────────> Sink.port
```

**Key change**: An input port can accept N edges. When N > 1, a combine mode is applied.

### What Changes

1. **Remove single-connection invariant**
   - Delete `disconnectInputPort` call in `connect()`
   - Allow multiple edges to same input

2. **Add combineMode to input ports**
   ```typescript
   interface Slot {
     id: string;
     type: string;
     combineMode?: CombineMode;  // NEW: sum, max, last, etc.
     // ... existing fields
   }
   ```

3. **Compiler generates combine logic**
   - When input has multiple edges, emit combine step
   - Same logic currently used for buses

4. **Buses become optional named waypoints**
   - A "Bus" is just a block with:
     - 1 output (combined value)
     - `combineMode` and `defaultValue` params
   - Or eliminated entirely (UI shows multi-edge inputs directly)

### Benefits

| Before | After |
|--------|-------|
| 3 connection types | 1 edge type |
| 2 stores (PatchStore + BusStore) | 1 store |
| 3 sets of operations | 1 set of operations |
| Probe Mode needs 3 handlers | Probe Mode needs 1 handler |
| Disconnect logic in 3 places | Disconnect logic in 1 place |

### What About Named Channels (Buses)?

**Key insight**: Buses have NO transform semantics. They are pure combine operations:
```
N inputs → combine(mode) → 1 output
```

This means buses are redundant if inputs can accept multiple edges with combine.

**Unified model**:
- Input ports have `combineMode` (default: 'last' for single edge, configurable for multi)
- Multiple edges to same input are combined at the input
- No separate Bus entity needed architecturally

**For named discovery (UI convenience)**:
- "Buses" become a UI abstraction: a saved query of "edges grouped by name"
- Or: add optional `channelName` to edges for grouping
- BusBoard becomes a view of edges grouped by channelName
- This is purely organizational, not architectural

### Migration Path

**Phase 1: Allow multi-edge inputs (behind feature flag)**
- Remove single-connection invariant (conditionally)
- Add combineMode to Slot interface
- Update compiler to handle multi-edge inputs
- Update runtime combine logic

**Phase 2: Add EdgeQueryService**
- Powers Probe Mode, disconnect operations
- Backward compatible with current stores

**Phase 3: Migrate buses to edge model**
- Convert Bus entities to BusCombiner blocks
- Deprecate BusStore

**Phase 4: Remove BusStore**
- Delete BusStore
- Update BusBoard to query BusCombiner blocks

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing patches | Migration script in Phase 3 |
| Performance of multi-edge combine | Already solved for buses, reuse |
| UI for editing combine modes | Inspector already has this for buses |
| Loss of bus discovery UX | BusCombiner blocks appear in block library |

### Effort Estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1 | Medium (1-2 weeks) | Low - behind flag |
| Phase 2 | Low (2-3 days) | Low - additive |
| Phase 3 | High (2-3 weeks) | Medium - migration |
| Phase 4 | Medium (1 week) | Low - cleanup |

**Total: ~6-8 weeks for full unification**

### Decision Point

Do we want:
- **Full unification** (Phases 1-4): 6-8 weeks, major simplification
- **Partial unification** (Phase 2 only): 2-3 days, query layer only
- **Status quo**: 0 effort, continue implementing 3x

### Recommendation

Start with Phase 1 + 2 behind a feature flag. This proves the concept with low risk. If it works well, proceed to Phases 3-4.

The key insight is that buses are architecturally just "combiner blocks with names." The broadcast semantics I mentioned earlier aren't fundamental - they're an implementation detail of how we chose to organize connections.
