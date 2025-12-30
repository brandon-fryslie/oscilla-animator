# Default Sources as Hidden Blocks — Checklist

Use this as the “do in order” sheet for `plans/PLAN-DEFAULT-SOURCES-HIDDEN-BLOCKS.md`.

---

## A) Add new authoring model
- [ ] Add `src/editor/defaultSources/types.ts` (`DefaultSourceAttachment`, block-only provider).
- [ ] Add `src/editor/defaultSources/constProviders.ts` (const-provider family + SlotType→Const mapping).
- [ ] Add `src/editor/defaultSources/allowlist.ts` (single allowlist; include const providers + Oscillator).
- [ ] Update `src/editor/types.ts` to add `Patch.defaultSourceAttachments`.

---

## B) Const provider blocks (required for “all defaults are blocks”)
- [ ] Add `DSConst*` editor block definitions (tagged hidden/internal).
- [ ] Add `DSConst*` compiler blocks (pass-through) and register them in `src/editor/compiler/blocks/index.ts`.
- [ ] Filter hidden/provider blocks out of `src/editor/BlockLibrary.tsx` (and any other block lists).

---

## C) Store + persistence
- [ ] Extend `src/editor/stores/DefaultSourceStore.ts` to store attachments by `(blockId, slotId)`.
- [ ] Switch input default source ids to deterministic ids (`ds:input:${blockId}:${slotId}`).
- [ ] Add deterministic provider ids (`dsprov:${blockId}:${slotId}`).
- [ ] Update `src/editor/stores/RootStore.ts` to save/load `defaultSourceAttachments`.
- [ ] Back-compat: if attachments missing, rebuild **Const** attachments from slot defaultSource metadata.

---

## D) Compiler injection
- [ ] Add `injectDefaultSourceProviders(store, patch)` in `src/editor/compiler/integration.ts`.
- [ ] Inject provider blocks + wires + bus listeners for undriven inputs.
- [ ] Extend `defaultSourceValues` map to include provider internal editable inputs.

---

## E) UI
- [ ] Update `DefaultSourcesSection` in `src/editor/Inspector.tsx`:
  - [ ] provider dropdown (`Constant` + allowlisted providers compatible with slot type)
  - [ ] block provider config UI (editable inputs + read-only bus-fed inputs)
  - [ ] driven inputs show read-only “overridden”

---

## F) Validation + diagnostics
- [ ] Add `src/editor/defaultSources/validate.ts` (allowlist/type/bus/cycle checks).
- [ ] Surface invalid providers as warnings/errors in diagnostics UI.

---

## G) Manual verification (no tests)
- [ ] `just dev`
- [ ] Constant default unchanged
- [ ] Oscillator default drives an unwired input visibly
- [ ] Wiring overrides provider; disconnect restores provider behavior
- [ ] Provider does not appear in PatchBay or BusInspector
