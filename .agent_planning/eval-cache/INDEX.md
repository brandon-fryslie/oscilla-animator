# Evaluation Cache Index

| Topic | File | Cached | Source | Confidence |
|-------|------|--------|--------|------------|
| Architecture | architecture.md | 2025-12-23 05:13 | project-evaluator + design docs | HIGH |
| Rendering Architecture | rendering-architecture.md | 2025-12-24 16:52 | project-evaluator (canvas-renderer eval v2) | HIGH |
| Lint Infrastructure | lint-infrastructure.md | 2025-12-25 17:48 | project-evaluator (lint-cleanup) | HIGH |
| FieldExpr Systems | fieldexpr-systems.md | 2025-12-25 22:55 | project-evaluator (fieldexpr-integration) | HIGH |

## Cache Freshness Guidelines
- **FRESH**: < 1 hour - trust fully
- **RECENT**: < 24 hours - trust with light verification
- **STALE**: > 24 hours - use as hints only, re-validate critical findings
- **ANCIENT**: > 7 days - ignore

## What's Cached
- **architecture.md**: Core patterns, TimeRoot spec violations, type system, stores, compiler pipeline
- **rendering-architecture.md**: RenderTree IR, Player loop, SvgRenderer, RenderInstances2D, Canvas extension points
- **lint-infrastructure.md**: ESLint config, two-tier rules (critical vs non-critical), auto-fixable rules
- **fieldexpr-systems.md**: FieldExpr evaluation runtime, ValueExpr/FieldExpr architecture, evaluation tests

## Not Yet Cached
- project-structure.md (directory layout, entry points)
- runtime-*.md (runtime behavior findings)
- compiler-patterns.md (INVALIDATED 2025-12-25 - compiler passes modified)
- test-infrastructure.md (INVALIDATED 2025-12-26 - signal-expr tests modified)
- signal-expr-runtime.md (NEEDS EVAL - SignalExprBuilder + golden tests added 2025-12-26)

## Recent Changes Requiring Re-evaluation
- 2025-12-26: SignalExpr runtime extended with SignalExprBuilder, golden test framework
  - New files: SignalExprBuilder.ts, goldenTests.test.ts, blockMigration.test.ts
  - New blocks: SubSignal.ts, DivSignal.ts
  - Modified: MigrationTracking.ts, runtime/signal-expr/index.ts
  - Impact: Any cached knowledge about signal block compilation or testing is stale
