# Evaluation Cache Index

| Topic | File | Cached | Source | Confidence |
|-------|------|--------|--------|------------|
| Test Infrastructure | test-infrastructure.md | 2025-12-23 05:13 | project-evaluator | HIGH |
| Architecture | architecture.md | 2025-12-23 05:13 | project-evaluator + design docs | HIGH |
| Rendering Architecture | rendering-architecture.md | 2025-12-24 16:52 | project-evaluator (canvas-renderer eval v2) | HIGH |

## Cache Freshness Guidelines
- **FRESH**: < 1 hour - trust fully
- **RECENT**: < 24 hours - trust with light verification
- **STALE**: > 24 hours - use as hints only, re-validate critical findings
- **ANCIENT**: > 7 days - ignore

## What's Cached
- **test-infrastructure.md**: Test framework, organization, failure patterns, reliability assessment
- **architecture.md**: Core patterns, TimeRoot spec violations, type system, stores, compiler pipeline
- **rendering-architecture.md**: RenderTree IR, Player loop, SvgRenderer, RenderInstances2D, Canvas extension points

## Not Yet Cached
- project-structure.md (directory layout, entry points)
- runtime-*.md (runtime behavior findings)
