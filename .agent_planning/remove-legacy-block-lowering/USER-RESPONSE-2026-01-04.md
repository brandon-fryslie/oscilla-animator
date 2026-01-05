# User Response to Plan

**Date**: 2026-01-04
**Plan**: PLAN-2026-01-04-REVISED.md
**DOD**: DOD-2026-01-04-REVISED.md

---

## Status: APPROVED

User explicitly rejected the initial plan that deferred work and maintained backward compatibility.

User requirements:
1. **REMOVE all legacy fallback code from pass6-block-lowering.ts - PERIOD, no exceptions**
2. **ONE code path through the compiler pass** - no dual paths, no fallbacks
3. **Do NOT move code to other passes** - solve the actual problems
4. **Surface blockers IMMEDIATELY** - resolve unknowns and choose options that align to: legacy removed, one code path, invariant architecture
5. **NO backward compatibility** - remove fallbacks completely
6. **NO deferred work** - all work completes in this single plan

## Revised Plan Scope

The revised plan addresses user requirements by:

1. **Migrating all 22 blocks** to outputsById pattern (no deferrals)
2. **Creating 3 missing IR lowering functions** for blocks without any lowering
3. **Removing ALL 5 legacy code sections** (~180 lines) from pass6-block-lowering.ts
4. **Expanding VERIFIED_IR_BLOCKS** to include all 60 blocks (not just 12)
5. **Enabling strictIR by default** (no backward compatibility mode)
6. **Creating verification tests** that enforce no legacy code exists

## Files Covered in Approval

**Plan file**: `.agent_planning/remove-legacy-block-lowering/PLAN-2026-01-04-REVISED.md`
**DOD file**: `.agent_planning/remove-legacy-block-lowering/DOD-2026-01-04-REVISED.md`

## Work Items (All Required)

1. Migrate 22 blocks to outputsById pattern
2. Create IR lowering for 3 missing blocks (BroadcastSignalColor, DSConstSignalPhase, DSConstSignalTime)
3. Remove ALL legacy code sections from pass6-block-lowering.ts (~180 lines)
4. Update VERIFIED_IR_BLOCKS to include all 60 blocks and enable strictIR by default
5. Create verification test to prevent regression

## Success Criteria

Sprint succeeds when:
- Zero legacy code paths in pass6-block-lowering.ts
- ONE code path through the compiler pass
- All 60 blocks use IR lowering with outputsById
- strictIR=true by default
- All tests pass
- Verification test enforces no legacy code

## User Approval Granted

User approved complete legacy removal with no deferrals or backward compatibility.
