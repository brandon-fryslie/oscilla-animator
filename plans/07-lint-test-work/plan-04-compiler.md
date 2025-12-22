## Plan 4 — Compiler/Kernel & Helper Clean-up

1. **Scope**: Tackle lint/test errors in the compiler layer (`src/editor/compiler/*`, including `compile.ts`, `compileBusAware.ts`, `types-bus.ts`, block compilers in `blocks/domain`, `blocks/signal`, `blocks/rhythm`, and helper modules like `types/helpers.ts`, `autowire.ts`, `kernel/*`).
2. **Step-by-step**
   - Use `just lint src/editor/compiler` to list remaining issues (typed function signatures, guard clauses, readonly parameters). Record which files remain non-compliant.
   - For each block compiler file, recheck `Strict mode` issues: ensure functions return typed objects, guard optional parameters, and avoid `any`/`unknown` usages (introduce helper casting functions if needed).
   - Pay special attention to `autowire.ts` and `kernel` functions where connection graphs are manipulated; add safe early returns when data is missing, and make iteration variables readonly where feasible.
   - After editing each compiler file, re-run `just lint` to ensure the errors vanish, and rerun `just test` specifically for `compiler` suites (`just test src/editor/compiler`).
   - Update `tsconfig.node.json` or helper definitions if compiler type failures stem from configuration.
3. **Exit Criteria**
   - All compiler/kernel files in your scope satisfy `just lint` (zero errors). Compiler-specific tests (`ColorLFO`, bus diagnostics, diagnostic emission) pass when run individually and as part of `just test`.
   - Summarize your changes (per file, error types fixed) inside this plan doc before handing over to the next engineer.

> Notes for the engineer: keep TypeScript definitions tight; this layer must not leak `any`. If in doubt, add `// eslint-disable-next-line` only as a last resort and document why it’s needed.
