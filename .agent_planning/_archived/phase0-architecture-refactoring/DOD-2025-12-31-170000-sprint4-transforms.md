# Definition of Done: Sprint 4 - Unify Lenses and Adapters (OPTIONAL)

**Generated**: 2025-12-31-170000
**Plan**: PLAN-2025-12-31-170000-sprint4-transforms.md
**Sprint Goal**: Merge Lens and Adapter registries into unified TransformRegistry

---

## Acceptance Criteria

### Deliverable 1: Unified Transform Types

- [ ] `TransformStep` interface defined: `{ id, kind: 'lens' | 'adapter', params? }`
- [ ] `TransformDef` interface includes: id, label, kind, inputType, outputType
- [ ] Lens-specific fields: `params`, `domain`
- [ ] Adapter-specific fields: `policy`, `cost`
- [ ] Type guards: `isLensTransform()`, `isAdapterTransform()`
- [ ] Unit tests verify type safety

### Deliverable 2: TransformRegistry Implementation

- [ ] `TransformRegistry` class created with unified storage
- [ ] Methods: `registerLens()`, `registerAdapter()`, `getTransform()`, `findAdapters()`, `getLensesForDomain()`
- [ ] Adapter pathfinding preserved (auto-insertion)
- [ ] All ~30 lenses migrated from LensRegistry
- [ ] All ~20 adapters migrated from AdapterRegistry
- [ ] Unit tests cover all registry operations

### Deliverable 3: Compiler Integration and Facades

- [ ] Compiler passes (2, 6, 8) use TransformRegistry
- [ ] Transform application unified (no lens/adapter branches)
- [ ] Old LensRegistry and AdapterRegistry work as facades
- [ ] Deprecation warnings added to old methods
- [ ] All 302 existing tests pass
- [ ] No behavioral changes in compilation

---

## Sprint Scope

**This sprint delivers**:
1. Unified TransformStep and TransformDef types
2. TransformRegistry with all lenses and adapters
3. Compiler integration with backward-compatible facades

**Deferred**:
- Removing old registries (maintain indefinitely)
- UI updates for transform configuration
- New transform types

---

## Test Coverage Requirements

- [ ] Unit tests: TransformRegistry operations (register, lookup, filter)
- [ ] Unit tests: Type guards for lens vs adapter transforms
- [ ] Integration tests: Lens transforms on edges
- [ ] Integration tests: Adapter auto-insertion
- [ ] Migration tests: Old registries delegate correctly
- [ ] Performance tests: No regression in transform lookup

---

## Quality Gates

- [ ] No new TypeScript errors
- [ ] No new ESLint warnings
- [ ] All vitest tests pass
- [ ] No performance regression
- [ ] Adapter auto-insertion still works
- [ ] Documentation updated
- [ ] CHANGELOG entry written

---

## Optional Sprint Note

**This sprint is OPTIONAL and can be deferred.** Priority should be given to Sprints 1-3 (Connections, Default Sources, V2 Adapter) as they are foundational. Sprint 4 is a nice cleanup that simplifies the codebase but does not block compiler functionality.

**Recommended Timeline**:
- **Must Do**: Sprints 1-3 (Phase 0 critical path)
- **Nice to Have**: Sprint 4 (can defer to Phase 6 polish)
