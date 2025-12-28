# Cleanup Plan: Layout & Lanes

**Goal:** Remove semantic lane logic from the data model, treating layout as purely visual state.

## 1. Extract Lane State
- [ ] Create `ViewStateStore` (or `LayoutStore`).
- [ ] Move `lanes`, `collapsed`, `pinned` properties from `PatchStore` to this new store.
- [ ] Ensure `PatchDocument` (saved file) separates semantic data (`blocks`, `connections`) from view data (`layout`).

## 2. Decouple Block Logic from Lanes
- [ ] Audit `PatchStore.addBlock`. Remove logic that depends on "finding the lane" to decide block behavior.
- [ ] `BlockCategory` should be intrinsic to the block definition, not derived from the lane it was dropped into.

## 3. Deprecate Semantic Ordering
- [ ] Ensure the compiler *never* relies on the order of blocks in the `lanes` array.
- [ ] Compilation must be purely topological. If ordering matters (e.g. render layering), it must be explicit (z-index param or explicit connection order), not "lane order."

## 4. UI Cleanup
- [ ] Refactor `PatchBay` to render from `ViewStateStore`.
- [ ] Implement "Auto-Layout" as a function that updates `ViewState`, not `Patch`.

## 5. Verification
- [ ] Verify: Moving a block to a different lane does NOT trigger a recompile (unless it changes a semantic connection).
- [ ] Verify: Loading a patch preserves layout but the patch works even if layout data is missing.
