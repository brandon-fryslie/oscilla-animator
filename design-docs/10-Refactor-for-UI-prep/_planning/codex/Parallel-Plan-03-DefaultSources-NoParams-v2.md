# Parallel Plan 03 (v2): Default Sources + No-Params Migration

**Goal:** Replace parameters with Default Sources for every input, including Config inputs, and make defaults visible and editable.

## Parallel-Friendly Task Sequence
1. **Default Source Model**
   - [ ] Define `DefaultSourceState` and stable ids (`ds:<bindingId>:<lensIndex>:<paramKey>`) to uniquely address nested lens param defaults.
   - [ ] Decide store placement using current code as truth (new `DefaultSourceStore` vs integration into `RootStore`).
   - [ ] Document why the ID format is stable across binding/lens edits (no positional IDs).

2. **Inputs-Only Migration**
   - [ ] Audit block definitions and list param → input conversions (prioritize frequently used blocks).
   - [ ] Convert block params to inputs with default sources (per `14-RemoveParams.md`).
   - [ ] Update macros (`src/editor/macros.ts`) to use input defaults (no saved patch migration needed).
   - [ ] Introduce `Config` inputs for compile-time choices (enum/bool) and define hot-swap policy:
     - config changes trigger topology swap path
     - signal/field changes use live updates

3. **Compiler Resolution**
   - [ ] Add default source resolution for unbound inputs (wire → bus → default → error).
   - [ ] Validate defaults against TypeDesc and domain neutral values (domain-typed defaults, not raw numbers).

4. **UI Behavior**
   - [ ] Replace “Parameters” UI with “Inputs” sections (primary/secondary).
   - [ ] Separate "inputs-from-params" into a collapsible/secondary UI area to avoid block clutter.
   - [ ] Show Default Source values inline with a “Driven by …” chip when bound.
   - [ ] Plan lens-param UI separately (see Workstream 01) to ensure consistent Default Source controls.

5. **Tests + Docs**
   - [ ] Add tests for default source resolution and type validation.
   - [ ] Document the Default Source contract and UI semantics.

## Deliverables
- No separate parameter concept.
- Every input has a Default Source fallback.
- Config inputs follow safe hot-swap rules.
