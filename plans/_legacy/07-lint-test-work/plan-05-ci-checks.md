## Plan 5 — Config, Tooling, and Cross-Cutting Validation

1. **Scope**: Address lint/test gaps related to `tsconfig` coverage, shared helpers (`types/helpers.ts`, `useEditorDnd.ts`, `useEditorLayout.ts`), and the tooling pipeline (`tsconfig.node.json`, `vitest.config.ts`, `just` scripts). Ensure the overall project configuration supports `just lint`/`just test` without missing files.
2. **Step-by-step**
   - Inspect `tsconfig.app.json`, `tsconfig.node.json`, and `vitest.config.ts` to ensure they include every source/test file in `parserOptions.project` (add missing `include` entries or create dedicated configs if needed). Running `just lint` will surface parser errors (like the one mentioned earlier for `vitest.config.ts`); fix those by updating the referenced tsconfig or adjusting ESLint’s `parserOptions.project`.
   - Review shared helper modules (`helpers.ts`, `useEditorDnd.ts`, `useEditorLayout.ts`, bus helpers) for lint violations (e.g., missing readonly parameters, `strict-boolean-expressions`), and fix them. Each time you change a helper, rerun `just lint` to ensure no new errors appear elsewhere.
   - Validate that all `just` commands (`just lint`, `just test`, `just check`, `just dev`) run without prepping additional environment variables (document any required ones).
   - After every configuration change, regenerate the lockfiles or `tsconfig` caches if relevant (`just lint` will notice if not).
3. **Exit Criteria**
   - `just lint` and `just test` run cleanly with zero errors. `just dev` should start without fatal errors; if you can’t run it now, document what would be needed.
   - Provide a short summary of the configuration changes and any new includes or stricter rules you enabled.

> Note: this engineer is responsible for the “plumbing”—if a fix affects multiple files, update the plan doc with references to affected files and include the exact `just` command output (copy/paste from the terminal) in the final note.
