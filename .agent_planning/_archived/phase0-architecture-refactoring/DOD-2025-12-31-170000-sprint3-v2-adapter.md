# Definition of Done: Sprint 3 - V2 Adapter Implementation

**Generated**: 2025-12-31-170000
**Plan**: PLAN-2025-12-31-170000-sprint3-v2-adapter.md
**Sprint Goal**: Replace V2 adapter stub with full bridge implementation

---

## Acceptance Criteria

### Deliverable 1: IR Extensions for V1 Bridge

- [ ] `SignalExprClosure` node type added to SignalExprNode union
- [ ] Node contains: `{ kind: 'closure'; closureFn: (ctx) => number; type: TypeDesc }`
- [ ] `SignalExprBuilder.closureNode()` method implemented
- [ ] Type safety preserved throughout IR pipeline
- [ ] Unit tests verify closure nodes serialize/deserialize
- [ ] IR validation accepts closure nodes

### Deliverable 2: V2 Adapter Core Implementation

- [ ] `artifactToSigExprId()` converts constants and closures to SigExprIds
- [ ] `adaptV2Compiler()` creates SignalExprBuilder per block instance
- [ ] Input artifacts converted and passed to `v2Compiler.compileV2()`
- [ ] Output SigExprIds wrapped as closures calling `evalSig()`
- [ ] IR built once per block and cached
- [ ] Error artifacts removed (stub code deleted)
- [ ] All V2 block types compile without errors

### Deliverable 3: Runtime Integration

- [ ] `evalSig()` handles `case 'closure'` in switch statement
- [ ] Closure nodes invoke `node.closureFn(ctx)` correctly
- [ ] Performance: closure invocation overhead < 10ns
- [ ] Unit tests: closure nodes evaluate correctly
- [ ] Integration tests: mixed V1/V2 blocks in same patch
- [ ] Golden patch with V2 blocks renders identically to V1

---

## Sprint Scope

**This sprint delivers**:
1. SignalExprClosure node type in IR
2. Full V2 adapter replacing stub
3. Runtime support for mixed V1/V2 execution

**Deferred**:
- Field/Event IR support (Signal only)
- Performance optimization (closure caching)
- Converting blocks to native V2

---

## Test Coverage Requirements

- [ ] Unit tests: SignalExprClosure node creation and validation
- [ ] Unit tests: `artifactToSigExprId()` with constants, closures, invalid inputs
- [ ] Unit tests: V2 adapter with mock blocks
- [ ] Integration tests: V1→V2→V1 block chains
- [ ] Performance tests: < 5% overhead vs native V1
- [ ] Golden patch tests: V2 blocks render correctly

---

## Quality Gates

- [ ] No new TypeScript errors
- [ ] No new ESLint warnings
- [ ] All 302 existing tests pass
- [ ] Compilation time increase < 5%
- [ ] No memory leaks in closure handling
- [ ] Error messages clear for unsupported types
- [ ] Documentation: `design-docs/compiler/v1-v2-bridge.md`
- [ ] CHANGELOG entry written
