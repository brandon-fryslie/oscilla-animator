# User Response: Field Runtime Red Flags Plan

**Date:** 2025-12-28
**Decision:** APPROVED

## Authoritative Plan Files

User directed to use existing plan files:
- `/plans/field-runtime-plan-v2.md` - Sprint plan with priorities
- `/plans/field-runtime-implementation-checklist.md` - Technical checklist

## Key Clarifications from User

1. **Params are REMOVED, not deprecated** - Any params code is dead and must be deleted
2. **No fallbacks** - Signal evaluation failure must throw hard error
3. **Compiler handles default sources** - Wire them into IR, no runtime fallback
4. **Order matters** - P1 (fix compiler) before P2 (remove params) to avoid churn

## Approved Priorities

| P | Item |
|---|------|
| P0 | Hard error on signal fallback |
| P0.5 | No silent default source fallback (compile error) |
| P1 | Compiler default source handling |
| P2 | Remove legacy params code |
| P3 | Update audit document |

## Next Action

Begin implementation per `/plans/field-runtime-implementation-checklist.md`
