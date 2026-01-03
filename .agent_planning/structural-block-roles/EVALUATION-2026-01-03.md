# Evaluation: Block & Edge Roles Implementation
Timestamp: 2026-01-03-133000
Confidence: FRESH
Git Commit: 12475ff
Scope: project/structural-block-roles

## Executive Summary

**Target Architecture**: Discriminated union role types (§15 Block & Edge Roles) where every block and edge has explicit, required role metadata. Compiler ignores roles; they exist solely for editor behavior and validation.

**Current State**: INCOMPLETE - Foundation exists but spec requirements not fully met.
- BlockRole: ✅ Type exists but is WRONG (string union instead of discriminated union)
- EdgeRole: ❌ MISSING ENTIRELY (no role field on edges)
- Required fields: ❌ Both role fields are optional, not required
- Terminology: ⚠️ Mixed ("hidden blocks" still used alongside "structural")

**Verdict**: **NEEDS WORK** - Core type system exists but doesn't match spec. Simple string unions instead of discriminated unions. Edge roles completely missing.

---

## What §15 & §16 Require

### From §15: Block & Edge Roles

**Invariant 1: Every Entity Has a Role** (§15 lines 20-46)
```typescript
interface BlockInstance {
  role: BlockRole  // REQUIRED, not optional
}

interface Edge {
  role: EdgeRole   // REQUIRED, not optional
}
```

**Invariant 2: Roles are Discriminated Unions** (§15 lines 48-87)

BlockRole:
```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "structural"; meta: StructuralMeta };

type StructuralMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "globalBus";     target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef; port?: string } };
```

