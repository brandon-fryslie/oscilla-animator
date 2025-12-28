# Sprint Plan: Worktree Integration - Phase 4 SignalExpr Runtime Planning Docs
Generated: 2025-12-25T19:25:00

## Sprint Goal
Copy Phase 4 planning documentation from recovered worktree into the main project to preserve planning work.

## Scope
**In scope (this sprint):**
1. Copy HANDOFF.md to project root
2. Copy 11 planning files to `.agent_planning/signalexpr-runtime/`
3. Copy compiler-patterns.md to eval-cache and update INDEX.md

**Explicitly out of scope:**
- Source code changes (debug code removal was in worktree but not wanted)
- Implementation work (just preserving planning docs)
- Any modifications to existing source files

## Work Items

### P0: Copy HANDOFF.md
**Source:** `.worktrees_recovered/4-signalexpr-runtime/HANDOFF.md`
**Target:** `./HANDOFF.md`

**Acceptance Criteria:**
- [ ] File copied successfully
- [ ] File is valid markdown (713 lines)
- [ ] Contains Phase 4 SignalExpr Runtime specification

### P1: Copy Planning Files
**Source:** `.worktrees_recovered/4-signalexpr-runtime/.agent_planning/signalexpr-runtime/*.md`
**Target:** `.agent_planning/signalexpr-runtime/`

Files (11 total):
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

**Acceptance Criteria:**
- [ ] All 11 files copied
- [ ] Files are valid and readable

### P2: Update eval-cache
**Source:** `.worktrees_recovered/4-signalexpr-runtime/.agent_planning/eval-cache/compiler-patterns.md`
**Target:** `.agent_planning/eval-cache/compiler-patterns.md`

**Acceptance Criteria:**
- [ ] compiler-patterns.md copied
- [ ] INDEX.md updated with reference to compiler-patterns.md

## Dependencies
- Access to `.worktrees_recovered/4-signalexpr-runtime/` directory

## Risks
- LOW: Simple file copy, fully reversible
- No source code modifications

## Implementation Commands
```bash
# P0: Copy HANDOFF
cp .worktrees_recovered/4-signalexpr-runtime/HANDOFF.md ./HANDOFF.md

# P1: Copy planning files
cp .worktrees_recovered/4-signalexpr-runtime/.agent_planning/signalexpr-runtime/*.md .agent_planning/signalexpr-runtime/
cp .worktrees_recovered/4-signalexpr-runtime/.agent_planning/signalexpr-runtime/*.txt .agent_planning/signalexpr-runtime/

# P2: Copy eval-cache file
cp .worktrees_recovered/4-signalexpr-runtime/.agent_planning/eval-cache/compiler-patterns.md .agent_planning/eval-cache/

# Update INDEX.md (add row for compiler-patterns.md)
```
