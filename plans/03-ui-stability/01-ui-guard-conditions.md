## Stream 03-U1 — UI Guard Conditions & Truthiness Cleanup

Strict ESLint (`@typescript-eslint/strict-boolean-expressions`) flagged hundreds of conditions because the UI code relies on truthiness for nullable strings, objects, and booleans. This stream documents how to clean each class of condition with explicit guards, preventing future runtime surprises.

### Evidence & Target files
1. **Bus system components**
   - Files: `BusBoard.tsx`, `BusChannel.tsx`, `BusCreationDialog.tsx`, `BusPicker.tsx`, `PublishMenu.tsx`.
   - Examples: `if (selectedBus)` (bus boards), `if (form.busName)` (dialog), `if (busPickerOptions.length)` (picker).
2. **Inspector/editor flows**
   - Files: `Inspector.tsx`, `Editor.tsx`, `PathManagerModal.tsx`, `SettingsToolbar.tsx`, `BlockContextMenu.tsx`, `PreviewPanel.tsx`.
   - Examples: `if (portRef)` (even when `slotId` may be `''`), `if (block)` when block can be `null`.
3. **View + Root stores**
   - Files: `RootStore.ts`, `ViewStateStore.ts`.
   - Examples: `if (laneId)` or `if (patch.lanes)` when `id` may be `''` or undefined.
4. **Tests & fixtures**
   - Files: `composite-library.test.ts`, `bus-compilation.test.ts`, `field-bus-compilation.test.ts`.
   - Patterns: `if (value)` used in assertions when value is optional.

### Task breakdown
1. **Create guard helpers**
   - Implement utility functions (e.g., `function isValidString(value?: string): value is string { return typeof value === 'string' && value.length > 0; }`) in a shared `src/editor/utils/guards.ts`.
   - Use these helpers across components to replace bare truthy checks.
2. **Refactor bus components**
   - Replace `if (selectedBus)` with `if (selectedBus !== null && selectedBus !== undefined)`; check `busName` strings with `if (busName && busName.trim() !== '')`.
   - When deriving forms from `busFormState`, guard the object before destructuring: `const form = store.busFormState; if (!form) return null;`.
3. **Hard-code valid defaults**
   - For optional inputs (like lane IDs or bus names), provide defaults (`const laneId = lane?.id ?? ''`) so any downstream logic sees `''` rather than `undefined`.
4. **Update store loops**
   - In `RootStore.ts` and `ViewStateStore.ts`, guard loops with `if (!lanes.length) return;` and check each lane’s `id` with `isValidString`.
5. **Test fixtures**
   - Update test data builders to always provide defined values for strings/objects. When conditions rely on optional values, wrap them in `if (value != null && value !== '')` before use.
6. **Verification**
   - Re-run `just lint` after each file group to ensure the strict boolean warnings disappear.

### Why this matters
These guard updates also improve runtime stability—components no longer rely on implicit truthiness, reducing bugs when values like lane IDs or block refs are empty strings. Treat this as a health improvement you layer in parallel with the strict-mode work.
