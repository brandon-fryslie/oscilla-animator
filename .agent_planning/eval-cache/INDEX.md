# Evaluation Cache Index

| Topic | File | Cached | Source | Confidence |
|-------|------|--------|--------|------------|
| Lint Infrastructure | lint-infrastructure.md | 2025-12-25 17:48 | project-evaluator (lint-cleanup) | HIGH |
| Port Catalog Migration | port-catalog-migration.md | 2025-12-29 00:15 | project-evaluator (port-catalog-lowering) | HIGH |

## Cache Freshness Guidelines
- **FRESH**: < 1 hour - trust fully
- **RECENT**: < 24 hours - trust with light verification
- **STALE**: > 24 hours - use as hints only, re-validate critical findings
- **ANCIENT**: > 7 days - ignore

## What's Cached
- **lint-infrastructure.md**: ESLint config, two-tier rules (critical vs non-critical), auto-fixable rules
- **port-catalog-migration.md**: Port catalog structure, block lowering patterns, inputsById/outputsById migration phases, contract validation

## Not Yet Cached
- project-structure.md (directory layout, entry points)
- runtime-*.md (runtime behavior findings)
- test-infrastructure.md (INVALIDATED 2025-12-26 - signal-expr tests modified)
- fieldexpr-systems.md (INVALIDATED 2025-12-26 - Materializer modified, CompilerRuntime added)
- signal-expr-runtime.md (NEEDS EVAL - SignalExprBuilder + golden tests added 2025-12-26)
- runtime-integration.md (INVALIDATED 2025-12-26 - CompilerRuntime added, select/transform nodes added)
- compiler-integration.md (INVALIDATED 2025-12-26 - CompiledProgram type extended with SignalExpr IR)

## Removed in This Session
- architecture.md (INVALIDATED 2025-12-26 04:14 - Compiler pipeline modified: SignalExprTable extraction added to compileBusAware)
- compiler-architecture.md (INVALIDATED 2025-12-26 - Signal blocks migrated to IR lowering, P1-8 through P1-13 completed)
- bus-compiler-architecture.md (INVALIDATED 2025-12-26 - removed as stale)
- block-compiler-migration.md (INVALIDATED 2025-12-26 05:55 - Signal blocks 8-13 migrated to IR lowering)
- rendering-architecture.md (INVALIDATED 2025-12-26 11:25 - Player.setIRProgram added, IRRuntimeAdapter created, ScheduleExecutor rendering integration)
