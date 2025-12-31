## Plan 3 — Test Suite Hygiene

1. **Scope**: Fix any ESLint errors that remain in the test suites under `src/editor/__tests__`, `src/editor/compiler/__tests__`, `src/editor/diagnostics/__tests__`, and any additional test helpers (`helpers.ts`, `createTestContext`, etc.).
2. **Step-by-step**
   - Run `just test` locally to identify failing test files and capture their error output (TypeScript errors, linting complaints inside tests, missing mocks). Document the failing suites and the number of failing tests.
   - For each test file, address lint issues separately: prefer typed fixtures (`LensDefinition`, `BlockDefinition`), guard optional values before assertions (use `if (result.kind === 'Error')` before reading `message`), and keep operations deterministic (avoid `Math.random` or implicit `undefined` creation).
   - Use helper factories like `createSignalArtifact` and `createTestContext` consistently to avoid `any`. If a helper returns `unknown`, cast only after verifying the structure.
   - Re-run `just lint src/editor/__tests__` after each edit to ensure that new lint errors do not appear.
   - Once the test files are clean, run `just test` again to confirm the suites pass without errors. Capture the success output.
3. **Exit Criteria**
   - `just lint` and `just test` both pass (run them after the last edit). Document the final command outputs (pass/fail, error count) in your report.
   - List the files you modified and the specific lint rules those changes addressed (e.g., `prefer-readonly-parameter-types`, `strict-boolean-expressions`, `no-unsafe-call`).

> Reminder: keep each change minimal and focused—these are unit tests, so clarity beats cleverness. When in doubt, add a concise comment describing a non-obvious guard.
