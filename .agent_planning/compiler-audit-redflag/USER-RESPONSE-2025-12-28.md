# User Response: Sprint 0 Plan

**Date:** 2025-12-28
**Decision:** APPROVED

## Plan Files Approved

- `.agent_planning/compiler-audit-redflag/PLAN-2025-12-28-165200.md`
- `.agent_planning/compiler-audit-redflag/DOD-2025-12-28-165200.md`

## Sprint Scope (Approved)

### Deliverable 1: Fix Block Registry Capability Propagation
- Fix `createBlock()` factory to auto-set capability from KERNEL_PRIMITIVES
- Unblock all 27 failing test files

### Deliverable 2: Make IR Compilation Mandatory
- Remove conditional IR emission / legacy fallback
- Make IR failures fatal errors (not warnings)

## Explicitly Deferred (User Acknowledged)

All other 34 red flag issues are out of scope for Sprint 0:
- TimeModel threading
- Pass 6 block lowering
- Bus evaluation steps
- Default source lowering
- Event bus lowering
- Type conversions
- Transform chains
- Block-specific fixes (ColorLFO, DebugDisplay, SVGSampleDomain)

## Next Action

Ready for implementation via `/lp:impl compiler-audit-redflag`
