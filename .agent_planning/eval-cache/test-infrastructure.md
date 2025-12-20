# Test Infrastructure - Oscilla Animator

**Confidence:** FRESH (2025-12-20)
**Scope:** Project-wide test setup and commands

## Test Commands Available

| Command | Purpose | Location |
|---------|---------|----------|
| `just test` | Run all unit tests (vitest) | Justfile |
| `just test-watch` | Tests in watch mode | Justfile |
| `just test-ui` | Tests with UI | Justfile |
| `just test-file <path>` | Run specific test file | Justfile |
| `just typecheck` | TypeScript type checking | Justfile |
| `just check` | Full check (typecheck + lint + test) | Justfile |

## Test Framework

- **Framework:** Vitest
- **Test Location:** `src/**/__tests__/*.test.ts`
- **Config:** Uses TypeScript, 3s transform time typical
- **Coverage:** 317 tests across 25 files (as of 2025-12-20)

## Test Organization

Tests are co-located with source in `__tests__/` subdirectories:
- `src/editor/__tests__/` - Core editor tests
- `src/editor/compiler/unified/__tests__/` - Compiler tests
- `src/editor/compiler/blocks/**/__tests__/` - Block-specific tests
- `src/editor/compositor/__tests__/` - Compositor tests

## Test Patterns

Common test patterns found in codebase:
- Unit tests for utility functions
- Integration tests for compiler blocks
- Composite expansion tests
- Domain pipeline tests
- Bus compilation tests

## No E2E Framework

No end-to-end testing framework detected. Manual browser testing required for:
- UI interactions
- Context menus
- Drag and drop
- Visual rendering
- Animation playback

## Running Tests

```bash
# All tests
just test

# Watch mode (for development)
just test-watch

# Single file
just test-file src/editor/__tests__/replace-block.test.ts

# Type checking before commit
just typecheck
```

## Test Output Format

Vitest shows:
- Test file name with pass/fail status
- Test count per file
- Total duration
- Color-coded results (green pass, red fail)
