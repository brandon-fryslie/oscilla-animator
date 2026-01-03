# Workstream Alignment Analysis (Cached Knowledge)

**Last Updated**: 2025-12-31 01:37
**Source**: project-evaluator (field-runtime workstream 3)
**Confidence**: HIGH (comprehensive git history + plan analysis)

---

## The Problem

Workstream 3 (Field Runtime) has **three different plans** with **conflicting goals** and **radically different completion states**.

---

## Plan Comparison

| Aspect | Original Plan | Red-Flag Plan | Hidden Providers Plan |
|--------|--------------|---------------|----------------------|
| **Document** | `03-field-runtime-primitives.md` | `field-runtime-plan-v2.md` | `PLAN-DEFAULT-SOURCES-HIDDEN-BLOCKS.md` |
| **Goal** | Field runtime primitives (IR nodes, evaluation) | Remove params, explicit errors | Allowlist-based provider blocks |
| **Completion** | 0% (none started) | 50% (P0/P0.5 done) | ~90% (18 sprints invested) |
| **Commits** | 0 | ~5 (Dec 28) | ~103 (Dec 28-31) |
| **Files Changed** | 0 | ~10 | ~381 TypeScript files |
| **Effort** | 15-20 sprints | 2-3 sprints | 18+ sprints (DONE) |

---

## Original Plan Status (0% Complete)

**From:** `plans/ir-compiler-backlog-streams/03-field-runtime-primitives.md`

**5 Deliverables:**
1. ❌ FieldExprMapIndexed + FieldExprZipSig IR nodes
2. ❌ Transform chain evaluation in Materializer
3. ❌ Field reduce support (reduceFieldToSig)
4. ❌ Non-numeric field combine (vec2/vec3/color)
5. ❌ Stable domain element IDs

**Evidence of NOT STARTED:**
- No files contain "FieldExprMapIndexed" or "FieldExprZipSig"
- `Materializer.ts:1145-1179` still throws placeholder error for transform chains
- `IRBuilderImpl.ts:537-557` still has reduceFieldToSig placeholder
- `Materializer.ts:1208-1247` only handles numeric combine
- `Materializer.ts:283-289` still falls back to index for element IDs

**Critical Path (from cached ir-primitives-status.md):**
- Sprint 4: FieldExpr primitives ← **WE NEVER GOT HERE**
- Sprint 5: Transform chains
- Depends on: Sprint 1-3 (mostly done)

---

## Red-Flag Plan Status (50% Complete)

**From:** `plans/field-runtime-plan-v2.md`

**4 Priorities:**
- ✅ **P0:** Hard error on signal fallback (COMPLETE Dec 28)
  - Evidence: `Materializer.ts:167-189` throws Error instead of `return 0`
- ✅ **P0.5:** No silent default source fallback (COMPLETE Dec 28)
  - Evidence: `pass6-block-lowering.ts:265-295` throws on missing input
- ⚠️  **P1:** Compiler default source handling (SUPERSEDED by hidden providers)
  - Original goal: Wire defaults as constants
  - Actual: Became 18-sprint hidden provider block system
- ❌ **P2:** Remove legacy params code (NOT STARTED)
  - Evidence: `readParamNumber()` still exists at `Materializer.ts:198-203`
  - Evidence: `params` still in IR types (but now compiler-populated)
- ❌ **P3:** Update audit document (NOT STARTED)

**Uncommitted Changes (from Dec 28 STATUS):**
- Were committed in subsequent work
- `FieldHandle.ts`, `types.ts` params propagation is now in codebase

---

## Hidden Providers Plan Status (~90% Complete)

**From:** `plans/PLAN-DEFAULT-SOURCES-HIDDEN-BLOCKS.md`

**This is the work that actually happened (103 commits, Dec 28-31)**

