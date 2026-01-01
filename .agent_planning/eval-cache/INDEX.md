| Topic | File | Cached | Source | Confidence |
|-------|------|--------|--------|------------|
| Lint Infrastructure | lint-infrastructure.md | 2025-12-25 17:48 | project-evaluator (lint-cleanup) | RECENT |
| IR Primitives Status | ir-primitives-status.md | 2025-12-30 02:31 | project-evaluator (spec analysis) | RECENT |
| Type Contracts Divergence | type-contracts-divergence.md | 2025-12-31 01:45 | project-evaluator (type-contracts-ir-plumbing) | RECENT |
| Sprint 2 Default Sources Runtime | runtime-sprint2-defaults.md | 2026-01-01 01:29 | work-evaluator (sprint2-final) | FRESH |

## Cache Freshness Guidelines
- **FRESH**: < 1 hour - trust fully
- **RECENT**: < 24 hours - trust with light verification
- **STALE**: > 24 hours - use as hints only, re-validate critical findings
- **ANCIENT**: > 7 days - ignore

## What's Cached
- **lint-infrastructure.md**: ESLint config, two-tier rules (critical vs non-critical), auto-fixable rules
- **ir-primitives-status.md**: 74 IR gaps across 11 specs, 20-sprint roadmap, dependency analysis, risk assessment
- **type-contracts-divergence.md**: Editor vs IR TypeDesc incompatibility (world: config vs special, different fields, domain mismatches)
- **runtime-sprint2-defaults.md**: materializeDefaultSources() behavior, dual system architecture, test coverage, integration points

## Not Yet Cached
- project-structure.md (directory layout, entry points)
- runtime-*.md (other runtime behavior findings)
- test-infrastructure.md (INVALIDATED 2025-12-26 - signal-expr tests modified)
- fieldexpr-systems.md (INVALIDATED 2025-12-26 - Materializer modified, CompilerRuntime added)
- signal-expr-runtime.md (NEEDS EVAL - SignalExprBuilder + golden tests added 2025-12-26)
- runtime-integration.md (INVALIDATED 2025-12-26 - CompilerRuntime added, select/transform nodes added)
- compiler-integration.md (INVALIDATED 2025-12-26 - CompiledProgram type extended with SignalExpr IR)

## Removed in Previous Sessions
- architecture.md (INVALIDATED 2025-12-26 04:14 - Compiler pipeline modified)
- compiler-architecture.md (INVALIDATED 2025-12-26 - Signal blocks migrated to IR lowering)
- bus-compiler-architecture.md (INVALIDATED 2025-12-26 - removed as stale)
- block-compiler-migration.md (INVALIDATED 2025-12-26 05:55 - Signal blocks migrated)
- rendering-architecture.md (INVALIDATED 2025-12-26 11:25 - Player.setIRProgram added)
- port-catalog-migration.md (INVALIDATED 2025-12-29 04:03 - Port catalog implemented)
- debug-export-workstream.md (INVALIDATED 2025-12-30 04:00 - TraceController API extended)
- debug-ui-field-visualization.md (INVALIDATED 2025-12-30 05:05 - Field visualization components added)
- edge-unification-status.md (INVALIDATED 2025-12-31 20:11 - Pass 8 now uses unified edges)
- default-sources-current-state.md (INVALIDATED 2025-12-31 20:45 - materializeDefaultSources() integrated, dual system active)
- adapter-application-status.md (INVALIDATED 2025-12-31 21:50 - Pass 6 defaultSource fallback removed)
- pass8-link-resolution.md (INVALIDATED 2025-12-31 21:58 - defaultSource fallbacks removed, Pass 0 handles all defaults)
