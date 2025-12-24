# Test Infrastructure Cache

**Cached**: 2025-12-23 05:13
**Source**: project-evaluator (comprehensive test analysis)
**Confidence**: HIGH

## Test Framework
- **Framework**: Vitest v4.0.16
- **Runner**: `just test` (wraps `pnpm test`)
- **TypeScript**: Pre-compilation required (tsc -b)
- **Execution time**: ~720ms for 642 tests

## Test Organization
```
src/editor/
  blocks/
    __tests__/             # Block definition tests
  compiler/
    __tests__/
      integration.test.ts  # Compiler pipeline tests
    blocks/
      domain/__tests__/    # TimeRoot compilation tests
      signal/__tests__/    # Signal block compilers
  diagnostics/__tests__/   # DiagnosticHub, ActionExecutor
  events/__tests__/        # Event system
  semantic/__tests__/      # Bus semantics, contracts
  stores/__tests__/        # MobX store tests
  compositor/__tests__/    # Rendering tests
```

## Coverage Statistics (as of 2025-12-23)
- **Total tests**: 642
- **Pass rate**: 93.1% (598 passing)
- **Failure rate**: 6.4% (41 failing)
- **Skipped**: 3 tests
- **Failed files**: 15 of 32 test files

## Test Reliability Assessment
**CRITICAL**: Per project maintainer guidance:
> "Use Chrome DevTools MCP to verify rather than running the tests. the tests are NOT a good indication that the code is working"

Tests are NOT considered authoritative for runtime behavior verification.

## Current Failure Patterns (2025-12-23)
1. **TimeRoot test expectations outdated** (51.2% of failures)
   - Implementation added `phase` output to FiniteTimeRoot
   - Implementation added `phase`, `pulse` outputs to InfiniteTimeRoot
   - Tests expect old output signatures

2. **Missing exports** (22.0% of failures)
   - Functions not exported from compiler modules
   - Test imports fail at runtime

3. **DiagnosticHub logic** (19.5% of failures)
   - Event subscription issues
   - Muting/filtering logic bugs
   - Cleanup not implemented

4. **Validation not implemented** (7.3% of failures)
   - Exactly-one-TimeRoot rule not enforced
   - Upstream dependency validation missing

## Test Quality Indicators
- **Unit tests**: High coverage, fast execution
- **Integration tests**: Limited (compiler integration exists)
- **E2E tests**: None detected
- **Runtime verification**: None (per maintainer, use browser DevTools)

## Test Commands
```bash
just test              # Full suite
just test-watch        # Watch mode
just check             # typecheck + lint + test
```

## Known Issues
- Tests can pass while runtime is broken (confirmed by maintainer)
- No mutation testing to verify test effectiveness
- Missing runtime behavior validation in CI