EdgeRole:
```typescript
type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

**Invariant 4: The Compiler Ignores Roles** (§15 lines 104-135)
- Roles inform UI rendering, undo/redo, persistence, validation
- Roles do NOT inform scheduling, type checking, IR generation, runtime execution

**Invariant 5: Role Invariants Are Validatable** (§15 lines 137-148)
- validateGraph() must assert all role invariants
- Violations are compile-time diagnostics, not runtime errors

**Invariant 6: User Entities Are Canonical** (§15 lines 150-160)
- User entities are source of truth
- Structural entities can be regenerated from invariants
- Serialization may elide structural entities (they're derived)

### From §16: Graph Normalization

**Relationship to roles** (§16 lines 200-210):
- Normalized graph contains both user and structural blocks/edges
- All have explicit roles
- Roles preserved through normalization for debug visibility

---

## Current Implementation Analysis

### 1. BlockRole Type (src/editor/types.ts:643)

**Current state**:
```typescript
export type BlockRole = 'defaultSourceProvider' | 'internal';
```

**Usage in Block interface** (types.ts:695):
```typescript
interface Block {
  // ...
  hidden?: boolean;   // Line 686 - separate flag
  role?: BlockRole;   // Line 695 - OPTIONAL
}
```

**❌ DOES NOT MATCH SPEC**:
1. String union, not discriminated union
2. No metadata attached to roles
3. `role` is optional (spec requires it)
4. Only 2 variants (spec has `user` + 4 structural subtypes)
5. `hidden?: boolean` is separate (should be derived from role)
6. No `StructuralMeta` type
7. Values don't match spec ('defaultSourceProvider' vs 'structural')

### 2. EdgeRole Type

**Current state**: DOES NOT EXIST

**Edge interface** (types.ts:293-323):
```typescript
export interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly transforms?: TransformStep[];
  readonly enabled: boolean;
  readonly weight?: number;
  readonly sortKey?: number;
}
```

**❌ NO ROLE FIELD AT ALL**

### 3. Where Roles Are Used

**pass0-materialize.ts** (creates default source blocks):
```typescript
// Line ~92-100: Creates provider blocks
const providerBlock: Block = {
  id: providerId,
  type: providerType,
  label: `Default ${slot.label}`,
  // ...
  hidden: true,      // Uses hidden flag
  role: 'defaultSourceProvider',  // Uses string role
};
```

**Analysis**:
- ✅ Sets role on created structural blocks
- ❌ Uses string role, not discriminated union
- ❌ No metadata (doesn't specify which port it targets)
- ⚠️ Also sets `hidden: true` (redundant with role)

**PatchStore.ts** (block creation):
```typescript
// userBlocks getter
get userBlocks(): ReadonlyArray<Block> {
  return this.blocks.filter(b => !b.hidden);
}
```

**Analysis**:
- ❌ Filters by `hidden` flag, not by `role.kind === 'user'`
- ❌ Assumes all non-hidden blocks are user blocks (not always true)

### 4. Terminology Issues

**Grep for "hidden block"**:
```
design-docs/final-System-Invariants/15-Block-Edge-Roles.md:204: - ~~Hidden block~~ → Use "structural block"
PLAN-2026-01-02-block-edge-roles.md:15: **Terminology Change**: "hidden blocks" → "structural blocks"
```

**Grep for "structural block"**:
- Spec files use it correctly
- Planning files use it
- Code does NOT use it (uses "hidden")

**Mixed terminology found**:
- Code: `hidden: boolean`, `role: 'defaultSourceProvider' | 'internal'`
- Docs: "structural blocks" (correct)
- Comments: Mix of both

---

## Gap Analysis

### What's Missing

| Requirement | Status | Evidence | Impact |
|-------------|--------|----------|--------|
| **BlockRole discriminated union** | WRONG TYPE | types.ts:643 is string union | Can't attach metadata |
| **StructuralMeta type** | MISSING | No such type exists | Can't reference targets |
| **EdgeRole type** | MISSING | No EdgeRole anywhere | Can't distinguish edge origins |
| **Block.role REQUIRED** | OPTIONAL | types.ts:695 has `role?:` | Blocks can lack semantics |
| **Edge.role field** | MISSING | No role field on Edge | All edges look identical |
| **hidden field removed** | STILL PRESENT | types.ts:686 | Redundant with role |
| **Validation function** | MISSING | No validateRoleInvariants() | Can't check invariants |
| **User block detection** | WRONG LOGIC | Filters by `hidden`, not role | Incorrect filtering |
| **Default edge roles** | MISSING | pass0-materialize creates edges with no role | Can't distinguish from user wires |

### What Exists (Partial Implementation)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| BlockRole type | PARTIAL | types.ts:643 | Wrong shape (string union) |
| Block.role field | PARTIAL | types.ts:695 | Optional, not required |
| Block.hidden field | YES | types.ts:686 | Should be derived from role |
| Role assignment | PARTIAL | pass0-materialize.ts | Sets string role on structural blocks |
| User block filtering | WRONG | PatchStore.ts | Uses `hidden`, not role |

---

## Data Flow Verification

### Current Flow (What Actually Happens)

**User creates block**:
```
PatchStore.addBlock()
  → Block created with role undefined (or default 'user'?)
  → Block.hidden = false (default)
  → No role-based logic
```

**Compiler creates default source**:
```
pass0-materialize.ts
  → Creates Block with role: 'defaultSourceProvider'
  → Sets hidden: true
  → Creates Edge with NO role
  → Both added to CompilerPatch.blocks, edges
```

**UI filters blocks**:
```
PatchStore.userBlocks
  → filters by !b.hidden
  → Doesn't check role
```

**Problems**:
1. Edges from default sources look identical to user wires
2. No metadata on roles (can't tell what port a defaultSource targets)
3. Hidden flag and role are redundant
4. No validation of role invariants

### Target Flow (Spec Requirement)

**User creates block**:
```
PatchStore.addBlock()
  → Block created with role: { kind: 'user' }
  → No hidden field (derived from role)
```

**Normalization creates default source**:
```
GraphNormalizer.normalize()
  → Creates Block with role: { kind: 'structural', meta: { kind: 'defaultSource', target: { kind: 'port', port } } }
  → Creates Edge with role: { kind: 'default', meta: { defaultSourceBlockId } }
  → Both added to NormalizedGraph
```

**UI filters blocks**:
```
PatchStore.userBlocks
  → filters by b.role.kind === 'user'
  → Structural blocks filtered out
