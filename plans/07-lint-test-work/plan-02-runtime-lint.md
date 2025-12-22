## Plan 2 — Runtime, Renderer, and Diagnostics Lint Fixes

1. **Scope**: Cover runtime code (`runtime/player.ts`, `runtime/renderTree.ts`, `runtime/svgRenderer.ts`), diagnostics modules (`diagnostics/ActionExecutor.ts`, `diagnostics/__tests__/*`), and related helpers in `editor/diagnostics` and `editor/runtime`.
2. **Step-by-step**
   - Start by running `just lint --filter runtime` (or rerun `just lint` and grep for the runtime files) to gather the specific errors (strict booleans, guard clauses, explicit return types, `no-unsafe-*`).
   - For each file, apply the same patterns: ensure `React` components return `React.ReactElement`, guard asynchronous operations (e.g., DOM refs) against `null`, handle events using `===` instead of truthiness when needed, declare explicit parameter types (with `readonly` when appropriate), and convert `any` to concrete types using helpers like `createTestContext`.
   - In `player.ts`, check that event emission always verifies listeners and that `Phase`/`Time` values are not coerced loosely. Add helper guards (e.g., `if (wrapped == null)` before using).
   - In render helpers and diagnostics code, ensure functions using MobX stores or `store` references do not read from possibly undefined arrays without checking lengths first.
   - After each file’s edits, run `just lint` to ensure those errors no longer appear before moving on.
   - Finally, run `just test` to ensure the diagnostics and runtime tests pass; log the command output (pass/fail and any new warnings).
3. **Exit Criteria**
   - `just lint` succeeds (zero errors for your files).  `just test` succeeds with no new failures.
   - Provide a short summary comment in the plan file (or a shared doc) detailing what files you changed and how many lint errors disappeared.

> Tip: copy the patterns from the earlier commits (e.g., safe null checks, direct use of `React.ReactElement`). Keep guard logic simple.
