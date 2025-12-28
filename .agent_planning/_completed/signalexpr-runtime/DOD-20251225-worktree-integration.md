# Definition of Done: Worktree Integration
Generated: 2025-12-25T19:25:00

## Acceptance Criteria

### P0: HANDOFF.md
- [ ] `./HANDOFF.md` exists
- [ ] Contains Phase 4 SignalExpr Runtime specification (713 lines)
- [ ] File is identical to source

### P1: Planning Files
- [ ] `.agent_planning/signalexpr-runtime/` contains all 11 source files:
  - DOD-20251225-190000.md
  - PLAN-20251225-190000.md
  - SPRINT-02-select-inputSlot.md
  - SPRINT-03-busCombine.md
  - SPRINT-04-transform.md
  - SPRINT-05-stateful.md
  - SPRINT-06-closureBridge.md
  - SPRINT-07-blockCompilerMigration.md
  - SPRINT-INDEX.md
  - STATUS-20251225.md
  - SUMMARY-planner-20251225-190000.txt
- [ ] All files are readable markdown/text

### P2: eval-cache Update
- [ ] `.agent_planning/eval-cache/compiler-patterns.md` exists
- [ ] `.agent_planning/eval-cache/INDEX.md` references compiler-patterns.md

## Verification Commands
```bash
# Verify HANDOFF.md
test -f HANDOFF.md && wc -l HANDOFF.md

# Verify planning files count
ls .agent_planning/signalexpr-runtime/*.md | wc -l  # Should be 10+

# Verify eval-cache
test -f .agent_planning/eval-cache/compiler-patterns.md && echo "OK"
grep compiler-patterns .agent_planning/eval-cache/INDEX.md
```

## NOT Included (Out of Scope)
- No source code modifications
- No debug code removal
- No implementation changes
