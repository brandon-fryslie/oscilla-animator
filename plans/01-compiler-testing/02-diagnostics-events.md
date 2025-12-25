## Stream 02 — Diagnostics, ActionExecutor, and Event Payloads (Detailed)

The diagnostics surface must align with the new `PortTargetRef`, event payloads, and bus binding behavior so the UI and runtime can trust consistent metadata.

### Key evidence
- `ActionExecutor` and tests (`src/editor/diagnostics/ActionExecutor.ts:1-220`, `__tests__/ActionExecutor.test.ts:20-400`) still assume lane IDs and `PortTargetRef` has `blockId/portId`, but the new type (see `src/editor/types.ts:248-259`) only exposes `kind`, `blockId`, `slotId`.
- `GraphCommitted` events emitted in `PatchStore.emitGraphCommitted` (`src/editor/stores/PatchStore.ts:137-214`) now require a `GraphDiffSummary`, yet tests still pass plain strings (see `events/__tests__/GraphCommitted.test.ts` plus `PatchStore.events.test.ts`, `RootStore.events.test.ts`).
- `DiagnosticsConsole.tsx:60-90` references `portId`/`blockId` that no longer exist, causing runtime errors when the event uses the new shape.

### Detailed steps
1. **ActionExecutor & tests**
   - Update `ActionExecutor` to consume the new `PortTargetRef` type: replace `target.blockId`/`target.portId` with `target.blockId`/`target.slotId` where appropriate; treat `target.kind` as the direction (`'input' | 'output'`).
   - Ensure the constructor signature `new ActionExecutor(patchStore, uiStore, viewStore, diagnosticHub)` is used everywhere. Tests should instantiate a real `RootStore` (per `src/editor/stores/RootStore.ts:30-80`) and pass its stores.
   - The helper `createStore()` inside the tests should use `store.patchStore.addBlock(type, params)` (no lane) and keep track of block IDs for later assertions.
2. **GraphCommitted payloads**
   - Rewrite every `emitGraphCommitted` invocation in tests to pass a typed `GraphDiffSummary`: e.g., `const changeSummary: GraphDiffSummary = { blocksAdded: 1, blocksRemoved: 0, bindingsChanged: 0, timeRootChanged: false, busesAdded: 0, busesRemoved: 0 };`
   - In `events/__tests__/GraphCommitted.test.ts`, expect the event’s `metadata` or `changeSummary` object rather than a string. Validate that `store.events.on('GraphCommitted', (payload) => {...})` receives the actual `GraphDiffSummary`.
   - Update helper functions used in `PatchStore.events.test.ts`/`RootStore.events.test.ts` to build `GraphDiffSummary` values and assert them (each location enumerated earlier).
3. **Diagnostics console**
   - In `DiagnosticsConsole.tsx` lines 60-90, compute labels with `const portTarget = diag.primaryTarget; const label = `${portTarget.blockId}:${portTarget.slotId}:${portTarget.kind}`;` using helper `portTargetToString` from `src/editor/semantic/types.ts:70-90`.
   - Remove references to `portId` or guard them via `if ('portId' in portTarget)` only when dealing with legacy payloads.
4. **Instrumentation coverage**
   - Trace how diagnostics events propagate: `DiagnosticHub` receives `GraphCommitted`/`RuntimeHealthSnapshot` events and emits `DiagnosticUpdate`. Confirm that `ActionExecutor` interacts with these typed payloads (resp. `DiagnosticHub` methods).
5. **Verification**
   - Run `just test` focusing on the diagnostics suites. Once they pass, you can rely on the new event metadata for later streams (BusStore, runtime).

This detailed roadmap ensures even a less experienced engineer can execute each change with precise file/line guidance while considering the runtime impact.
