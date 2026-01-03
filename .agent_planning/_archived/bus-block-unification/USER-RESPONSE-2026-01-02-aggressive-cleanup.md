# User Response: Aggressive Bus Architecture Cleanup

**Date**: 2026-01-02
**Response**: APPROVED (with clarifications)

## Approved Plan Files

- **Plan**: `.agent_planning/bus-block-unification/PLAN-2026-01-02-121323.md`
- **DoD**: `.agent_planning/bus-block-unification/DOD-2026-01-02-121323.md`

## User Clarifications (Critical)

### Q1: LensParamBinding 'wire' variant
**User Answer**: "Remove 'wire' too"

Lenses have no inputs. Remove BOTH `kind: 'bus'` AND `kind: 'wire'` variants.
Only keep `kind: 'default'` and `kind: 'literal'`.

### Q2: BusChannel.tsx
**User Answer**: "Delete"

It's bus-specific UI. Delete it entirely.

### Q3: Pass 6 capability
**User Answer**: "There is no such thing as 'bus block lowering'. Blocks are blocks and should all be lowered together."

Just delete Pass 7. There is no special lowering for bus blocks - they are blocks like any other.

### Q4: Error message for old patches
**User Answer**: "THERE ARE NO OLD PATCHES. Do nothing."

No error handling needed. Old patches don't exist.

## User Requirements (from earlier in conversation)

1. **All migration utilities must be REMOVED** - no keeping old format support
2. **No mention of 'buses' in compiler or IR** - delete all bus references from backend
3. **All bus types removed from backend** - bus is ONLY a UI/UX convenience
4. **Everything that treats buses differently removed** - no querying "bus blocks", buses are just blocks
5. **LensParamBinding REMOVED entirely** - there is no 'input' on a lens (remove bus AND wire)
6. **ALL bus-specific Debug/Diagnostics code DELETED** - user will add back later
7. **Fully implement any UI stubs** - EXCEPT bus-related ones which should be DELETED
8. **Modulation Table: DO NOT DELETE** - it should work Block to Block (including buses)

## Scope Approved

**P0 (6 items)**:
- Remove BusIndex from IR
- Delete Pass 7 entirely
- Delete bus-block-utils.ts
- Remove LensParamBinding 'bus' AND 'wire' variants (UPDATED)
- Delete all bus diagnostics
- Delete all migration utilities

**P1 (3 items)**:
- Remove bus references from compiler (53 files)
- Remove bus-specific store queries
- Implement UI stubs - DELETE bus-related ones (BusChannel.tsx)

**P2 (2 items)**:
- Verify Modulation Table works Block→Block
- Update test suite

**P3 (1 item)**:
- Documentation cleanup

## Implementation Authorization

Full implementation authorized for all deliverables in the approved plan with the clarifications above.
