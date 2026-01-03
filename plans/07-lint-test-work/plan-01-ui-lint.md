## Plan 1 — UI & Store Lint Cleanup

1. **Scope**: Focus on UI components and stores under `src/editor/` that drove the bulk of the remaining `just lint` errors (Bus board/channel, Bus picker/dialog, Inspector, Modal helpers, Help/Trash windows, Settings toolbar, and the various store classes like `RootStore`, `ViewStateStore`, `UIStateStore`, `PatchStore`, `BusStore`).
2. **Step-by-step**
   - Run `just lint` locally and note the current count/issues tied to these files (search for the filenames in the ESLint output). Capture the output snippet for reference.
   - Open each file in turn; look for `@typescript-eslint` errors (strict boolean expressions, prefer-readonly-parameter-types, no-unsafe-*). For each, apply the same patterns we reviewed earlier (explicit `React.ReactElement` return types, guard `undefined`/`null` before property access, add `readonly` to parameters, prefer safe boolean checks).
   - Pay special attention to MobX store actions and observable fields; add missing return types, narrow `any`/`unknown`, and guard the `lane`/`block` lookups before accessing `.id` or `.blockIds`.
   - After editing each file, re-run `just lint` to confirm those file-specific errors vanish before moving to the next file. Record the before/after error counts.
   - Once all files in this batch pass lint, run `just test` to ensure their tests still pass; note any failing suites and pass results.
   - Document each fix inline with short comments (max 1 sentence) when reasoning might not be obvious. Keep the style consistent with existing code.
3. **Completion**
   - When the targeted errors disappear and `just test` succeeds, push the diff to a temporary branch and share the snippet with the team so they know this chunk is ready for review.

> Reminder for the engineer: follow the same name/filename patterns as the plan shows. Resist introducing new legacy helpers; focus on the clean standard we reviewed earlier.
