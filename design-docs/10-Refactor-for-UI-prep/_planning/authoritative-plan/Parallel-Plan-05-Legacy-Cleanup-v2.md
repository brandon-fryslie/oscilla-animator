# Parallel Plan 05 (v2): Legacy Cleanup + Complexity Reduction

**Goal:** Remove deprecated APIs, placeholders, and lane-era artifacts after core systems are stable.

## Parallel-Friendly Task Sequence
1. **Inventory**
   - [ ] List deprecated exports and duplicate helpers (types, lens stubs, lane APIs).
   - [ ] Use `rg`-based scans + TypeScript references to categorize:
     - safe to remove
     - requires migration
     - requires audit
   - [ ] Confirm no saved patch migration is required (project unreleased; only macros to update).

2. **Removal Pass**
   - [ ] Remove deprecated exports in `src/editor/index.ts` once no references remain.
   - [ ] Delete placeholder lens files, `.bak` files, and dead tests.
   - [ ] Use a phased removal if needed (deprecate → warn → remove), otherwise a hard cut with clear changelog.

3. **Simplify APIs**
   - [ ] Remove legacy path-dependent helpers that bypass the semantic kernel.
   - [ ] Simplify stores to rely on the canonical graph + view state.
   - [ ] Review MobX implications (observable shape changes, migration of selectors).

4. **Docs + Tests**
   - [ ] Update docs to reflect the post-refactor surface.
   - [ ] Ensure tests cover only canonical systems.
   - [ ] Run a full usage scan to confirm no legacy API usage remains (automated + manual review).

## Deliverables
- Clean codebase with one canonical path per subsystem.
- Reduced surface area and fewer compatibility shims.
