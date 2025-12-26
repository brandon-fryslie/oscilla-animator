# Lint Infrastructure

Cached: 2025-12-25
Source: project-evaluator (lint-cleanup topic)
Confidence: HIGH

## ESLint Configuration

Located at: `/eslint.config.js`

### Two-tier Rule System

1. **Base rules** - Apply to all `**/*.{ts,tsx}` files
   - Standard recommended rules
   - Warnings for common issues

2. **Critical path rules** - Stricter enforcement for:
   ```javascript
   const criticalPathPatterns = [
     'src/editor/compiler/**',
     'src/editor/stores/**',
     'src/editor/runtime/**',
     'src/editor/lenses/**',
     'src/editor/kernel/**',
     'src/editor/diagnostics/**',
   ]
   ```

### Notable Configuration Choices

- `@typescript-eslint/ban-ts-comment: 'off'` - TS comments allowed
- `@typescript-eslint/no-empty-object-type: 'off'` - Empty types allowed
- `react-refresh/only-export-components: 'off'` - Flexible exports
- `functional/immutable-data: 'warn'` - With TODO to review (set as warning, not error)

### Key Differences Critical vs Non-Critical

| Rule | Non-Critical | Critical Path |
|------|--------------|---------------|
| `no-explicit-any` | warn | error |
| `no-floating-promises` | warn | error |
| `strict-boolean-expressions` | warn | error (strict mode) |
| `functional/immutable-data` | N/A | warn |

## Running Lint

```bash
just lint           # Run eslint
pnpm exec eslint .  # Direct invocation
pnpm exec eslint --fix .  # Auto-fix safe issues
```

## Known Auto-Fixable Rules

These rules support `--fix`:
- `@typescript-eslint/no-unnecessary-type-assertion`
- `@typescript-eslint/prefer-readonly`
- Some `@typescript-eslint/consistent-type-imports`

## Global Ignores

```javascript
globalIgnores(['dist', '.worktrees', '.worktrees_*', '.git', 'worktree'])
```
