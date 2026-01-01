# Edge Unification Status (Cached Knowledge)

**Last Updated**: 2025-12-31 19:32
**Source**: project-evaluator (multi-input blocks evaluation)
**Confidence**: HIGH (fresh git analysis + plan review)

---

## Sprint 1 Progress: Unify Connections → Edge Type

**Goal**: Replace three connection types (Connection, Publisher, Listener) with unified Edge type.

**Status**: PART 1 COMPLETE (2 of 6 work items done)

**Git Commits**:
- cedbd90: "feat(compiler): Add unified Edge support to compilation pipeline (Sprint 1 part 1)"
- 006b3e7: "feat(types): Add unified Edge type and migration helpers"

---

## Work Items (from PLAN-2025-12-31-170000-sprint1-connections.md)

| Item | Status | Evidence |
|------|--------|----------|
| 1. Edge Type Definition & Migration Helpers | ✅ COMPLETE | `src/editor/types.ts:219-258` - Edge + Endpoint defined |
| 2. PatchStore to Use Edges | ✅ COMPLETE | Commit cedbd90 message indicates completion |
| 3. Pass 2 (Type Graph) for Unified Edges | ⏸ NOT STARTED | |
| 4. Pass 6 (Block Lowering) for Unified Input | ⏸ NOT STARTED | |
| 5. Pass 7 (Bus Lowering) for Unified Bus Handling | ⏸ NOT STARTED | |
| 6. Pass 8 (Link Resolution) for Unified Wiring | ⏸ NOT STARTED | |

**Estimated Remaining Effort**: 22-34 hours (3-4 days)

---

## Edge Type Definition

**File**: `src/editor/types.ts:219-258`

```typescript
// Endpoint discriminated union
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };

// Unified Edge type
export interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly lensStack?: LensInstance[];
  readonly adapterChain?: AdapterStep[];
  readonly enabled: boolean;
  readonly weight?: number;
  readonly sortKey?: number;
}
```

**Key Properties**:
- Replaces Connection (port→port), Publisher (port→bus), Listener (bus→port)
- Validation prevents invalid bus→bus edges
- Supports transforms (adapters + lenses)
- Maintains sorting/weighting for determinism

---

## Backward Compatibility

**Strategy**: Keep deprecated types during transition

- `Connection` (lines 647-665): Deprecated, maintained for compatibility
- `Publisher` (lines 272-296): Deprecated, maintained for compatibility
- `Listener` (lines 299-322): Deprecated, maintained for compatibility

**Migration helpers** (assumed implemented in Item 1):
- `connectionToEdge()`, `publisherToEdge()`, `listenerToEdge()`
- `edgeToConnection()`, `edgeToPublisher()`, `edgeToListener()`

---

## Single-Input Invariant (CURRENT ARCHITECTURE)

**Critical**: The codebase currently ENFORCES single-input constraint.

**Evidence**:

**PatchStore.ts:905-907**:
```typescript
// INVARIANT: An input can only have one source.
// Disconnect any existing wire or bus listener before connecting.
this.disconnectInputPort(toBlockId, toSlotId);
```

**BusStore.ts:346-348**:
```typescript
// INVARIANT: An input can only have one source.
// Disconnect any existing wire or bus listener before adding this listener.
this.root.patchStore.disconnectInputPort(blockId, slotId);
```

**Implication**: Multi-input blocks require INTENTIONAL removal of this invariant.

---

## Related Architecture Proposals

### Multi-Input Blocks (QUEUED)

**Document**: `.agent_planning/_queued/edge-unification/ARCHITECTURE-PROPOSAL.md`

**Key Insight** (lines 14-19):
> An input port can accept N edges. When N > 1, a combine mode is applied.

**4-Phase Plan**:
1. **Phase 1**: Allow multi-edge inputs (behind feature flag) - 4-6 days
2. **Phase 2**: EdgeQueryService (unified query) - 2-3 days
3. **Phase 3**: Migrate buses to edge model - 2-3 weeks
4. **Phase 4**: Remove BusStore - 1 week

**Total Effort**: 6-8 weeks for full unification

