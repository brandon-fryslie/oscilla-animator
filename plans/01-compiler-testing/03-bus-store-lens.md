## Stream 03 — BusStore & Lens Stack Architecture

TypeScript flagged mutable updates to `adapterChain`/`lensStack` and the persistence of legacy `listener.lens` usage. This stream reworks BusStore, PatchStore, modulation helpers, and tests so they operate on immutable lens stacks while preserving deterministic bus behavior.

### Code surfaces
- `src/editor/stores/BusStore.ts:214-470` currently mutates `publisher.adapterChain`, `publisher.lensStack`, `listener.lensStack`. The `Publisher`/`Listener` interfaces in `src/editor/types.ts:200-237` mark those arrays as `readonly`.
- `PatchStore.cloneBindings` (around `src/editor/stores/PatchStore.ts:640-690`) still references `listener.lens`.
- `ModulationTableStore.ts:450-520` manipulates lens chains by pushing/popping directly.
- Macro tests and UI code (e.g., `composite-library.test.ts:460-520`, `composite.expansion.test.ts:200-260`, `Diagnostics/Infra`) still assert the old `listener.lens` property.

### Actionable plan
1. **Immutable BusStore updates**
   - For every method that updates bindings (add/update/remove publisher/listener, reorder publisher, lens stack helpers), replace in-place mutation with new array/object creation:
     ```ts
     this.publishers = this.publishers.map(p => p.id === publisherId ? { ...p, sortKey: newSortKey } : p)
     ```
   - When adding/removing lenses, assign `listener.lensStack = [...(listener.lensStack ?? []), newLens]` instead of pushing. This respects the `readonly` contract while still altering the stack.
   - Document the immutability assumption in comments near the top of `BusStore`.
2. **PatchStore cloning**
   - When patching bindings (replacing a block, migrating buses), copy full binding objects:
     ```ts
     const newListener = {
       ...oldListener,
       lensStack: oldListener.lensStack ? [...oldListener.lensStack] : undefined,
     }
     ```
   - Remove any references to `listener.lens` by relying solely on `lensStack`.
3. **Modulation table & macros**
   - Update `ModulationTableStore.ts` to treat `lensChain` as immutable (use `[...lensChain, newLens]` when adding, `lensChain.filter` when removing). This avoids `readonly` violations and keeps the MobX pipeline stable.
   - Ensure macros (e.g., `MACRO_REGISTRY`) define `lensStack` arrays when a listener should apply a lens. Adjust tests to check `listener.lensStack` instead of `listener.lens`.
4. **Testing updates**
   - In `composite-library.test.ts` and `composite.expansion.test.ts`, inspect `listener.lensStack?.[0]` and convert via `lensInstanceToDefinition` before asserting `type`/`params`.
   - Update `BusStore.events.test.ts` to expect the new immutability behavior (e.g., event payloads still reference the same binding IDs but lens stacks are new arrays).
5. **Validation**
   - Run `just test` to ensure there are no TypeScript errors from `readonly` assignments. Confirm the `BusStore` unit tests (and macros) still pass, demonstrating the new approach is compatible with runtime behavior.

### Benefits
- Immutable binding objects make the store easier to reason about under strict lint/TypeScript.
- Tests and macros now rely on the canonical `Listener.lensStack`, aligning with the runtime architecture you want to stabilize.
