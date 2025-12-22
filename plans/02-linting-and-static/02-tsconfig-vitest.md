## Stream 02-L2 — TypeScript Project Coverage & Type-only Imports

The new ESLint config failed because parserOptions (`project`) in `eslint.config.js` needs to see every TypeScript project. `vitest.config.ts` currently isn’t covered, and other files violate `consistent-type-imports`.

### What to fix
1. **Expand tsconfig inclusions**
   - `tsconfig.app.json` currently includes `src`, leaving out tooling files such as `vitest.config.ts`, `vite.config.ts`, `justfile?`. `tsconfig.node.json` may also miss these.
   - Add these files to the `include` arrays. For example:
     ```json
     "include": ["src", "vitest.config.ts", "vite.config.ts", "justfile.ts"]
     ```
   - Alternatively, create `tsconfig.tools.json` that lists those files and add it to `tsconfig.json` references along with `tsconfig.app.json` and `tsconfig.node.json`.
   - Update ESLint parserOptions `project` (in `eslint.config.js`) to reference every tsconfig (`tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.tools.json`) so `@typescript-eslint/parser` knows where to find those files.

2. **Adopt consistent type-only imports**
   - Files flagged by ESLint (e.g., `src/editor/PreviewPanel.tsx`, `stores/index.tsx`) should import purely type symbols via `import type { Player } from '../runtime/player'`.
   - Search for `import { Player }` or `import { SomeType }` that are only used in type annotations and replace them with `import type` to satisfy `@typescript-eslint/consistent-type-imports`.
   - When re-exporting such types, use `export type { Player } from '../runtime/player'`.

3. **Validation**
   - After updating the tsconfig includes and type-only imports, run `pnpm lint` (via `just lint`). The parser error for `vitest.config.ts` and the type-only import warnings should disappear.
   - This ensures ESLint type-checking sees every relevant file and keeps strict mode working.
