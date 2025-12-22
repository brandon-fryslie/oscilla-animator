## Stream 05-TS — Strict Mode Clean-up (Granular)

Turning on strict ESLint exposed dozens of architectural debt points. This stream breaks them into targeted sub-plans with explicit instructions for each code area to keep TypeScript and lint behavior healthy long-term.

### A. Replace `any`/unsafe returns (critical surfaces)
**Files**: `core/rand.ts:317`, `BlockLibrary.tsx:166`, `Editor.tsx:561-997`, `stores/RootStore.ts:224`, `stores/UIStateStore.ts:188-198`, `useEditorDnd.ts:23-73`, `diagnostics/ActionExecutor.ts`, `stores/__tests__/DiagnosticStore.test.ts:332-384`, `PreviewPanel.tsx:166-212`.

- Create typed interfaces for event payloads (e.g., `type EditorAction = { type: 'replace'; payload: BlockDefinition }`).
- Replace return types typed as `any` with concrete ones (`number[]`, `Block[]`); add `readonly` where mutation isn't needed.
- Use TypeScript generics for helper functions (e.g., `function lookupBlock<T extends Block>(blocks: T[], id: string): T | undefined`).
- Update tests to instantiate strongly typed mocks instead of `any`.

### B. Guard nullable values
**Files**: `BusCreationDialog.tsx`, `Inspector.tsx`, `RootStore.ts`, `ViewStateStore.ts`, `field-bus-compilation.test.ts`, `composite-library.test.ts`.

- Implement shared guard helpers (`isNonEmptyString`, `hasLaneId`) located in `src/editor/utils/guards.ts`.
- Replace `if (value)` with explicit checks (`if (value !== undefined && value !== null)` or `if (value !== '' && value !== undefined)`).
- Wherever the code previously relied on truthiness (filters, loops), add early returns when inputs are missing to satisfy `strict-boolean-expressions`.

### C. Typed fixtures & helpers
**Files**: `semantic/__tests__`, `compiler/__tests__/bus-compilation.test.ts`, `field-bus-compilation.test.ts`, `composite-library.test.ts`.

- Build reusable helper functions (`createTestPatch`, `createTestBus`) under `src/editor/__tests__/factories.ts`.
- Each helper returns a typed `CompilerPatch`, `PatchDocument`, `Bus`, etc., and ensures `buses/publishers/listeners/defaultSources` are present.
- Replace ad-hoc `as any` casts with calls to these helpers.

### D. Generic utilities & read-only wrappers
**Files**: `viewState`, `stores`, `inspector`.

- Define `type BlockParams<T extends Record<string, unknown>> = T;` and use it when creating blocks (`createBlock<T extends BlockDefinition>`).
- Wrap store state in `Readonly` where mutation should happen only via actions (`Readonly<Lane>`).
- Introduce mapped types for lane dictionaries to help TypeScript infer valid lane IDs.

### E. Event API hardening
**Files**: `RootStore.ts`, `PatchStore.ts`, `events/types.ts`, `DiagnosticHub.ts`.

- Formalize `GraphDiffSummary` (if not already) and export `createGraphDiff` helper so tests use a typed payload, eliminating string diffs.
- Ensure `DiagnosticHub` consumes typed runtime events (once Stream 04 is implemented) and avoids `any`.

### F. Tooling & tsconfig coverage
**Files**: `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.ts`?`.

- Include tooling files (`vitest.config.ts`, `vite.config.ts`, `justfile.ts?`) so `@typescript-eslint/parser` finds them.
- Consider `tsconfig.tools.json` referencing tooling-specific files and add it to `tsconfig.json` references.

### Deliverables & verification
1. A set of helper utilities and factory functions for typed patches (A–C).
2. Guard functions and readonly wrappers ensuring borderline truthy logic is explicit (B, D).
3. Clean event/store APIs that emit typed payloads (E).
4. Comprehensive lints verifying strict-mode compliance (run `just lint` → `just check` after each cluster).

This plan turns lint noise into structural improvements, ensuring the repository stays healthy long-term even under the strictest settings.