**Completed (18 sprints):**
1. ✅ Sprint 1-5: Const provider blocks
2. ✅ Sprint 6: Hide provider blocks from UI
3. ✅ Sprint 7-8: Attachment storage + persistence
4. ✅ Sprint 9-11: Compiler injection infrastructure
5. ✅ Sprint 12-15: UI integration (dropdowns, config panels, Oscillator)
6. ✅ Sprint 16-18: Validation (type compat, allowlist, buses, cycles)

**Evidence:**
- 381 TypeScript files changed
- Default sources are now hidden `DSConst*` blocks
- Provider blocks (Oscillator) can be default sources
- Full validation system with cycle detection
- UI for provider configuration
- Compiler injects hidden graph

**What this replaced:**
- Original P1: "Wire default sources as constants"
- Became: "Default sources are allowlisted hidden provider blocks"
- Original 1-sprint effort became 18 sprints

---

## The Divergence

```
Dec 28: Red-flag plan P0/P0.5 complete
  ↓
  P1 "Compiler default source handling" (estimated 1 sprint)
  ↓
ACTUAL: 18 sprints of hidden provider block system
  ↓
Dec 31: Original plan still 0% complete
```

**What happened:**
1. Original plan (field primitives) was never started
2. Red-flag plan (params removal) started, P0/P0.5 done
3. P1 (default sources) exploded into massive hidden providers effort
4. P2/P3 never reached
5. Original plan deliverables ignored

---

## Implications

### If Original Plan Was The Goal

**Problem:** 103 commits are off-track
- 0% of original deliverables complete
- Transform chains still throw
- Field reduce still placeholder
- Non-numeric combine not implemented

**Required:** Return to original plan, complete 5 deliverables

---

### If Red-Flag Plan Was The Goal

**Problem:** Massive scope creep on P1
- P1 was "wire default sources" (1 sprint)
- Became 18-sprint hidden provider system
- P2/P3 never reached

**Required:**
- Decide if hidden providers was worth it
- Complete P2 (params removal) or declare params official
- Complete P3 (audit docs)

---

### If Hidden Providers Was The Goal

**Problem:** Original plan is abandoned
- Need to document decision to abandon
- Need to update workstream goals
- 5 original deliverables need new plan

**Required:**
- Update workstream documentation
- Create new plan for field primitives (if still needed)
- Close original workstream or re-scope

---

## Critical Questions (Unresolved)

1. **Which plan is authoritative?**
   - No evidence of explicit decision to abandon original plan
   - No evidence of approval for 18-sprint hidden providers work
   - Red-flag plan partial completion suggests it was active

2. **Are params official or deprecated?**
   - Original plan: remove params
   - Red-flag P2: remove params
   - Actual implementation: params populated by compiler
   - Current state: params exist and work

3. **What happens to original deliverables?**
   - Still needed for field runtime to work fully
   - No plan to complete them
   - No decision to abandon them

---

## Recommendations

### For User

**Must decide:**
1. Which plan is the goal of this workstream?
2. Was hidden providers work approved or scope creep?
3. Are original deliverables still needed?

### For Implementer

**Next steps depend on decision:**

**If Original Plan:**
- Start Sprint 4 (FieldExpr primitives)
- Add FieldExprMapIndexed, FieldExprZipSig
- Implement transform chains, field reduce, etc.

**If Red-Flag Plan:**
- Complete P2 (params removal) or declare params official
- Complete P3 (update audit docs)
- Document hidden providers as P1 expansion

**If Hidden Providers:**
- Document completion of 18 sprints
- Update workstream goals
- Create new plan for field primitives if needed

---

## Reuse Confidence

**HIGH Confidence (trust fully):**
- Git commit count (103)
- File change count (381)
- Plan document comparison
- Completion percentages

**MEDIUM Confidence (verify):**
- Whether hidden providers work is 100% done
- Whether original deliverables are still needed

**NEEDS CLARIFICATION:**
- User intent (which plan is goal)
- Approval status of hidden providers work
- Fate of original plan

---

## Related Cache Files

- `ir-primitives-status.md` - Has original 20-sprint roadmap (now STALE)
- `default-sources-current-state.md` - Needs update to reflect hidden providers
- This file documents the divergence for future evaluations
