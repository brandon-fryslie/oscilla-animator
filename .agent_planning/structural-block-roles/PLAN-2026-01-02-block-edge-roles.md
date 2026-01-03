# PLAN: Block & Edge Roles with Discriminated Unions
**Generated**: 2026-01-02
**Topic**: structural-block-roles
**Related**: Phase 0 Architecture Refactoring

---

## Executive Summary

**Objective**: Introduce discriminated union types for `BlockRole` and `EdgeRole` that:
1. Replace the vague "hidden blocks" terminology with explicit "structural blocks"
2. Make block/edge semantics explicit and type-safe
3. Eliminate scattered `if role then read X` logic

**Terminology Change**: "hidden blocks" → "structural blocks"
- "Hidden" implies visibility concerns
- "Structural" correctly describes purpose: these blocks exist for architectural reasons

**Key Design Principle**:
- The compiler consumes only the erased graph: `(blocks, edges)`
- Roles exist to make **editor behavior** deterministic and maintainable
- Roles do NOT change compilation - they change editor invariants

---

## Current State

### BlockRole (types.ts:653-657)
```typescript
// Current: simple string union
export type BlockRole = 'defaultSourceProvider' | 'internal';

// Usage in Block interface (types.ts:709)
role?: BlockRole;  // Optional!

// Also have separate flag:
hidden?: boolean;  // types.ts:700
```

**Problems**:
1. `role` is optional - not every block has explicit semantics
2. `hidden` is separate from `role` - inconsistent representation
3. No metadata attached to roles (e.g., what port does defaultSource target?)
4. String union doesn't scale as more structural block types emerge

### EdgeRole
```typescript
// Currently: DOES NOT EXIST
// Edge interface (types.ts:293) has no role field
```

**Problems**:
1. No way to distinguish user-authored edges from auto-generated
2. Default edges (from defaultSource blocks) look the same as explicit wires
3. Bus tap edges have no semantic marker

---

## Target State

### BlockRole: Discriminated Union

```typescript
type BlockRole =
  | { kind: 'user' }
  | { kind: 'structural'; meta: StructuralMeta };

type StructuralMeta =
  | { kind: 'defaultSource'; target: { kind: 'port'; port: PortRef } }
  | { kind: 'wireState';     target: { kind: 'wire'; wire: WireId } }
  | { kind: 'globalBus';     target: { kind: 'bus'; busId: BusId } }
  | { kind: 'lens';          target: { kind: 'node'; node: NodeRef; port?: string } };

interface Block {
  // ...
  role: BlockRole;  // REQUIRED, not optional
}
```

**Key Changes**:
- `role` becomes REQUIRED on all blocks
- User blocks explicitly have `{ kind: 'user' }`
- Structural blocks carry metadata about their target/purpose
- `hidden?: boolean` can be derived from `role.kind === 'structural'`

### EdgeRole: Discriminated Union

```typescript
type EdgeRole =
  | { kind: 'user' }
  | { kind: 'default'; meta: { defaultSourceBlockId: BlockId } }
  | { kind: 'busTap';  meta: { busId: BusId } }
  | { kind: 'auto';    meta: { reason: 'portMoved' | 'rehydrate' | 'migrate' } };

interface Edge {
  // ...
  role: EdgeRole;  // REQUIRED, not optional
}
```

**Key Semantics**:
- `user`: Persisted exactly as authored
- `default`: Suppressed when port has real inbound connection
- `busTap`: Editor can render differently, enforce bus constraints
- `auto`: Editor may delete/regenerate to maintain structural intent

---

## Implementation Plan

### Phase 1: Type Definitions (Non-Breaking)

**Files**:
- `src/editor/types.ts`

**Changes**:
1. Add new discriminated union types alongside existing
2. Keep old `BlockRole` with deprecation
3. Add `EdgeRole` type

**Acceptance Criteria**:
- [ ] `BlockRole` discriminated union defined
- [ ] `StructuralMeta` with all variants defined
- [ ] `EdgeRole` discriminated union defined
- [ ] TypeScript compiles with 0 errors
- [ ] No tests broken

### Phase 2: Block Migration

