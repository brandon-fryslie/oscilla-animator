# Deliverable 3: Wire PatchStore to Kernel Transactions - Progress Report

**Date**: 2025-12-27
**Status**: IN PROGRESS (Foundation Complete, Integration Pending)
**Estimated Completion**: 40% of full deliverable

---

## What Was Completed

### 1. Kernel Integration Infrastructure (✓ DONE)

**Added to RootStore:**
- Created `PatchKernel` instance initialized with empty patch
- Kernel instantiated before stores to ensure availability
- Kernel reinitialized on `loadPatch()` and `clearPatch()`

**Files Modified:**
- `src/editor/stores/RootStore.ts`:
  - Added `kernel: PatchKernel` property
  - Added `syncFromKernel()` method for MobX state synchronization
  - Kernel initialized in constructor with proper settings

### 2. MobX-Kernel Sync Helper (✓ DONE)

**Created `syncFromKernel()` method:**
- Syncs blocks, connections, buses, publishers, listeners from kernel.doc to MobX observables
- Uses `runInAction()` to trigger MobX reactions
- Handles type casting from PatchDocument to full Patch (kernel stores full Patch internally)
- Documented that lanes and defaultSources remain outside kernel for now

### 3. Test Infrastructure (✓ DONE)

**Created test file:**
- `src/editor/stores/__tests__/PatchStore.kernel.test.ts`
- Tests for:
  - Transaction isolation
  - MobX reactivity after kernel commits
  - Kernel state sync
  - Undo/redo support
  - Complex cascade operations

**Note**: Tests currently expect integration that doesn't exist yet - they serve as acceptance criteria.

---

## What Remains (NOT DONE)

### 4. PatchStore Method Migration (✗ PENDING)

**Current State:**
- PatchStore still uses direct mutations (`this.blocks.push()`, `this.connections.push()`)
- No methods call `root.kernel.transaction()` yet
- MobX observables are not synced from kernel after mutations

**Required Work:**

#### A. Create Transaction Wrapper Helper in PatchStore
```typescript
private withTransaction<R>(
  label: string,
  build: (tx: TxBuilder) => R
): R | null {
  const result = this.root.kernel.transaction(
    {
      label,
      source: 'ui',
      timeMs: Date.now()
    },
    build
  );

  if (result.ok && result.committed) {
    // Sync MobX from kernel
    this.root.syncFromKernel();
    return result.value;
  }

  // Transaction failed
  console.error(`Transaction "${label}" failed:`, result.error);
  return null;
}
```

#### B. Migrate Core Methods (Estimated 2-3 days)

**Simple Mutations** (Start Here):
1. `updateBlockParams(blockId, params)` → use `tx.patchBlockParams()`
2. `setConnectionEnabled(connId, enabled)` → use connection update ops
3. `updateConnection(connId, updates)` → use connection update ops

**Medium Complexity**:
4. `connect(from, to)` → use `tx.addWire()` + auto-disconnect existing
5. `disconnect(connId)` → use `tx.removeWire()`
6. `addConnection(conn)` → use `tx.addWire()`
7. `removeConnection(id)` → use `tx.removeWire()`

**Complex Operations** (Needs Careful Design):
8. `addBlock(type, params)` → Check for macros, then `tx.addBlock()`
   - Side effects: auto-bus connections, default sources, lane placement
   - These remain in PatchStore orchestration layer
9. `removeBlock(id)` → Cascade delete connections/bindings, then `tx.removeBlock()`
10. `replaceBlock(oldId, newType)` → Multi-step transaction
11. `expandMacro(expansion)` → Complex multi-block transaction

**Current Challenge**: Many methods have side effects (lanes, default sources, auto-bus) that are NOT in the kernel. Need hybrid approach:
- Core graph mutations → kernel transactions
- Side effects → remain in PatchStore
- Orchestration → PatchStore calls kernel + manages side effects

#### C. Handle Event Emission (✗ Design Needed)

**Current**: PatchStore emits events directly (BlockAdded, WireAdded, GraphCommitted)

**Options**:
1. Emit events AFTER kernel transaction commits
2. Have kernel emit events (requires kernel awareness of event system)
3. Dual emit: kernel for state changes, PatchStore for UI coordination

**Recommended**: Keep events in PatchStore, emit after successful transaction commit.

#### D. Update Tests (✗ Pending)

