## Stream 04-R1 — Runtime Observability & Player Diagnostics

Once the compiler/tests and UI code compile under strict lint, this stream improves runtime visibility by wiring structured health snapshots from the player into the diagnostics pipeline.

### Diagnostic surfaces
1. `src/editor/runtime/player.ts:130-260` - player currently emits `RuntimeFrame` events without a detailed health payload.
2. `src/editor/diagnostics/DiagnosticHub.ts:1-220` - consumes `GraphCommitted` events but needs to ingest runtime health snapshots for diagnostics.
3. `src/editor/stores/DiagnosticStore.ts:1-210` - invalidates based on standard lifecycle events; should also respond to `RuntimeHealthSnapshot`.
4. `src/editor/runtime/renderTree.ts` / `src/editor/runtime/svgRenderer.ts` - not instrumented for per-frame diagnostics.

### Detailed plan
1. **Health snapshot emitter**
   - Extend `Player` to emit a typed `RuntimeHealthSnapshot` (define interface near `player.ts:130`), e.g.:
     ```ts
     interface RuntimeHealthSnapshot {
       timeMs: number
       phase: number
       isWrapped: boolean
       currentProgramId: string | null
       diagnostics: Diagnostic[]
       busValues: Record<string, number>
     }
     ```
   - Fire this snapshot on every frame or whenever key data (time or bus values) change. Capture bus combine states (phaseA/pulse) by reading sorted publishers/listeners from `BusStore`.
2. **DiagnosticHub ingestion**
   - Update `DiagnosticHub` to listen for the new event (`RuntimeHealthSnapshot`) and convert it into `Diagnostic` entries (e.g., `Diagnostics` array with `kind: 'runtime'`, `message` describing wrap events).
   - Include context such as `timeModel`, `busName`, `blockId` so downstream UI highlights relevant lanes.
3. **DiagnosticStore hooks**
   - Ensure `DiagnosticStore` subscribes to `RuntimeHealthSnapshot` events and invalidates caches (`invalidate()` or `set` calls) accordingly.
   - Add tests (`stores/__tests__/DiagnosticStore.test.ts` or create a new suite) that mock the snapshot event payload and assert `diagnosticStore.invalidate()` runs; verify the latest snapshot is stored and exposed to UI components.
4. **Render instrumentation**
   - In `renderTree.ts` and `svgRenderer.ts`, add safe hooks around expensive sinks (`try`/`catch` with diagnostic messaging) and emit metadata (e.g., `renderDurationMs`) that the player can include in the health snapshot.
   - Make the player aggregate these metrics per frame and include them in `RuntimeHealthSnapshot.diagnostics`.
5. **Documentation**
   - Update `design-docs/.../06-Runtime.md` describing the flow: player -> runtime snapshot -> DiagnosticHub -> DiagnosticStore -> Diagnostics UI, referencing the new `RuntimeHealthSnapshot` schema.
6. **Validation**
   - After wiring everything, run `just test` to ensure no type errors; then run `just dev`, verify the player emits the new event (check logs), and confirm diagnostics UI reflects runtime snapshots.

This stream ensures that once code is clean, we maintain long-term health by continuously monitoring runtime behavior.
