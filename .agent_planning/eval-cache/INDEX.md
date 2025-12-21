# Evaluation Cache Index

Reusable knowledge extracted from project evaluations. Use this to avoid re-discovering the same information.

**Last Updated**: 2025-12-21 16:30:00

---

## Cached Topics

| Topic | File | Cached | Source | Confidence |
|-------|------|--------|--------|------------|
| Replace Block Feature | replace-block-feature.md | 2025-12-21 14:35 | replace-block eval | HIGH |
| Time Architecture | time-architecture.md | 2025-12-21 12:31 | wp1-timeroot-compilers eval | HIGH |
| Layout Architecture | layout-architecture.md | 2025-12-21 12:31 | wp1-timeroot-compilers eval | HIGH |
| Bus Compiler Architecture | bus-compiler-architecture.md | 2025-12-21 13:35 | wp2-bus-aware-compiler eval | HIGH |
| Compiler Architecture | compiler-architecture.md | 2025-12-21 13:35 | phase4-default-sources eval | HIGH |
| Bus Semantics Module | bus-semantics.md | 2025-12-21 13:35 | project-evaluator | HIGH |
| Bus Initialization | findings-buses-init.md | 2025-12-20 21:14 | bus-semantics-module eval | MEDIUM |
| Runtime Macros | runtime-macros-expansion.md | 2025-12-20 21:14 | bus-semantics-module eval | MEDIUM |

---

## Usage Guidelines

**Confidence Levels**:
- **HIGH**: Just evaluated/implemented, highest trust
- **MEDIUM**: < 7 days old, no changes to files
- **LOW**: 7-30 days old, or dependencies changed
- **STALE**: > 30 days old, or files in scope changed

**When to Invalidate**:
1. Files mentioned in cache entry are modified
2. Related tests fail
3. Architecture decisions change
4. > 30 days since caching

**How to Use**:
1. Check INDEX.md for relevant topics
2. Read cached entry for quick context
3. Verify confidence level (STALE entries need re-validation)
4. Reference original source if deep dive needed