Current tests expect:
- `root.patchStore.addBlock()` → syncs to kernel
- `root.kernel.undo()` + `root.syncFromKernel()` → reverts observables

Need to verify:
- All existing PatchStore tests still pass
- New kernel integration tests pass
- MobX reactions fire correctly

---

## Architectural Discoveries

### 1. Kernel vs PatchStore Responsibility Split

**Kernel Manages**:
- Blocks, connections, buses, publishers, listeners
- Transaction history and undo/redo
- Validation (via SemanticGraph)

**PatchStore Manages** (for now):
- Lanes (layout/view concern)
- Default sources (temporary until migrated to kernel)
- Auto-bus connection logic
- Macro expansion orchestration
- Event emission

**Implication**: PatchStore becomes an orchestration layer that uses kernel transactions for core graph mutations while managing higher-level concerns.

### 2. MobX Reactivity Pattern

**Pattern**:
```typescript
// In PatchStore action
withTransaction('add-block', (tx) => {
  const id = tx.addBlock({ type, params });
  // Kernel state updated
  return id;
});
// syncFromKernel() called by helper
// MobX reactions fire automatically
```

**Critical**: Must call `syncFromKernel()` after EVERY successful transaction to keep observables in sync.

### 3. Type System Mismatch

**Issue**: `PatchDocument` (minimal type) vs `Patch` (full type)
- Kernel exposes `doc` as `PatchDocument` (readonly, minimal fields)
- Kernel internally stores full `Patch`
- Safe to cast `kernel.doc as unknown as Patch` in `syncFromKernel()`

**Future**: Align types or add getter for full patch.

---

## Remaining Effort Estimate

| Task | Effort | Risk |
|------|--------|------|
| Transaction wrapper helper | 2-4 hours | Low |
| Migrate simple methods (3) | 4-6 hours | Low |
| Migrate medium methods (4) | 8-12 hours | Medium |
| Migrate complex methods (4) | 16-24 hours | High |
| Handle event emission | 4-8 hours | Medium |
| Update/fix tests | 8-12 hours | Medium |
| **Total** | **42-66 hours** | **5-8 days** |

**Note**: Original estimate was "Large (1-2 weeks)" - this aligns.

---

## Risks & Blockers

### Risk 1: Breaking Existing Functionality
**Mitigation**: Migrate one method at a time, run full test suite after each.

### Risk 2: MobX Reaction Loops
**Issue**: If syncFromKernel() triggers actions that trigger transactions...
**Mitigation**: Ensure `syncFromKernel()` is pure data sync, no actions.

### Risk 3: Event Timing Issues
**Issue**: Events emitted before/after state sync could cause race conditions
**Mitigation**: Establish clear order: transaction → syncFromKernel → emit events

### Risk 4: Performance
**Issue**: Copying entire patch state on every sync could be slow
**Mitigation**: Profile first, optimize later if needed (incremental sync)

---

## Next Steps (Recommended)

### Option A: Continue Full Integration (5-8 days)
1. Create transaction wrapper helper
2. Migrate simple methods first (updateBlockParams, etc.)
3. Test after each migration
4. Gradually migrate complex methods
5. Handle event emission
6. Full test pass + manual smoke test

### Option B: MVP Proof of Concept (1-2 days)
1. Migrate JUST `updateBlockParams()` to use kernel
2. Add one integration test that verifies the pattern works
3. Document the migration pattern for others
4. Leave remaining methods for future sprint

### Option C: Pause and Re-Plan
1. Commit foundation work (kernel + sync helper)
2. Create detailed migration plan for each method
3. Break into smaller sub-deliverables
4. Get stakeholder input on priority

---

## Files Changed

**Modified**:
- `src/editor/stores/RootStore.ts` (added kernel, syncFromKernel)

**Created**:
- `src/editor/stores/__tests__/PatchStore.kernel.test.ts` (test infrastructure)

**Not Yet Modified** (will need changes):
- `src/editor/stores/PatchStore.ts` (all mutation methods)
- `src/editor/stores/BusStore.ts` (if migrating bus methods)

---

## Conclusion

**Foundation is solid.** Kernel integration infrastructure is in place and tested (typecheck passes). The remaining work is methodical but time-consuming - migrating each PatchStore method to use transactions while preserving all existing behavior.

**Recommendation**: Proceed with Option B (MVP proof of concept) to validate the architecture works end-to-end, then plan the full migration as a follow-on deliverable.