**Recommendation** (lines 129-132):
> Start with Phase 1 + 2 behind a feature flag. This proves the concept with low risk.

---

## Bus Combine Modes (EXISTING IMPLEMENTATION)

**Types** (`types.ts:113`):
```typescript
export type BusCombineMode = 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer';
```

**Implementation**: `pass7-bus-lowering.ts`, `busSemantics.ts`

**Key Properties**:
- Deterministic publisher sorting via `getSortedPublishers()` (sortKey, id)
- Combine logic for Signal and Field artifacts
- Handles empty buses with default values

**Reusability**: This logic can be extracted and reused for multi-input blocks.

---

## Compiler Integration Points

### Pass 2: Type Graph (NOT YET UPDATED)

**File**: `src/editor/compiler/passes/pass2-types.ts`

**Current**: Separate iterations for connections, publishers, listeners
**Required**: Single edge iteration loop

**Estimated Effort**: 4-6 hours

---

### Pass 6: Block Lowering (NOT YET UPDATED)

**File**: `src/editor/compiler/passes/pass6-block-lowering.ts`

**Current**: Resolves single input (wire > listener > default)
**Required**: Unified edge lookup

**Estimated Effort**: 8-12 hours

**Future (multi-input)**: Handle N edges to same input, apply combine mode

---

### Pass 7: Bus Lowering (NOT YET UPDATED)

**File**: `src/editor/compiler/passes/pass7-bus-lowering.ts`

**Current**: Filters publishers/listeners from separate arrays
**Required**: Filter edges by endpoint kind

**Estimated Effort**: 6-8 hours

**Combine Logic**: Can be extracted to `combine-utils.ts` for reuse in multi-input blocks

---

### Pass 8: Link Resolution (NOT YET UPDATED)

**File**: `src/editor/compiler/passes/pass8-link-resolution.ts`

**Current**: Separate connection/publisher/listener loops
**Required**: Single edge iteration

**Estimated Effort**: 4-6 hours

---

## Dependencies

**Blocks Sprint 1**:
- Sprint 2 (default source materialization) - needs Edge type
- Sprint 4 (transform unification) - uses transforms in Edge type

**Blocked By**: None (foundational sprint)

---

## Next Steps

### To Complete Sprint 1

1. ✅ Update Pass 2 for unified type checking
2. ✅ Update Pass 6 for unified input resolution
3. ✅ Update Pass 7 for unified bus handling
4. ✅ Update Pass 8 for unified fragment linking
5. ✅ All tests pass with Edge type
6. ✅ Golden patch compiles correctly

### After Sprint 1

**Option A: Sprint 2 (Default Sources)**
- Materialize default sources as IR constants
- Priority: Medium (unblocks parameter removal)

**Option B: Sprint 3 (Multi-Input Blocks)**
- Add combineMode to Slot interface
- Allow N edges to same input
- Extract combine logic for reuse
- Priority: High (major architectural simplification)

**Recommendation**: Sprint 3 (multi-input) has higher value - eliminates buses as architectural necessity.

---

## Risks

### MEDIUM: Serialization Migration

**Impact**: All saved patches need conversion
**Mitigation**:
- Keep old types as deprecated facades
- Version bump in serialization format
- Migration tests

### LOW: Compiler Pass Coordination

**Impact**: All passes must update together
**Mitigation**:
- Update passes sequentially (2 → 6 → 7 → 8)
- Run full test suite after each
- Feature flag for old/new implementation

### LOW: UI Component Dependencies

**Impact**: Canvas/Inspector may reference old types
**Mitigation**:
- Defer UI updates to follow-up
- Use computed getters for old interfaces

---

## Reuse Confidence

**HIGH** (trust fully):
- Git commit analysis
- Plan document review
- Type definition inspection
- Single-input invariant evidence

**MEDIUM** (verify before relying):
- Exact completion status of Item 2 (PatchStore)
- Whether tests pass with Edge type

**NEEDS VERIFICATION**:
- Actual runtime behavior with Edge type
- Performance impact of Edge type

---

## Related Cache Files

- `workstream-alignment.md` - Context on current work priorities
- This file caches Edge unification progress for future evaluations
