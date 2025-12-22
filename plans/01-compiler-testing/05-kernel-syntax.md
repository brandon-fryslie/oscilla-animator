## Stream 05 — Kernel Typings & Integration Helpers (Detailed)

Strict tooling flagged two classes of issues: the kernel modules rely on plain exports while `verbatimModuleSyntax` requires `import type` for pure types, and `editorToPatch` fails because it doesn’t populate the complete `CompilerPatch`.

### Evidence
- `src/editor/kernel/diff.ts`, `ops.ts`, and `PatchKernel.ts` import type-only symbols (`Op`, `DiffSummary`, `AdapterStep`, `PatchKernel`, etc.) but ESLint under `verbatimModuleSyntax` (enabled in `tsconfig.app.json`) errors unless these imports are `import type`.
- `editor/compiler/integration.ts` currently returns `{ blocks, connections }` while `CompilerPatch` requires `buses`, `publishers`, `listeners`, `defaultSources` (`src/editor/compiler/types.ts:299-312`). This mismatch prevents the compiler from using the runtime store data.

### Detailed Tasks
1. **Switch to type-only imports**
   - In `src/editor/kernel/diff.ts` and `PatchKernel.ts`, change `import { Op } from '../types'` to `import type { Op } from '../types'` (same for `DiffSummary`, `EntityDiff`, `TxMeta`, etc.). For `ops.ts`, ensure `AdapterStep`, `LensDefinition`, `BusCombineMode` are imported via `import type`.
   - Remove any of these imports that remain unused after the refactor; if you need the type later, keep the `type` import but ensure it's referenced in code (e.g., `type PublisherSpec`).
2. **Clean up exports**
   - If `ops.ts` or `PatchKernel.ts` expose helper functions that only consume these types, declare line-level type declarations inline (e.g., `type BindingPatch = { id: string; adapterChain?: AdapterStep[] }`), keeping the `type` import from `../types`.
3. **Populate canonical `CompilerPatch`**
   - Update `editorToPatch` (`src/editor/compiler/integration.ts:240-520`) to build and return:
     ```ts
     const patch: CompilerPatch = {
       blocks: mapBlocks(store.patchStore.blocks),
       connections: [...store.patchStore.connections],
       output: null,
       buses: store.busStore.buses.map((bus) => ({ ...bus })),
       publishers: store.busStore.publishers.map((pub) => ({ ...pub })),
       listeners: store.busStore.listeners.map((lis) => ({ ...lis })),
       defaultSources: Object.fromEntries(
         Array.from(store.defaultSourceStore.sources.entries()).map(([id, source]) => [id, { ...source }])
       ),
     }
     ```
   - Factor out helper functions (`mapBlocks`, `mapConnections`) to ensure each map clones objects and attaches canonical IDs.
4. **Document the bus contract**
   - Above `editorToPatch`, add comments referencing `design-docs/10-Refactor-for-UI-prep/03-Buses.md` explaining why the compiler must see `buses/publishers/listeners/defaultSources`.
5. **Validation**
   - After adjustments, run `just test` to ensure both the kernel modules and `editorToPatch` compile cleanly. This ensures the new strict lint rules can run while the compiler sees the runtime store structure.
6. **CI safety**
   - Consider adding a check in `just check` that ensures `editorToPatch` output matches the `CompilerPatch` contract (e.g., `expect(Object.keys(result.defaultSources).length).toBeGreaterThan(0)`).

Completing this stream removes tooling noise under `verbatimModuleSyntax` and guarantees the compiler can rely on store data going forward.
