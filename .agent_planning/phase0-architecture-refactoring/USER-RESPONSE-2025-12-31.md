# User Response: Phase 0 Architecture Refactoring Plans

**Date**: 2025-12-31
**Response**: APPROVED

---

## Approval Details

**User approved**: All 4 sprint plans

**Plans approved**:
1. `PLAN-2025-12-31-170000-sprint1-connections.md` - Unify Connections → Edge Type
2. `PLAN-2025-12-31-170000-sprint2-default-sources.md` - Unify Default Sources with Blocks
3. `PLAN-2025-12-31-170000-sprint3-v2-adapter.md` - V2 Adapter Implementation
4. `PLAN-2025-12-31-170000-sprint4-transforms.md` - Unify Lenses and Adapters

**Definitions of Done approved**:
1. `DOD-2025-12-31-170000-sprint1-connections.md`
2. `DOD-2025-12-31-170000-sprint2-default-sources.md`
3. `DOD-2025-12-31-170000-sprint3-v2-adapter.md`
4. `DOD-2025-12-31-170000-sprint4-transforms.md`

---

## Scope Confirmation

**Critical Path** (must complete):
- Sprint 1: Unify Connections → Edge Type (2-3 days)
- Sprint 2: Unify Default Sources with Blocks (2-3 days)
- Sprint 3: V2 Adapter Implementation (3-5 days)

**Optional** (user approved):
- Sprint 4: Unify Lenses and Adapters (2-3 days)

**Estimated Total**: 9-14 days

---

## Implementation Order

```
Sprint 1 (foundational)
    ↓
Sprint 2 (requires Edge type)
    ↓
Sprint 3 (requires simplified input resolution)
    ↓
Sprint 4 (optional cleanup)
```

---

## Completion Gate

After all sprints:
- [ ] All edges use unified Edge type
- [ ] All inputs connected via edges (no special default source handling)
- [ ] V2 adapter compiles legacy bridge blocks
- [ ] Golden patch compiles and runs with new structure

---

## Next Step

Execute `/do:impl phase0-architecture-refactoring` to begin Sprint 1.
