# User Response: Bus-Block Unification Plan
**Date**: 2026-01-01
**Response**: APPROVED

## Approval Scope

**All 3 sprints approved:**
- Sprint 1: Foundation (BusBlock, conversion, edge migration)
- Sprint 2: Compiler Unification (Pass 7/8 simplification)
- Sprint 3: Cleanup & Store Unification (BusStore removal, type cleanup, UI)

## Approved Files

### Status
- `.agent_planning/bus-block-unification/STATUS-2026-01-01-bus-unification.md`

### Sprint 1
- `.agent_planning/bus-block-unification/PLAN-2026-01-01-sprint1.md`
- `.agent_planning/bus-block-unification/DOD-2026-01-01-sprint1.md`

### Sprint 2
- `.agent_planning/bus-block-unification/PLAN-2026-01-01-sprint2.md`
- `.agent_planning/bus-block-unification/DOD-2026-01-01-sprint2.md`

### Sprint 3
- `.agent_planning/bus-block-unification/PLAN-2026-01-01-sprint3.md`
- `.agent_planning/bus-block-unification/DOD-2026-01-01-sprint3.md`

## User Context

The user's original insight that prompted this plan:

> "Blocks themselves have inputs that accept multiple inputs and can have multiple outputs. This is accomplished via multiple wires, presumably. But fundamentally, buses do the same thing. Is it true that functionally, a bus could be represented as a bundle of wires? And a bundle of wires could be represented by a bus?"

> "What I'm wondering if there is some simplification possible in the architecture by implementing them the same way, but providing them as separate UX with different purposes to the user. We do have combine semantics on multiple outputs to a single block input, and we have explicitly made it identical to the bus combine semantics"

> "This is absolutely the direction I'm thinking. We could delete a bunch of code, make everything more consistent, and get a lot of behind the scenes functionality for 'free' by implementing it once rather than repeatedly. Additionally, the 'hidden virtual block' idea could be powerful and useful in other ways in the future, potentially"

## Next Steps

Begin implementation with Sprint 1:
1. Create BusBlock definition
2. Create Bus→BusBlock conversion utility
3. Create edge migration (Endpoint → PortRef)

Command: `/do:impl bus-block-unification`
