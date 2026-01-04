## Stream 03-U2 — React Hooks & Async Sanity

This stream addresses `react-hooks/exhaustive-deps`, `require-await`, and `no-misused-promises` violations in UI components. The goal is to ensure hook-dependent logic is stable and async handlers behave predictably under strict linting.

### Evidence
- `BusCreationDialog.tsx:300-370` uses `useEffect` with missing dependencies (`getInitialDomain`, `store`).
- `HelpModal.tsx:230-244`, `Inspector.tsx:166-996`, `PathManagerModal.tsx:108-600`, `PreviewPanel.tsx:166-212`, and `Modal.tsx:102-150` contain hooks referencing values not listed in dependencies.
- `PathManagerModal` also passes async handlers to JSX attributes (onClick/onSubmit) without `await`, triggering `require-await`/`no-misused-promises`.

### Detailed tasks
1. **Hook dependencies**
   - For each flagged hook, explicitly include all referenced values: e.g., `useEffect(() => {...}, [store, getInitialDomain, autoConnect])`.
   - When dependencies are intended to stay static (e.g., `store.events`), either wrap them in a `useMemo`/`useCallback` before passing or add a comment with `// eslint-disable-next-line react-hooks/exhaustive-deps` explaining why.
   - For `Inspector.tsx`, the `useMemo` that computes compatible blocks should include `block`, `store.patchStore.blocks.length`, `adapterDefinitions`. If some dependencies change too often, move the heavy computations inside a stable callback.
2. **Async handler hygiene**
   - Identify every `async` function passed directly to JSX (e.g., `onClick={handleImport}`) and wrap it:
     ```ts
     const handleImportClick = () => {
       void handleImport().catch(reportError)
     }
     <button onClick={handleImportClick}>...</button>
     ```
   - For functions flagged by `require-await` (the linter says `async` function without `await`), either remove `async` or add the awaited call.
   - Provide a helper (e.g., `const runAsync = (fn: () => Promise<void>) => { void fn().catch(onError) }`) and apply to all event handlers to centralize error handling and satisfy `no-misused-promises`.
3. **Effect rework**
   - In `PreviewPanel.tsx`, ensure each `useEffect` includes `compilerService`, `height`, `width`, `logStore`, `store.events`, `store.patchStore.patchRevision`, `store.uiStore` as listed by lint. If some dependencies should remain static, move the effect content into a callback created via `useCallback`.
   - For `PathManagerModal.tsx`, `useEffect` that binds pointer events must list all referenced dependencies (pointers, rows, onClose) or wrap the effect body in `useEffect(() => {...}, [])` with no dependencies after ensuring it's safe.
4. **Testing & verification**
   - After updating hooks, run `just lint` to confirm there are no more hook/executive warnings. Document any helper functions used to suppress warnings so future contributors understand the trade-offs.

This ensures even under aggressive linting the hook logic stays correct and asynchronous UI interactions keep consistent behavior.
