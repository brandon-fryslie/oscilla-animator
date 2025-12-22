## Stream 02-L1 — ESLint Hardening Breakdown

`just lint` now reports ~867 errors (no-unsafe, strict booleans) and 470 warnings (hook deps, explicit return types). This plan breaks the work into discrete clusters; each cluster references the offending files and provides the architectural fix so even a junior engineer can follow it.

### Cluster A: `no-unsafe-*` and `no-explicit-any`
**Files**: `src/core/rand.ts:317`, `src/editor/BlockLibrary.tsx:166`, `Editor.tsx:561-997`, `stores/RootStore.ts:224`, `stores/UIStateStore.ts:188-198`, `diagnostics/__tests__/DiagnosticStore.test.ts:332-384`, `useEditorDnd.ts:23-73`, `PreviewPanel.tsx:166-212`.

- **Goal**: Replace unchecked `any` usage with concrete types (`BlockDefinition`, `LaneKind`, typed event payloads). 
- **Steps**:
  1. Identify each `any` usage flagged by ESLint and define a typed interface or helper (e.g., `type EditorActionPayload = { type: 'replace'; block: BlockDefinition }`).
  2. Transform functions returning `any` (e.g., `rand.ts` helper) to return typed arrays (e.g., `number[]`); include `ReadonlyArray` when appropriate.
  3. For stores returning loosely typed objects (RootStore event payloads, UIStateStore lane metadata), create new helper functions that enforce the desired structure before dispatching.
  4. Update tests to construct typed mocks (e.g., `DiagnosticStore.test` should instantiate a `RootStore` and access typed diagnostics instead of using `any`).
  5. After each file update, rerun `just lint` to verify the strict rules no longer flag those lines.

### Cluster B: `strict-boolean-expressions`
**Files**: `BlockContextMenu.tsx`, `Bus*` components (`BusBoard.tsx`, `BusChannel.tsx`, `BusCreationDialog.tsx`, `BusPicker.tsx`, `BusViz.tsx`, `PublishMenu.tsx`), `Inspector.tsx`, `RootStore.ts`, `ViewStateStore.ts`, `field-bus-compilation.test.ts`, `composite-library.test.ts`, `PathManagerModal.tsx`, `SettingsToolbar.tsx`.

- **Goal**: Replace truthy checks with explicit guards to avoid unintended null/undefined string logic.
- **Steps**:
  1. Review each condition flagged (e.g., `if (selectedBus)` in `BusBoard`). Replace with explicit checks like `if (selectedBus !== undefined && selectedBus !== null)`.
  2. For optional strings or booleans, compare to the empty value: `if (busName && busName !== '')` or `if (typeof flag === 'boolean' ? flag : false)`.
  3. Create helper utilities (`isValidLaneId`, `isNonEmptyString`) to centralize guard logic, especially for repeated cases in stores.
  4. Update tests that rely on `truthiness` to supply concrete values or guard before using them.

### Cluster C: React hook rules
**Files**: `BusCreationDialog.tsx`, `HelpModal.tsx`, `Inspector.tsx`, `PathManagerModal.tsx`, `PreviewPanel.tsx`, `Modal.tsx`, `SettingsToolbar.tsx`, `PathManagerModal.tsx`.

- **Goal**: Satisfy `react-hooks/exhaustive-deps`, `require-await`, and `no-misused-promises`.
- **Steps**:
  1. Audit every `useEffect`, `useMemo`, and `useCallback` flagged by ESLint. Ensure dependency arrays include all referenced values (e.g., `store`, `block`, `portRef`). If values cannot be added because they change each render, restructure by moving the hook inside a memoized callback.
  2. Annotate intentionally omitted dependencies with `// eslint-disable-next-line` comments and include rationale.
  3. For functions flagged by `require-await`, either remove the `async` keyword or add the awaited operation.
  4. Prevent `no-misused-promises` by wrapping async handlers passed to JSX props with `void` or synchronous wrappers.

### Cluster D: Module/export typing
**Files**: `src/App.tsx`, `BusViz.tsx`, `DragOverlayContent.tsx`, `HelpCenter.tsx`, `HelpModal.tsx`, `TrashZone.tsx`, `stores/index.tsx`, `useEditorLayout.ts`.

- **Goal**: Annotate exported functions/components with explicit return types.
- **Steps**:
  1. For each exported function/component, add a return type (`: JSX.Element` for React components, `: LayoutState` or `: void` for hooks).
  2. Ensure this typing is consistent across default and named exports so TypeScript and ESLint agree.

### Cluster E: Tests/fixtures
**Files**: `bus-compilation.test.ts`, `field-bus-compilation.test.ts`, `composite-library.test.ts`, `domain-pipeline.test.ts`, `PatchStore.events.test.ts`, `DiagnosticStore.test.ts`.

- **Goal**: Rebuild fixture helpers to expose typed patch structures and avoid strict boolean warnings.
- **Steps**:
  1. Introduce shared fixture builders (e.g., `createTestPatch(): CompilerPatch`) that provide typed `buses`, `publishers`, `listeners`, `defaultSources`.
  2. Replace ad-hoc `any` casting with typed helper functions (e.g., `createBlockDefinition` returning `BlockDefinition`).
  3. Update conditionals to check for `undefined`/`''` explicitly.

### Cluster F: Tooling configuration
**Files**: `vitest.config.ts`, `PreviewPanel.tsx` (type-only import warnings).

- **Goal**: Ensure ESLint parser can find tooling files; adopt type-only imports where appropriate.
- **Steps**:
  1. Include `vitest.config.ts`, `vite.config.ts`, and `node` tool files in `tsconfig.node.json` (and `tsconfig.app.json` if necessary).
  2. For flagged files, convert to `import type { Player } from '../runtime/player'`.

### Cluster G: Lint maintenance
1. After clusters A–F, run `just lint -- --fix` to automatically resolve trivial issues.
2. Keep the new ESLint config (with the critical path override) in place and re-run `just check` to ensure there are no regressions.

This plan now gives actionable, file-by-file instructions for fixing strict ESLint errors in order of severity, so the developer can work through the issues methodically without missing requirements.
