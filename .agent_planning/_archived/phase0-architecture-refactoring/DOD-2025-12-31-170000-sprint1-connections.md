# Definition of Done: Sprint 1 - Unify Connections → Edge Type

**Generated**: 2025-12-31-170000
**Plan**: PLAN-2025-12-31-170000-sprint1-connections.md
**Sprint Goal**: Replace three connection types with unified Edge type

---

## Acceptance Criteria

### Deliverable 1: Edge Type Definition and Migration Helpers

- [ ] `Endpoint` type defined as discriminated union: `{ kind: 'port'; blockId: string; slotId: string } | { kind: 'bus'; busId: string }`
- [ ] `Edge` interface includes: id, from/to Endpoints, transforms (optional), enabled, weight (optional), sortKey (optional)
- [ ] Validation logic prevents invalid bus→bus edges
- [ ] All helpers have unit tests with 100% branch coverage

### Deliverable 2: PatchStore Edge Management

- [ ] All edge creation methods use unified `addEdge()` action
- [ ] Edge deletion uses unified `removeEdge()` action
- [ ] All existing PatchStore tests pass with updated implementation
- [ ] No regression in edge manipulation performance

### Deliverable 3: Compiler Pass Updates

- [ ] Pass 2: Single edge iteration loop, unified type checking, all existing type errors detected
- [ ] Pass 6: `resolveInput()` uses unified edge lookup, transform chain applied uniformly
- [ ] Pass 8: Single edge iteration for fragment linking, all edge types connected
- [ ] All 302 existing tests pass
- [ ] Golden patch compiles without errors
- [ ] Compile time unchanged (±5% tolerance)

---

## Sprint Scope

**This sprint delivers**:
1. Unified Edge type with Endpoint discriminated union
2. PatchStore managing single edges array
3. All compiler passes (2, 6, 7, 8) using Edge type

**Deferred**:
- UI component updates (follow-up sprint)
- Complete removal of deprecated types (maintain facades)
- Serialization format version bump (documented only)

---

## Test Coverage Requirements

- [ ] Unit tests: Edge validation (bus→bus rejection)
- [ ] Unit tests: PatchStore edge operations (add, remove, filter)
- [ ] Integration tests: Compiler with mixed edge types
- [ ] Golden patch tests: All existing patches compile correctly

---

## Quality Gates

- [ ] No new TypeScript errors
- [ ] No new ESLint warnings
- [ ] All vitest tests pass
- [ ] No memory leaks in edge management
- [ ] Documentation includes migration guide
- [ ] CHANGELOG entry written
