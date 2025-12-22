## Stream 01 — Semantic & Compiler Fixtures (Detailed)

This stream ducts the compiler/test surface through the new step-wise architecture—every manual patch must be a fully formed `CompilerPatch`, tests must use the new `Listener`/`Publisher` metadata, and `compileBusAware`/`Oscillator` must see accurate `Artifact`/`ValueKind` values.

### Context
- `src/editor/semantic/types.ts:149-166` defines `PatchDocument` (requires `buses`, `publishers`, `listeners`).
- `src/editor/compiler/types.ts:299-312` extends `CompilerPatch` with `defaultSources`.
- Fixtures in `semantic/__tests__/validator.test.ts`, `graph.test.ts`, `bus-compilation.test.ts`, `field-bus-compilation.test.ts`, etc., currently omit these data or use legacy lens shapes.
- Browser-based `compileBusAware.ts` (any section around lines 750-980) and `Oscillator.ts` incorrectly treat artifacts because the fixtures mislabel the `Artifact.kind`.
- Diagnostics tests (`bus-diagnostics.test.ts`, `diagnostic-emission.test.ts`) are still expecting the old `CompileSucceeded` event payload (`src/editor/events/types.ts:80-120`).

### Detailed Steps
1. **Rebuild compiler fixtures**
   - For each manual patch literal (e.g., `field-bus-compilation.test.ts:130-460`, `semantic/__tests__/validator.test.ts` cases), add the required `buses`, `publishers`, `listeners`, and `defaultSources` sections.
   - Use actual default bus descriptors (from `src/editor/stores/BusStore.ts:50-110`) so `type.world`, `type.domain`, `combineMode`, `defaultValue`, and `sortKey` match runtime expectations.
   - Each listener/publisher should include `adapterChain` and `lensStack` (even empty arrays) so the compiler can iterate safely. When necessary, instantiate lens stacks with `createLensInstanceFromDefinition` (`src/editor/lenses/lensInstances.ts:1-34`), and add the corresponding default source entry (use `createLensParamDefaultSourceId`).
2. **Lens stack assertions & macros**
   - Wherever tests inspect a listener lens (`composite-library.test.ts:470-520`, `composite.expansion.test.ts:200-260`), replace `listener.lens` with `listener.lensStack?.[0]` and convert it via `lensInstanceToDefinition` before asserting on `type`/`params`.
   - If a macro previously assumed inline lenses, update `MACRO_REGISTRY` so the generated listeners include a `lensStack` entry—the expansion logic in `PatchStore.processAutoBusConnections` should still work if the lens stack is present.
3. **Type-safe compile helpers**
   - In `compileBusAware.ts:750-810`, narrow artifact kinds when casting to strings or numbers. Example: `if (artifact.kind === 'Scalar:string') { return artifact.value }`—don’t assume `artifact` is any.
   - In `Oscillator.ts:20-60`, destructure `const { kind } = output` and guard each branch (`if (kind === 'Signal:string') { ... }`). This avoids `never` and `ValueKind` mismatches when tests stub `artifact.kind`.
   - When serializing bus type descriptors (around the same lines), retrieve the `TypeDesc` object from the bus rather than using literal strings, so `tsc` can confirm the shape.
4. **Diagnostics event updates**
   - Update `bus-diagnostics.test.ts` and `diagnostic-emission.test.ts` to expect `CompileFinished` events and inspect `event.diagnostics` (using the diagnostic types from `src/editor/events/types.ts:83-114`).
   - Confirm they filter by error codes (e.g., `W_BUS_EMPTY`). Use `event.patchId`/`event.diagnostics` rather than the retired fields.
5. **Validation cycle**
   - After each fixture update, rerun `just test`. The fixtures should now compile without missing metadata. Once this stream is clean, Streams 2–5 can rely on valid patches and consistent bus data.

### Risks & Notes
- Forgetting a `defaultSources` object or misnaming a bus will lead to TypeScript errors when the compiler iterates the `lensStack`.
- Keep the bus descriptors in tests synchronized with `BusStore.createDefaultBuses()`; consider exporting a helper from `BusStore` for tests (e.g., `export const DEFAULT_BUSES = [...]`) so fixtures reuse the canonical shape.
- After this stream the compiler diagnostics should stop failing even with strict lint enabled; you can then focus on the application-level work without hitting these low-level errors.