**Files**:
- `src/editor/types.ts` - Update Block interface
- `src/editor/stores/PatchStore.ts` - Update block creation
- `src/editor/compiler/passes/pass0-materialize.ts` - Set role on created blocks
- `src/editor/blocks/*.ts` - Factory functions set role

**Changes**:
1. Add `role: BlockRole` to Block interface (initially optional with default)
2. Update all block creation to set explicit role
3. Remove `hidden?: boolean` field (derive from role)

**Acceptance Criteria**:
- [ ] All blocks have explicit `role`
- [ ] `hidden` is removed or deprecated
- [ ] `userBlocks` getter uses `role.kind === 'user'`
- [ ] TypeScript compiles with 0 errors
- [ ] All tests pass

### Phase 3: Edge Migration

**Files**:
- `src/editor/types.ts` - Update Edge interface
- `src/editor/stores/PatchStore.ts` - Edge creation helpers
- `src/editor/compiler/passes/pass0-materialize.ts` - Set role on default edges

**Changes**:
1. Add `role: EdgeRole` to Edge interface
2. Update all edge creation to set explicit role
3. Default edges from materialize pass get `{ kind: 'default', meta: { ... } }`

**Acceptance Criteria**:
- [ ] All edges have explicit `role`
- [ ] Edges from materializeDefaultSources have role `default`
- [ ] TypeScript compiles with 0 errors
- [ ] All tests pass

### Phase 4: Documentation Rename

**Scope**: Rename "hidden blocks" → "structural blocks" in:
- Design docs (`design-docs/**/*.md`)
- Planning docs (`.agent_planning/**/*.md`)
- Spec docs (`design-docs/spec/**/*.md`)
- Code comments (`src/**/*.ts`)
- ROADMAP.md

**Method**:
```bash
# Find all occurrences
grep -r "hidden block" --include="*.md" --include="*.ts" .

# Systematic replacement
# "hidden blocks" → "structural blocks"
# "hidden provider block" → "structural provider block"
# "hiddenBlock" → "structuralBlock" (in code)
```

**Acceptance Criteria**:
- [ ] No occurrences of "hidden block" in docs (context: system-generated blocks)
- [ ] Consistent "structural block" terminology
- [ ] Comments updated where referring to this concept

### Phase 5: Validation & Invariant Checking

**File**: `src/editor/semantic/validateGraph.ts` (new or extend)

**Function**: `validateRoleInvariants(patch: Patch): Diagnostic[]`

**Invariants to check**:
1. Default edges must reference a structural defaultSource block
2. WireState blocks must target an existing edge
3. GlobalBus blocks must have valid busId
4. Lens structural blocks must target valid node

**Acceptance Criteria**:
- [ ] `validateRoleInvariants()` implemented
- [ ] Integrated into compile pipeline (diagnostic phase)
- [ ] Tests for invariant violations

---

## Risk Assessment

### Low Risk
- Type definitions are additive (Phase 1)
- Documentation changes are isolated (Phase 4)

### Medium Risk
- Block migration requires updating all creation sites (Phase 2)
- Edge migration requires similar updates (Phase 3)

### Mitigation
- Make `role` optional initially with sensible default
- Migrate incrementally: add role where created, then make required
- Run full test suite after each phase

---

## Success Criteria

1. **Type Safety**: All blocks and edges have explicit, discriminated role
2. **Terminology**: "structural blocks" used consistently, "hidden blocks" deprecated
3. **Invariants**: `validateRoleInvariants()` catches misconfigurations
4. **Zero Runtime Impact**: Roles are editor-only, compiler ignores them
5. **All Tests Pass**: 2523+ tests green

---

## Notes

### Why "structural" not "system" or "internal"?
- "structural" emphasizes architectural purpose
- "system" is too generic
- "internal" already used as a role value

### Edge role semantics (detailed)
- **user**: `git diff` should show this - it's what the user authored
- **default**: Compiler sees it, but editor may hide in some views
- **busTap**: Editor knows this came from bus connection UI
- **auto**: Editor created this to maintain integrity (can regenerate)

### Relationship to bus cleanup
This work is ORTHOGONAL to bus cleanup. Bus blocks can have:
- `role: { kind: 'structural', meta: { kind: 'globalBus', target: { kind: 'bus', busId } } }`

The role just makes the semantic explicit. Bus cleanup removes bus-specific *compiler* handling.
