# Sprint Plan: Bus-Block Unification - Compiler Unification
**Generated**: 2026-01-01
**Topic**: bus-block-unification
**Sprint**: 2 of 3
**Depends on**: Sprint 1 complete

## Sprint Goal

Unify compiler passes to treat BusBlocks like normal blocks, eliminating bus-specific code paths and dual-path execution.

---

## Scope

**In scope (this sprint):**
1. Pass 7 (Bus Lowering) → unified into block lowering
2. Pass 8 (Link Resolution) uses BusBlock ports
3. Compiler reads BusBlocks from blocks array (not buses array)

**Explicitly out of scope (future sprints):**
- BusStore removal (Sprint 3)
- Type definition cleanup (Sprint 3)
- UI component updates (Sprint 3)

---

## Work Items

### P0: Compiler BusBlock Recognition

Make compiler recognize BusBlocks as the source of bus behavior.

**Acceptance Criteria:**
- [ ] Compiler identifies BusBlocks via `block.type === 'BusBlock'` or `tags.bus`
- [ ] `getBusBlocks(patch): Block[]` utility function exists
- [ ] `getBusBlockById(patch, busId): Block | undefined` utility exists
- [ ] Compiler reads from `patch.blocks` not `patch.buses` for bus data
- [ ] BusBlock.params.combine used for combine semantics
- [ ] BusBlock.params.defaultValue used as fallback
- [ ] TypeScript compilation succeeds
- [ ] Unit tests verify bus block recognition (5+ tests)

**Technical Notes:**
```typescript
function getBusBlocks(patch: Patch): Block[] {
  return patch.blocks.filter(b => b.type === 'BusBlock' || b.tags?.bus);
}

function getBusById(patch: Patch, busId: string): Block | undefined {
  return patch.blocks.find(b =>
    b.type === 'BusBlock' && b.params.busId === busId
  );
}
```

**Files to modify:**
- NEW: `src/editor/compiler/bus-block-utils.ts`
- MODIFY: `src/editor/compiler/passes/pass7-bus-lowering.ts`

---

### P1: Pass 7 Simplification

Eliminate bus-specific lowering logic by treating BusBlocks as normal blocks.

**Acceptance Criteria:**
- [ ] `getPublishersFromEdges()` deleted or deprecated
- [ ] Pass 7 reads edges to BusBlock.in port (not Publisher entities)
- [ ] Pass 7 reads edges from BusBlock.out port (not Listener entities)
- [ ] BusBlock combine node created via standard `createCombineNode()`
- [ ] Publisher sorting via edge.weight/sortKey still works
- [ ] Multi-bus patches compile correctly
- [ ] All Pass 7 tests pass (updated for new model)
- [ ] No references to `patch.publishers` or `patch.listeners`

**Technical Notes:**

Before (current):
```typescript
// Pass 7 has special logic for publishers/listeners
const publishers = getPublishersFromEdges(patch, busId);
const listeners = patch.listeners.filter(l => l.busId === busId);
```

After (unified):
```typescript
// Pass 7 just looks at edges to/from BusBlock
const busBlock = getBusById(patch, busId);
const inputEdges = getEdgesToPort(patch, busBlock.id, 'in');
const outputEdges = getEdgesFromPort(patch, busBlock.id, 'out');
```

**Files to modify:**
- MODIFY: `src/editor/compiler/passes/pass7-bus-lowering.ts` (major refactor)
- DELETE: Lines 88-119 `getPublishersFromEdges()` function
- DELETE: Lines 164-177 dual publisher retrieval

---

### P2: Pass 8 Edge Unification

Simplify link resolution to use uniform port→port edges.

**Acceptance Criteria:**
- [ ] Pass 8 processes all edges uniformly (no edge-kind checks)
- [ ] No special handling for `Endpoint.kind === 'bus'`
- [ ] applyAdapterChain/applyLensStack work on BusBlock edges
- [ ] Fragment linking works for BusBlock ports
- [ ] All Pass 8 tests pass
- [ ] No references to Endpoint union in Pass 8

**Technical Notes:**

Before (current):
```typescript
if (edge.from.kind === 'bus') {
  // Special bus handling
} else {
  // Port handling
}
```

After (unified):
```typescript
// All edges are port→port, including BusBlock ports
const fromPort = getPort(patch, edge.from.blockId, edge.from.slotId);
const toPort = getPort(patch, edge.to.blockId, edge.to.slotId);
```

**Files to modify:**
- MODIFY: `src/editor/compiler/passes/pass8-link-resolution.ts`
- REMOVE: Edge-kind discrimination logic

---

## Dependencies

1. **Sprint 1 complete**: BusBlock definition and migration must work
2. **Patches migrated on load**: All patches have BusBlocks, no legacy buses

---

## Risks

### Risk 1: Pass 7 Refactor Complexity
**Description**: Pass 7 has significant bus-specific logic
**Mitigation**: Incremental refactor, keep tests passing at each step

### Risk 2: Edge Cases in Combine Semantics
**Description**: BusBlock combine might differ subtly from Bus combine
**Mitigation**: Both use same CombineMode and createCombineNode()

### Risk 3: Performance Regression
**Description**: Additional block in graph might slow compilation
**Mitigation**: BusBlocks are pass-through, minimal overhead

---

## Success Metrics

- [ ] Pass 7 reduced by ~100 lines
- [ ] Pass 8 reduced by ~50 lines
- [ ] No dual-path execution in compiler
- [ ] All compiler tests pass
- [ ] Golden patch compiles correctly
