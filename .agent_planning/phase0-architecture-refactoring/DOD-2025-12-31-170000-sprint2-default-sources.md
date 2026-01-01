# Definition of Done: Sprint 2 - Unify Default Sources with Blocks

**Generated**: 2025-12-31-170000
**Plan**: PLAN-2025-12-31-170000-sprint2-default-sources.md
**Sprint Goal**: Replace default source metadata with hidden provider blocks

---

## Acceptance Criteria

### Deliverable 1: Default Source Materialization

- [ ] `materializeDefaultSources(patch: Patch): Patch` implemented in `src/editor/compiler/passes/pass0-materialize.ts`
- [ ] Function scans all block inputs for missing edges
- [ ] Creates appropriate DSConst* block based on input world and type
- [ ] Generated blocks have `hidden: true` and `role: 'defaultSourceProvider'`
- [ ] Creates Edge from provider block output to target input
- [ ] Preserves existing edges (no duplication)
- [ ] Returns new Patch with augmented blocks and edges

### Deliverable 2: Compiler Integration

- [ ] `compile()` calls `materializeDefaultSources()` before pass 1
- [ ] Materialized patch passed to all subsequent passes
- [ ] Original patch not mutated (functional transform)
- [ ] Compilation succeeds for patches with unconnected inputs
- [ ] No performance regression (materialization < 5% of compile time)
- [ ] All special-case default source code removed from passes 2, 6, 7, 8

### Deliverable 3: Type System Updates

- [ ] `Patch.defaultSources` and `Patch.defaultSourceAttachments` removed
- [ ] `Block.hidden?: boolean` and `Block.role?: string` fields added
- [ ] All 11 DSConst* provider block compilers exist and work correctly
- [ ] TypeScript compilation succeeds with no errors
- [ ] All 302 existing tests pass with materialization

---

## Sprint Scope

**This sprint delivers**:
1. Hidden provider block materialization at compile time
2. Simplified compiler passes (no default source special cases)
3. Updated type definitions (Block metadata, Patch without defaultSources)

**Deferred**:
- UI updates for inline default value editors
- "Promote default to visible block" feature
- Serialization format version bump (documented only)

---

## Test Coverage Requirements

- [ ] Unit tests: `materializeDefaultSources()` with various input types
- [ ] Unit tests: Multiple unconnected inputs handled correctly
- [ ] Unit tests: Existing edges preserved (no duplication)
- [ ] Integration tests: Compilation with unmaterialized defaults
- [ ] Integration tests: All DSConst* provider types compile correctly
- [ ] Golden patch tests: Output identical to previous behavior

---

## Quality Gates

- [ ] No new TypeScript errors
- [ ] No new ESLint warnings
- [ ] All vitest tests pass
- [ ] Compile time unchanged (±5% tolerance)
- [ ] Test suite runtime increase < 10ms
- [ ] Documentation includes migration notes
- [ ] CHANGELOG entry documents removed types
