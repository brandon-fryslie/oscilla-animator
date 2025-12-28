# Parallel Plan 04 (v2): Layout as Projection

**Goal:** Remove layout from Patch semantics and drive layout from ViewState projections.

## Parallel-Friendly Task Sequence
1. **ViewState Foundations**
   - [ ] Introduce `ViewState` and `ViewLayout` models separate from `Patch`.
   - [ ] Decide store placement using current code as truth (new store vs `UIStateStore` integration).
   - [ ] Store multiple named layouts; select `activeViewId`.

2. **Semantic-Driven Layout**
   - [ ] Derive layout from SemanticGraph indices (portsByBlock, adjacency, render roots).
   - [ ] Implement stable, deterministic auto-layout (layered or grid-based; tie-break by stable ids).
   - [ ] Keep auto-layout minimal: goal is to prove the refactor, not a final UI.
   - [ ] Add caching/memoization for layout per graph version to protect performance.

3. **UI Changes**
   - [ ] Build a graph view that uses projection layout rather than lanes (significant UI work).
   - [ ] Represent bus relationships with flexible UI affordances (choose one initially, keep extensible):
     - Option A: port-attached chips with hover list of buses.
     - Option B: bus badges in a side panel with selection highlighting.
     - Option C: minimal bus glyphs on ports with drill-down in inspector.
   - [ ] Ensure implementation allows iteration between options without data model changes.

4. **Migration Path**
   - [ ] Keep lanes as-is; do not deprecate until new UI is more capable and user friendly.
   - [ ] Allow both lane view and projection view to read from the same canonical data.

5. **Docs + Tests**
   - [ ] Document layout separation in refactor docs.
   - [ ] Add snapshot tests for layout stability under minor edits.

## Deliverables
- Patch semantics no longer depend on layout.
- Multiple UI views can coexist over the same patch.
