# Definition of Done: Block & Edge Roles
**Generated**: 2026-01-02
**Plan Reference**: PLAN-2026-01-02-block-edge-roles.md

---

## Phase 1: Type Definitions

### Deliverables
- [ ] `BlockRole` discriminated union type in `types.ts`
- [ ] `StructuralMeta` type with all variants
- [ ] `EdgeRole` discriminated union type in `types.ts`
- [ ] JSDoc comments explaining each variant

### Verification
```bash
pnpm typecheck  # 0 errors
pnpm test       # All pass (no behavior change)
```

---

## Phase 2: Block Migration

### Deliverables
- [ ] `Block.role: BlockRole` is REQUIRED (not optional)
- [ ] `Block.hidden` removed or deprecated
- [ ] All block creation sites set explicit role
- [ ] `PatchStore.userBlocks` uses `role.kind === 'user'`

### Files Modified
- `src/editor/types.ts`
- `src/editor/stores/PatchStore.ts`
- `src/editor/compiler/passes/pass0-materialize.ts`
- Block factory files

### Verification
```bash
pnpm typecheck  # 0 errors
pnpm test       # All pass
grep -r "role\?: BlockRole" src/  # Should return 0 matches
```

---

## Phase 3: Edge Migration

### Deliverables
- [ ] `Edge.role: EdgeRole` is REQUIRED
- [ ] All edge creation sites set explicit role
- [ ] Default edges have role `{ kind: 'default', meta: {...} }`

### Files Modified
- `src/editor/types.ts`
- `src/editor/stores/PatchStore.ts`
- `src/editor/compiler/passes/pass0-materialize.ts`

### Verification
```bash
pnpm typecheck  # 0 errors
pnpm test       # All pass
grep -r "role\?: EdgeRole" src/  # Should return 0 matches
```

---

## Phase 4: Documentation Rename

### Deliverables
- [ ] "hidden blocks" → "structural blocks" in all docs
- [ ] ROADMAP.md updated
- [ ] Code comments updated
- [ ] JSDoc updated

### Verification
```bash
# Should return 0 (in context of system-generated blocks)
grep -ri "hidden block" design-docs/ .agent_planning/ src/ | grep -v "hidden block UI" | wc -l
```

---

## Phase 5: Invariant Validation

### Deliverables
- [ ] `validateRoleInvariants()` function
- [ ] Integration into diagnostic pipeline
- [ ] Unit tests for invariant violations

### Verification
```bash
pnpm test -- --grep "validateRoleInvariants"
```

---

## Final Acceptance Criteria

| Criterion | Check |
|-----------|-------|
| TypeScript compiles | `pnpm typecheck` = 0 errors |
| All tests pass | `pnpm test` = 2523+ tests pass |
| No optional roles | `grep "role\?:" src/` = 0 |
| Consistent terminology | `grep -ri "hidden block"` = 0 (in context) |
| Role invariants checked | `validateRoleInvariants` exists and tested |

---

## Rollback Plan

If issues discovered:
1. Revert to optional `role?: BlockRole`
2. Keep `hidden?: boolean` field
3. Address issues incrementally

The type changes are additive; migration can be paused at any phase.