```

**Validation**:
```
validateRoleInvariants(graph)
  → Checks default edges reference structural blocks
  → Checks structural metadata targets exist
  → Returns diagnostics for violations
```

---

## Ambiguities & Design Questions

### 1. Migration Path for Existing Patches

**Question**: How do we handle existing patches that have:
- `role: 'defaultSourceProvider'` (string)
- `hidden: true`
- No role on edges

**Options**:
- **A**: Add migration function that converts old role strings to discriminated unions
- **B**: Make role optional during transition, then require it later
- **C**: Default to `{ kind: 'user' }` for blocks without role

**Recommendation needed**: Migration strategy for patches in the wild.

### 2. Should `hidden` be removed or derived?

**Current**: `hidden?: boolean` is a separate field

**Spec implies**: Derive from role:
```typescript
function isHidden(block: Block): boolean {
  return block.role.kind === 'structural';
}
```

**Question**: Should we:
- **A**: Remove `hidden` field entirely (breaking change)
- **B**: Keep `hidden` but deprecate it (gradual migration)
- **C**: Keep both (derived from role, but settable for override)

**Tradeoff**:
- Remove: Clean, matches spec, but breaks existing code
- Deprecate: Safe, but adds migration complexity
- Keep both: Maximum compat, but confusing semantics

### 3. Validation Timing

**Spec says**: "Violations are compile-time diagnostics"

**Question**: When does validateRoleInvariants() run?
- **A**: On every PatchStore mutation (eager)
- **B**: Only during compilation (lazy)
- **C**: On demand via explicit validate() call

**Tradeoff**:
- Eager: Catch errors early, but overhead on every edit
- Lazy: Minimal overhead, but errors delayed
- On-demand: User controls timing, but might be forgotten

### 4. Are BusBlocks structural or user?

**Context**: Users can create BusBlocks manually via PatchStore.addBus()

**Question**: What role should BusBlocks have?
- **A**: Always user (current behavior - user creates them)
- **B**: Always structural (buses are infrastructure)
- **C**: Hybrid (built-in buses are structural, user buses are user)

**Impact**: Determines if buses appear in userBlocks filter

### 5. What about macro-expanded blocks?

**Context**: Macros expand into multiple blocks when instantiated

**Question**: What role should macro-expanded blocks have?
- **A**: User (user chose to instantiate the macro)
- **B**: Structural (macro expansion is automatic)
- **C**: New variant: `{ kind: 'macro'; meta: { macroId } }`

**Impact**: Affects serialization, undo/redo, filtering

---

## Implementation Red Flags

### Current Code Smells

1. **BlockRole is string union, not discriminated**
   - **Why bad**: Can't attach metadata (which port does defaultSource target?)
   - **Evidence**: types.ts:643 `type BlockRole = 'defaultSourceProvider' | 'internal'`
   - **Fix**: Replace with discriminated union per spec

2. **Edge has no role field**
   - **Why bad**: Can't distinguish user wires from default edges from bus taps
   - **Evidence**: types.ts:293-323 Edge interface
   - **Fix**: Add `role: EdgeRole` field (required)

3. **role is optional on blocks**
   - **Why bad**: Spec says "Every entity has a role" (required)
   - **Evidence**: types.ts:695 `role?: BlockRole`
   - **Fix**: Make `role: BlockRole` required

4. **hidden and role are redundant**
   - **Why bad**: Two sources of truth for same information
   - **Evidence**: types.ts:686 `hidden?: boolean` + types.ts:695 `role?:`
   - **Fix**: Remove `hidden`, derive from `role.kind === 'structural'`

5. **User block filtering uses wrong logic**
   - **Why bad**: Filters by `hidden`, not by role (fragile)
   - **Evidence**: PatchStore.ts `filter(b => !b.hidden)`
   - **Fix**: Change to `filter(b => b.role.kind === 'user')`

6. **No validation of role invariants**
   - **Why bad**: Spec requires validateRoleInvariants()
   - **Evidence**: No such function exists
   - **Fix**: Implement validation per spec lines 233-258

7. **Default edges created with no role**
   - **Why bad**: Can't distinguish from user wires
   - **Evidence**: pass0-materialize.ts creates edges with no role field
   - **Fix**: Set `role: { kind: 'default', meta: { defaultSourceBlockId } }`

---

## Runtime Check Requirements

### Persistent Checks (run these)

| Check | Command | Purpose | Status |
|-------|---------|---------|--------|
| Type check | `just typecheck` | Catch type errors | PASS |
| Lint | `just check` | Code quality | PASS |
| Tests | `just test` | Unit tests | PASS (2523+) |

**Note**: All checks pass because the wrong types (string unions) are valid TypeScript. The spec violation is semantic, not syntactic.

### Missing Checks (implementer should create)

1. **Role shape validation test**:
   ```typescript
   // Verify BlockRole is discriminated union
   const userRole: BlockRole = { kind: 'user' };
   const structRole: BlockRole = {
     kind: 'structural',
     meta: { kind: 'defaultSource', target: { kind: 'port', port: mockPortRef } }
   };

   // Should NOT compile (string is wrong type):
   const wrongRole: BlockRole = 'defaultSourceProvider'; // Type error
   ```

2. **Edge role validation test**:
   ```typescript
   // Verify Edge has role field
   const edge: Edge = {
     id: 'e1',
     from: { kind: 'port', blockId: 'b1', slotId: 's1' },
     to: { kind: 'port', blockId: 'b2', slotId: 's2' },
     role: { kind: 'user' },  // Required field
     enabled: true,
   };
   ```

3. **Role invariant validation test**:
   ```typescript
   // Test validateRoleInvariants()
   const patch = createTestPatch();
   const diagnostics = validateRoleInvariants(patch);

   // Should catch: default edge referencing non-structural block
   expect(diagnostics).toContainEqual({
     severity: 'error',
     message: 'Default edge must reference structural block'
   });
   ```

4. **User block filtering test**:
   ```typescript
   // Test PatchStore.userBlocks uses role, not hidden
   const store = new PatchStore();
   store.addBlock(createUserBlock());
   store.addBlock(createStructuralBlock());

   const userBlocks = store.userBlocks;
   expect(userBlocks.length).toBe(1);
   expect(userBlocks[0].role.kind).toBe('user');
   ```

---

## Test Coverage Assessment

### Existing Tests

**Search for role-related tests**:
```bash
grep -r "BlockRole\|EdgeRole" src/**/*.test.ts
# Returns: 0 results
```

**Verdict**: NO TESTS for role types exist.

### Test Quality Scoring

| Question | Yes | No |
|----------|-----|-----|
| Do tests verify BlockRole is discriminated union? | | **NO** |
| Do tests verify EdgeRole exists? | | **NO** |
| Do tests check role is required? | | **NO** |
| Do tests validate role invariants? | | **NO** |
| Do tests check userBlocks filtering by role? | | **NO** |

**Test Quality**: **WORTHLESS** - No tests for the feature at all.

---

## Recommendations

### Priority 1: Fix Type System (MUST DO FIRST)

1. **Replace BlockRole with discriminated union**:
   - Location: `src/editor/types.ts`
   - Action: Replace string union with spec-compliant discriminated union
   - Add `StructuralMeta` type with all variants

2. **Add EdgeRole discriminated union**:
   - Location: `src/editor/types.ts`
   - Action: Create EdgeRole type per spec
   - Add to Edge interface

3. **Make roles required**:
   - Location: Block and Edge interfaces
   - Action: Change `role?:` to `role:`
   - Add migration for existing patches

### Priority 2: Update Creation Sites

4. **Update block creation to use new roles**:
   - PatchStore.addBlock() → sets `role: { kind: 'user' }`
   - pass0-materialize.ts → sets `role: { kind: 'structural', meta: {...} }`
   - Include metadata (target port, etc.)

5. **Update edge creation to use roles**:
   - PatchStore.connect() → sets `role: { kind: 'user' }`
   - pass0-materialize edges → sets `role: { kind: 'default', meta: {...} }`

### Priority 3: Remove Redundancy

6. **Remove or derive `hidden` field**:
   - Option A: Remove entirely (breaking)
   - Option B: Derive from role (non-breaking)
   - Update PatchStore.userBlocks to use role

### Priority 4: Validation

7. **Implement validateRoleInvariants()**:
   - Location: `src/editor/semantic/` (new)
   - Function: Check all role invariants per spec
   - Integrate into compile pipeline

8. **Write comprehensive tests**:
   - Role shape tests
   - Invariant violation tests
   - User block filtering tests
   - Migration tests

### Priority 5: Terminology

9. **Rename "hidden" → "structural" throughout codebase**:
   - Comments, variable names, docs
   - Consistent terminology matching spec

---

## Dependencies & Risks

### Dependencies

**Depends on**:
- None (this is foundational work)

**Blocks**:
- Graph normalization (§16) - needs roles on edges
- Validation system - needs role invariants

### Risks

**Breaking Changes**:
- Making `role` required breaks existing patches
- Changing BlockRole from string to discriminated union breaks existing code
- Removing `hidden` field breaks UI code

**Mitigation**:
- Add migration function for old patches
- Make role optional initially with default, then require later
- Deprecate `hidden` before removing

**Effort Estimate**: Medium (3-5 days)
- Type changes: 1 day
- Update creation sites: 1 day
- Validation: 1 day
- Tests: 1 day
- Migration + cleanup: 1 day

---

## Workflow Recommendation

**CONTINUE** - Issues are clear, implementer can fix.

No ambiguities require research. Design decisions are straightforward:
1. Follow spec types exactly (discriminated unions)
2. Make roles required (with migration)
3. Derive `hidden` from role (or deprecate)
4. Add validation per spec

The main work is mechanical: update types, update creation sites, write tests.

---

## Summary for Implementer

**Current State**: BlockRole exists as simple string union ('defaultSourceProvider' | 'internal'). EdgeRole doesn't exist at all. Both are optional when spec requires them.

**Target State**: Both BlockRole and EdgeRole are discriminated unions with metadata. Both are required fields. Validation checks role invariants.

**Blockers**: None. Spec is clear, existing code just needs to be updated to match.

**Next Steps**:
1. Update BlockRole and EdgeRole types to discriminated unions
2. Add StructuralMeta type
3. Make role fields required (with migration)
4. Update all block/edge creation sites
5. Implement validateRoleInvariants()
6. Write tests
7. Remove/deprecate `hidden` field

**Estimated Effort**: Medium (3-5 days). Straightforward but touches many files.

---

## Files Referenced

### Spec Files
- design-docs/final-System-Invariants/15-Block-Edge-Roles.md (authoritative)
- design-docs/final-System-Invariants/16-Graph-Normalization.md (context)

### Implementation Files
- **src/editor/types.ts** (Block, Edge, BlockRole types)
- **src/editor/stores/PatchStore.ts** (block creation, userBlocks filter)
- **src/editor/compiler/passes/pass0-materialize.ts** (structural block creation)

### Planning Files
- .agent_planning/structural-block-roles/PLAN-2026-01-02-block-edge-roles.md
- .agent_planning/structural-block-roles/DOD-2026-01-02-block-edge-roles.md
- .agent_planning/graph-normalization/EVALUATION-2026-01-03.md (related work)

### Files to Create
- **src/editor/semantic/validateRoleInvariants.ts** (validation function)
- **src/editor/types.test.ts** (role type tests)
- **src/editor/semantic/validateRoleInvariants.test.ts** (validation tests)

---

## Cache Update Recommendations

**Cache these findings** (stable knowledge):
- BlockRole type location and current shape
- EdgeRole missing status
- Spec requirements from §15 and §16
- File locations for role-related code

**Don't cache** (ephemeral):
- Specific line numbers (code changes)
- Test pass/fail status (re-run to verify)
- Git commit hashes (point-in-time)

**Update .agent_planning/eval-cache/INDEX.md**:
```markdown
| Block & Edge Roles Status | structural-block-roles.md | 2026-01-03 13:30 | project-evaluator | HIGH |
```
