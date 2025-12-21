# Evaluation Cache Index

This directory contains reusable evaluation knowledge to avoid re-discovering project patterns.

## Available Cache Files

| File | Scope | Confidence | Last Updated |
|------|-------|------------|--------------|
| `layout-architecture.md` | Lane system & layout state | FRESH | 2025-12-21 |
| `time-architecture.md` | Time authority & TimeRoot system | FRESH | 2025-12-21 12:30 |

## Usage Guidelines

**When evaluating:**
1. Check this INDEX first
2. Reuse FRESH/RECENT findings
3. Re-verify RISKY/STALE items
4. Update cache with new discoveries

**What to cache:**
- Test infrastructure and commands
- Project structure and architecture
- Common patterns and utilities
- Runtime behavior per scope/domain
- Break-it test patterns that work

**What NOT to cache:**
- Specific bug details (keep in WORK-EVALUATION files)
- Point-in-time verdicts (COMPLETE/INCOMPLETE)
- Test pass/fail counts (re-run to verify)
- Feature-specific findings (unless broadly reusable)

## Confidence Levels

- **FRESH**: Just discovered (same day)
- **RECENT**: Still valid (<1 week, no changes to related files)
- **RISKY**: Related code changed, needs spot-check
- **STALE**: Files in scope changed, full re-verification needed
