## Parallel Workflow & Validation Guide

### Organization
1. Work is already broken into explicit streams under `plans/01-compiler-testing`, `plans/02-linting-and-static`, `plans/03-ui-stability`, `plans/04-runtime-observability`, and `plans/05-typescript-hardening`. Each folder contains self-contained plans referencing the exact files/lines and the correct fixes, so multiple engineers can work in parallel without overlapping files.
2. Assign each person (or pair) a single folder/stream to own until the corresponding plan is complete, then regroup for integration.

### Validation Discipline
After every substantive change within a stream:
- Run `just test` to make sure TypeScript + Vitest pass for the touched modules. If a change affects test fixtures or compiler behavior, run the relevant subset (`just test -- <file>` or rerun the entire suite if multiple streams touch the compiler).
- Run `just lint` to validate the new ESLint rules, especially the strict ones introduced in `eslint.config.js`. If you modified UI components or hooks, give extra attention to `strict-boolean-expressions` and `react-hooks/exhaustive-deps`.
- Use `just check` before merging to verify `tsc`, ESLint, and Vitest succeed together.
Document each validation step (command + result) in the corresponding plan file or in your commit message so the next reviewer knows nothing was merged without being tested.

### Safety Notes
- Avoid quick hacks to keep lint happy—follow the architecture in each plan. The strict rules exist to enforce long-term health; every plan explains how to fix the underlying problem, not just silence the warning.
- Keep the filesystem clean: once your folder is done, notify the team so other streams that depend on it (e.g., runtime instrumentation relying on compiler stability) can proceed.

This guide sits alongside the stream plans to remind everyone to test/validate after each change, keeping the repo stable even with many contributors working in parallel.
