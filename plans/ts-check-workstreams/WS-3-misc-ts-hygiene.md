# WS-3: Misc TS Hygiene (independent)

## Scope
Clear non-type-system TypeScript errors left over from refactors.

## Files & Tasks
- [ ] **Restore missing type import.**
  - `src/editor/Editor.tsx:377`
  - Add `import type { BlockDefinition } from './blocks';` (or `./blocks/types` if that’s the canonical export).

- [ ] **Remove stale export of `Lane`.**
  - `src/editor/index.ts:17` (export list)
  - Remove `Lane` from re-exports; it no longer exists in `src/editor/types.ts`.

- [ ] **Resolve unused parameters in ActionExecutor.**
  - `src/editor/diagnostics/ActionExecutor.ts:140`
  - Either remove `position` / `nearBlockId` or prefix with `_` and add a short comment if they are future placeholders.

## Notes
- This workstream has no dependencies and can be done in parallel with WS-1 / WS-2.
