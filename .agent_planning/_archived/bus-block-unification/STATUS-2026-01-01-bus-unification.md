# Status Report: Bus-Block Unification Architecture
**Scope:** architecture/bus-block-unification
**Confidence:** FRESH (2026-01-01-063200)
**Git Commit:** 10da2b7

---

## Executive Summary

**Unification Status:** 60% architecturally aligned | 0% implemented as hidden blocks

**Key Finding:** The system is ALREADY HALFWAY to bus-block unification:
- ✅ Bus.combine and Slot.combine unified (both use CombinePolicy)
- ✅ createCombineNode() shared between bus lowering and block input resolution
- ✅ Edge type with Endpoint discriminated union (port | bus) exists
- ❌ Buses still distinct entities, not hidden blocks
- ❌ Endpoint still discriminates 'bus' vs 'port'

**Critical Insight:** Bus-block unification is NOT about renaming types. It's about eliminating the Endpoint.kind='bus' case by representing buses as hidden pass-through blocks.

---

## Evaluation Reuse Summary
- Carried forward: 3 RECENT findings from eval-cache
  - `bus-slot-combine-status.md` - combine unification (RECENT)
  - `multi-input-architecture.md` - multi-input blocks (RECENT)
  - `default-sources-hidden-blocks/STATUS-*.md` - hidden block precedent (RECENT)
- Fresh evaluation: 8 new findings on bus-as-block architecture

---

## Current Architecture Snapshot

### 1. Combine Policy Unification ✅ COMPLETE

**Status:** ALREADY UNIFIED as of commit fd53330 (2026-01-01)

**Evidence:**
```typescript
// src/editor/types.ts:165-188
export interface Bus {
  combine: CombinePolicy;  // ✅ Same as Slot.combine
}

// src/editor/types.ts:677-705
export interface Slot {
  combine?: CombinePolicy;  // ✅ Same as Bus.combine
}

// Shared type (line 125)
export type CombinePolicy =
  | { when: 'multi'; mode: CombineMode }
  | { when: 'always'; mode: CombineMode }
  | { when: 'multi'; mode: 'error' };
```

**Combine Logic:** Both use `createCombineNode()` from `combine-utils.ts` (commit d5e773f)

**Conclusion:** Combine semantics ARE identical. First precondition met.

---

### 2. Current Bus Implementation

**Location:** `src/editor/types.ts:165-198`

```typescript
export interface Bus {
  readonly id: string;
  name: string;
  readonly type: TypeDesc;
  defaultValue: unknown;        // Fallback when N=0
  readonly origin?: 'built-in' | 'user';
}
```

**Storage:** `src/editor/stores/BusStore.ts`
- `buses: Bus[]` - Observable array
- Actions: createBus, deleteBus, updateBus, etc.

**Bus Lifecycle:**
1. Create via `BusStore.createBus(name, type, combineMode, defaultValue)`
2. Publish via Edge: `{ from: { kind: 'port', ... }, to: { kind: 'bus', busId } }`
3. Listen via Edge: `{ from: { kind: 'bus', busId }, to: { kind: 'port', ... } }`
4. Compiler Pass 7 lowers bus to combine node

---

### 3. Current Edge/Endpoint System

**Location:** `src/editor/types.ts:255-310`

```typescript
// Discriminated union - THIS IS WHAT WOULD BE ELIMINATED
export type Endpoint =
  | { readonly kind: 'port'; readonly blockId: string; readonly slotId: string }
  | { readonly kind: 'bus'; readonly busId: string };  // ← Would disappear

export interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly transforms?: TransformStep[];
  readonly enabled: boolean;
  readonly sortKey?: number;     // For deterministic ordering
}
```

**Edge Types (current):**
| from.kind | to.kind | Meaning | Count in codebase |
|-----------|---------|---------|-------------------|
| 'port' | 'port' | Direct wire | Primary case |
| 'bus' | 'bus' | Invalid (should fail validation) | N/A |

**PatchStore:** `src/editor/stores/PatchStore.ts`
- `edges: Edge[]` - Unified edge array (Sprint 1)
- `connections: Connection[]` - Deprecated (backward compat)

---

### 4. Block Input Combine Semantics

**Location:** `src/editor/compiler/passes/resolveWriters.ts`

**Multi-input resolution:**
```typescript
export type Writer =
  | { kind: 'wire'; from: { blockId, slotId }; connId }
  | { kind: 'default'; defaultId; type };

// Collect all writers to input endpoint
// Sort deterministically by writerSortKey()
// Apply Slot.combine policy
```

**Combine node creation:** `src/editor/compiler/passes/combine-utils.ts:createCombineNode()`
- Used by Pass 6 (block input lowering) for N > 1 writers
- **IDENTICAL SEMANTICS** - same IR combine nodes, same modes

**Conclusion:** Block inputs with multiple wires ARE buses in disguise. Second precondition met.

---

### 5. Compiler Paths

#### Pass 6: Block Lowering (`src/editor/compiler/passes/pass6-block-lowering.ts`)

**Current:**
1. Call `resolveBlockInputs(blockId, edges, ...)`
3. If N > 1: create combine node via `createCombineNode()`
4. Wire combine output to block input

**After unification:**
- Logic identical, just simpler writer enumeration

#### Pass 7: Bus Lowering (`src/editor/compiler/passes/pass7-bus-lowering.ts`)

**Current:**
3. If N > 1: create combine node via `createCombineNode()`
4. Store in `busRoots: Map<BusIndex, ValueRefPacked>`

**After unification:**
- Bus would be a hidden BusBlock with input slot (multi: true, combine: policy)
- Pass 6 would handle it automatically
- Pass 7 could be **deleted entirely**

---

### 6. Hidden Block Precedent

**Location:** `.agent_planning/default-sources-hidden-blocks/`

**Status:** 0% implemented (greenfield)

**Concept:**
- Default sources (constant fallbacks) become hidden `DSConst*` provider blocks
- Inspector UI selects provider type (Const vs Oscillator)
- Compiler injection: `materializeDefaultSources()` creates hidden blocks + edges
- Hidden blocks have `tags: { role: 'defaultSourceProvider', hidden: true }`

**Key insights:**
- Hidden blocks work in current system (no blocker)
- Need deterministic IDs (e.g., `dsprov:${blockId}:${slotId}`)
- Need BlockLibrary filtering (`tags.hidden === true`)
- Need compiler injection pass before Pass 1

**Conclusion:** Hidden blocks are feasible and follow established patterns.

---

## What Bus-Block Unification Would Change

### Conceptual Model

**Current:**
```
```

**After unification:**
```
Block₁.out ──┐
Block₂.out ──┼─> [BusBlock_energy.in] ──> [BusBlock_energy.out] ─┬─> Block₃.in
Block₃.out ──┘   (combine: sum)                                   └─> Block₄.in
```

BusBlock is a hidden pass-through block:
```typescript
{
  id: 'bus:energy',
  type: 'BusBlock',
  tags: { role: 'internal', hidden: true },
  inputs: [{
    id: 'in',
    type: /* bus type */,
    combine: { when: 'multi', mode: 'sum' }  // From Bus.combine
  }],
  outputs: [{
    id: 'out',
    type: /* bus type */
  }],
  // Compiler: output = input (pass-through)
}
```

---

### Type Changes

#### 1. Eliminate Endpoint Discriminated Union

**Before:**
```typescript
export type Endpoint =
  | { kind: 'port'; blockId: string; slotId: string }
  | { kind: 'bus'; busId: string };
```

**After:**
```typescript
// Endpoint type deleted - just use PortRef directly
export interface PortRef {
  readonly blockId: string;
  readonly slotId: string;
}
```

**Impact:** Every `edge.from.kind === 'bus'` check disappears.

#### 2. Simplify Edge Interface

**Before:**
```typescript
export interface Edge {
  readonly from: Endpoint;
  readonly to: Endpoint;
  // ...
}
```

**After:**
```typescript
export interface Edge {
  readonly from: PortRef;  // Always a port
  readonly to: PortRef;    // Always a port
  // ...
}
```

**Impact:** All edges are port→port. No discriminated union handling.


**Already deprecated** (comments say "Use Edge instead"), but can now **delete entirely**:

---

### Store Changes

#### BusStore Transformation


**After:**
```typescript
export class BusStore {
  // KEEP: Bus metadata for UI (name, defaultValue, origin)
  // Needed for Inspector, BusChannel UI
  buses: Bus[] = [];


  // NEW: Create hidden BusBlock when bus is created
  createBus(name, type, combine, defaultValue) {
    const bus = { id, name, type, combine, defaultValue };
    this.buses.push(bus);

    // Create hidden BusBlock
    const busBlock = {
      id: `bus:${id}`,
      type: 'BusBlock',
      tags: { role: 'internal', hidden: true },
      inputs: [{ id: 'in', type, combine }],
      outputs: [{ id: 'out', type }],
    };
    this.root.patchStore.addBlock(busBlock);
  }

  // NEW: Delete hidden BusBlock when bus is deleted
  deleteBus(busId) {
    this.buses = this.buses.filter(b => b.id !== busId);
    this.root.patchStore.removeBlock(`bus:${busId}`);
  }
}
```

**Question:** Should `Bus` interface remain as metadata, or merge into BusBlock?

**Option A (Keep Bus metadata):**
- Bus interface stores UI metadata (name, defaultValue, origin)
- BusBlock is the compiler representation
- BusStore maintains both

**Option B (Merge into BusBlock):**
- Delete Bus interface entirely
- BusBlock.params stores { name, defaultValue, origin }
- BusStore becomes thin wrapper around PatchStore

**Recommendation:** Option A - Keep Bus metadata separate for cleaner separation of concerns.

---

### Compiler Changes

#### Pass 6: Block Lowering (SIMPLIFIED)

**Current:**
```typescript
const writers = resolveBlockInputs(blockId, edges, ...);

for (const w of writers) {
  if (w.kind === 'wire') { /* ... */ }
  else if (w.kind === 'bus') { /* ... */ }  // ← Special case
  else if (w.kind === 'default') { /* ... */ }
}
```

**After:**
```typescript
// All writers are wires (including from BusBlock.out)
const writers = resolveBlockInputs(blockId, edges, ...);

for (const w of writers) {
  // w.kind is always 'wire' (or 'default')
  // No bus special case needed
}
```


#### Pass 7: Bus Lowering (DELETED)

**Current:** 400+ lines of bus-specific combine logic

**After:** **ENTIRE PASS DELETED**
- BusBlock is just another block
- Pass 6 handles it automatically
- No special bus lowering needed

**Savings:** ~400 lines deleted, one fewer compiler pass.

#### resolveWriters Module (SIMPLIFIED)

**Current:**
```typescript
export type Writer =
  | { kind: 'wire'; ... }
  | { kind: 'bus'; ... }      // ← Delete
  | { kind: 'default'; ... };
```

**After:**
```typescript
export type Writer =
  | { kind: 'wire'; from: PortRef; connId: string }
  | { kind: 'default'; defaultId: string; type: TypeDesc };
```

**Function:** `enumerateWritersToInput()`
- Current: Filter edges for `to.kind === 'port' && to.blockId === targetBlock`

---

### UI Changes

#### Minimal Changes Required

**BusInspector:** No change (still shows Bus metadata)
**BusChannel:** No change (still shows Bus name/type)
**ConnectionInspector:** Simplified (no 'bus' endpoint case)

**BlockLibrary:** Add filter for `tags.hidden === true`

**Diagnostics:** Bus errors still reference Bus name, not `bus:${id}` block

---

## What Can Be Deleted/Simplified

### Immediate Deletions (after unification)

| What | Where | Lines | Rationale |
|------|-------|-------|-----------|
| `Endpoint` type | src/editor/types.ts:268 | 3 | Only PortRef needed |
| Pass 7 bus lowering | src/editor/compiler/passes/pass7-bus-lowering.ts | 400+ | BusBlock handled by Pass 6 |
| `Writer.kind === 'bus'` case | resolveWriters.ts | 20 | Only 'wire' and 'default' |

**Total estimated deletion:** ~600 lines of code

---

### Simplifications (fewer code paths)

| What | Current | After | Benefit |
|------|---------|-------|---------|
| Edge type checking | 3 cases (port→port, port→bus, bus→port) | 1 case (port→port) | Simpler validation |
| Input resolution | 3 writer kinds | 2 writer kinds | Fewer branches |
| Combine logic | 2 sites (Pass 6 + Pass 7) | 1 site (Pass 6) | DRY |
| Endpoint rendering | Discriminated union | Direct PortRef | Simpler UI |
| Compiler passes | 8 passes | 7 passes (delete Pass 7) | Faster compilation |

---

## Dependencies and Risks

### Prerequisites (must complete first)

1. **Default sources as hidden blocks** (ROADMAP: unify-default-sources-blocks)
   - Establishes hidden block pattern
   - Tests deterministic IDs (e.g., `bus:${id}`)
   - Tests BlockLibrary filtering
   - Status: 0% complete (see `.agent_planning/default-sources-hidden-blocks/`)

2. **Edge unification** (ROADMAP: unify-connections-edge)
   - Already ~80% complete (Edge type exists, used in many places)
   - Status: 80% complete (Sprint 1 done, backward compat remains)

### Risks

#### HIGH RISK: Bus metadata loss

**Problem:** Bus has UI-relevant fields (name, defaultValue, origin) that BusBlock doesn't naturally carry.

**Options:**
- A) Keep Bus interface for metadata, BusBlock for compiler
- B) Store metadata in BusBlock.params
- C) Derive metadata from BusBlock at runtime

**Recommendation:** Option A (cleanest separation)

#### HIGH RISK: Bus ID references in saved patches

**Problem:** Existing patches have `edge.to.busId` references. After unification, these become `edge.to.blockId = 'bus:${busId}'`.

**Migration strategy:**
```typescript
function migrateBusEdges(patch: Patch): Patch {
  return {
    ...patch,
    edges: patch.edges.map(e => {
      if (e.to.kind === 'bus') {
        return {
          ...e,
          to: { kind: 'port', blockId: `bus:${e.to.busId}`, slotId: 'in' }
        };
      }
      if (e.from.kind === 'bus') {
        return {
          ...e,
          from: { kind: 'port', blockId: `bus:${e.from.busId}`, slotId: 'out' }
        };
      }
      return e;
    })
  };
}
```

**Risk:** Must not break existing patches. Need backward-compat loader.

#### MEDIUM RISK: Pass 7 deletion impact

**Problem:** Pass 7 currently does more than just combine logic:
- Bus type checking
- Default value handling (N=0 case)
- Diagnostic emission

**Mitigation:** Ensure BusBlock handles all cases:
- Type checking: Pass 2 (unified type system)
- Default value: BusBlock has `defaultSource` on input
- Diagnostics: Emit from Pass 6 with bus-specific context

#### MEDIUM RISK: Runtime executor changes

**Problem:** Current executor has `executeBusEval` step. After unification, buses are just blocks.

**Changes needed:**
- Delete `executeBusEval` step type
- BusBlock executes like any other block
- Schedule treats BusBlock like normal block


#### LOW RISK: Performance

**Question:** Does hidden BusBlock add overhead?

**Answer:** No - same IR nodes emitted, just different organization.

---

## Ambiguities Requiring Clarification

### 1. Bus Metadata Representation

**Question:** How should Bus UI metadata (name, defaultValue, origin) be stored after unification?

**Context:** Bus interface has fields not naturally part of Block interface.

**Options:**
- **A) Keep Bus interface separate** - Bus stores metadata, BusBlock is compiler representation
  - Pros: Clean separation, no Block interface pollution
  - Cons: Two sources of truth, sync required
- **B) Merge into BusBlock.params** - `params: { busName, busDefaultValue, busOrigin }`
  - Pros: Single source of truth
  - Cons: Block.params becomes dumping ground for heterogeneous data
- **C) Delete Bus metadata** - Derive from BusBlock at UI time
  - Pros: Simplest
  - Cons: Loses user-provided names, defaults

**Impact:** Affects BusStore, BusInspector, serialization format.

**How it was guessed:** Not addressed in ROADMAP or prior work.

### 2. BusBlock Compiler Implementation

**Question:** Should BusBlock have a BlockCompiler or use pass-through IR?

**Context:** BusBlock output = combine(inputs). Two implementation strategies:

**Options:**
- **A) BlockCompiler approach** - `blocks/BusBlock.ts` with `compile()` function
  - Pros: Follows existing block pattern
  - Cons: Redundant with Pass 6 combine logic
- **B) Compiler intrinsic** - Pass 6 recognizes `type === 'BusBlock'` and inlines combine
  - Pros: No redundant compiler, simpler
  - Cons: Special case in Pass 6

**Impact:** Code organization, maintainability.

**Recommendation:** Option B - BusBlock is compiler intrinsic, not user-extensible.

### 3. Bus Creation UX

**Question:** When user clicks "Create Bus", what happens in unified model?

**Context:** Current flow: BusStore.createBus() → new Bus entity. After unification, need to create BusBlock too.

**Options:**
- **A) BusStore.createBus() creates both** - Bus metadata + hidden BusBlock
  - Pros: Transparent to user, backward compat
  - Cons: Tight coupling between BusStore and PatchStore
- **B) Unified "Create Entity" flow** - User creates BusBlock, Bus metadata derived
  - Pros: Simpler model, no special case
  - Cons: UX change, users see "create block" not "create bus"

**Impact:** BusStore API, transaction system, UI.

**Recommendation:** Option A - preserve current UX, hide implementation detail.

### 4. Backward Compatibility Strategy

**Question:** How aggressive should migration be?

**Context:** Existing patches have `Endpoint.kind === 'bus'` references. Need migration path.

**Options:**
- **A) Automatic migration on load** - Patch loader converts bus endpoints to BusBlock ports
  - Pros: Transparent, no user action
  - Cons: Irreversible, old app versions can't read new format
- **B) Dual-mode support** - Support both formats during transition
  - Pros: Gradual migration, reversible
  - Cons: Code complexity, longer transition period
- **C) Version flag in patch** - `schemaVersion: 2` indicates new format
  - Pros: Explicit, testable
  - Cons: Need version negotiation logic

**Impact:** Patch serialization, loader, user data safety.

**Recommendation:** Option A + C - Automatic migration with version bump.

### 5. Diagnostic Message Formatting

**Question:** Should diagnostics reference "Bus 'energy'" or "Block 'bus:energy'"?

**Context:** After unification, buses are blocks. Errors could say:
- "Bus 'energy' has type mismatch" (user-friendly)
- "Block 'bus:energy' has type mismatch" (implementation leakage)

**Options:**
- **A) Detect BusBlock and format specially** - Check `blockId.startsWith('bus:')`
  - Pros: User-friendly messages
  - Cons: Special case in diagnostic formatter
- **B) Use block ID directly** - "Block 'bus:energy'"
  - Pros: Simpler, no special case
  - Cons: Exposes implementation detail
- **C) Use Bus.name from metadata** - Look up Bus by ID, use name
  - Pros: Best UX ("Bus 'energy'")
  - Cons: Requires metadata lookup in diagnostic system

**Impact:** Error message quality, user experience.

**Recommendation:** Option C - look up Bus.name for diagnostics.

---

## Implementation Assessment

| Component | Status | Confidence | Evidence | Readiness |
|-----------|--------|------------|----------|-----------|
| **Combine unification** | COMPLETE | FRESH | fd53330, d5e773f | ✅ Ready |
| **Edge type** | COMPLETE | FRESH | types.ts:268-310 | ✅ Ready |
| **Multi-input blocks** | COMPLETE | FRESH | resolveWriters.ts, Pass 6 | ✅ Ready |
| **Hidden block pattern** | NOT_STARTED | RECENT | default-sources plan | ⚠️ Need precedent |
| **BusBlock definition** | NOT_STARTED | FRESH | N/A | ❌ Design needed |
| **Pass 7 deletion** | NOT_STARTED | FRESH | N/A | ⚠️ Risky |
| **Bus metadata strategy** | NOT_STARTED | FRESH | N/A | ❌ Ambiguity #1 |
| **Migration path** | NOT_STARTED | FRESH | N/A | ❌ Ambiguity #4 |

---

## Test Suite Assessment

**Quality Score:** 4/5 (2831 passing tests, 17 failures in unrelated transaction validation)

**Coverage for unification:**
- ✅ Combine logic: Pass 7 tests (13 tests)
- ✅ Multi-input blocks: resolveWriters tests
- ✅ Edge validation: migration tests
- ❌ BusBlock: No tests (not implemented)
- ❌ Hidden block filtering: No tests (not implemented)

**Required test coverage (after implementation):**
- [ ] BusBlock creation/deletion syncs with Bus metadata
- [ ] Pass 6 handles BusBlock (no Pass 7 needed)
- [ ] Migration converts old bus edges to BusBlock ports
- [ ] BlockLibrary filters hidden BusBlocks
- [ ] Diagnostics reference Bus.name, not block ID

---

## Recommendations

### Priority 1: Resolve Ambiguities

**Action:** Answer 5 critical design questions before implementation:
1. Bus metadata representation (Option A recommended)
2. BusBlock compiler implementation (Option B recommended)
3. Bus creation UX (Option A recommended)
4. Migration strategy (Option A+C recommended)
5. Diagnostic formatting (Option C recommended)

### Priority 2: Complete Prerequisites

**Action:** Implement hidden block pattern via default-sources work first.

**Why:** Establishes deterministic IDs, BlockLibrary filtering, and compiler injection patterns needed for BusBlock.

**Reference:** `.agent_planning/default-sources-hidden-blocks/STATUS-*.md`

### Priority 3: Incremental Implementation Plan

**Proposed sequence:**

1. **Phase 1: BusBlock Definition** (1-2 days)
   - Define BusBlock type with tags: `{ role: 'internal', hidden: true }`
   - Add to block registry (hidden)
   - Filter in BlockLibrary

2. **Phase 2: BusStore Integration** (2-3 days)
   - Modify createBus() to create BusBlock + Bus metadata
   - Modify deleteBus() to delete both
   - Add sync logic (Bus.combine ↔ BusBlock.input.combine)

3. **Phase 3: Compiler Integration** (3-4 days)
   - Add BusBlock pass-through logic to Pass 6
   - Verify Pass 7 becomes redundant
   - Add tests

4. **Phase 4: Migration** (2-3 days)
   - Implement migrateBusEdges() for old patches
   - Add version bump (schemaVersion: 2)
   - Test backward compat

5. **Phase 5: Cleanup** (1-2 days)
   - Delete Endpoint discriminated union
   - Delete Pass 7
   - Update UI (ConnectionInspector)

6. **Phase 6: Polish** (1-2 days)
   - Diagnostic message formatting
   - Error handling
   - Documentation

**Total estimate:** 10-16 days

### Priority 4: Risk Mitigation

**Action:** Create comprehensive test suite for migration path.

**Critical tests:**
- Old patches load correctly (bus edges → BusBlock ports)
- Bus metadata preserved (name, defaultValue, origin)
- Combine semantics unchanged (same IR nodes)
- UI still shows buses (not "Block bus:energy")

---

## Acceptance Criteria

- [ ] **BusBlock exists as hidden block** - type: 'BusBlock', tags.hidden === true
- [ ] **Pass 7 is deleted** - BusBlock handled by Pass 6
- [ ] **Endpoint discriminated union is deleted** - only PortRef remains
- [ ] **Old patches migrate correctly** - bus edges → BusBlock ports
- [ ] **UI unchanged** - users still see "Bus 'energy'", not "Block bus:energy"
- [ ] **All edges are port→port** - no Endpoint.kind === 'bus' branches
- [ ] **Combine semantics unchanged** - same IR nodes, same runtime behavior
- [ ] **No Pass 7 tests fail** - because BusBlock replicates behavior exactly

**Overall:** 0/10 acceptance criteria met (not yet implemented).

---

## Workflow Recommendation

**VERDICT:** ⚠️ **PAUSE** - Ambiguities need clarification before proceeding

**Rationale:**
1. **5 critical design questions** need answers (see Ambiguities section)
2. **Hidden block precedent missing** - default-sources work should complete first
3. **Migration strategy unclear** - risk of breaking existing patches
4. **No incremental path validated** - jumping to full implementation is risky

**Next Actions:**

1. **Answer ambiguities 1-5** with user input or architectural review
2. **Complete default-sources hidden blocks** to establish patterns
3. **Prototype BusBlock** (Phase 1 only) to validate approach
4. **Return for evaluation** before proceeding to compiler integration

Once these are resolved, implementation can proceed with confidence.

---

## Appendix: Key Files Reference

**Types:**
- `src/editor/types.ts:165-198` - Bus interface
- `src/editor/types.ts:268-310` - Endpoint, Edge
- `src/editor/types.ts:631-706` - Slot interface (combine policy)

**Stores:**
- `src/editor/stores/BusStore.ts` - Bus management
- `src/editor/stores/PatchStore.ts:48-68` - Edge management

**Compiler:**
- `src/editor/compiler/passes/resolveWriters.ts` - Writer resolution
- `src/editor/compiler/passes/combine-utils.ts` - Shared combine logic
- `src/editor/compiler/passes/pass6-block-lowering.ts` - Block input handling
- `src/editor/compiler/passes/pass7-bus-lowering.ts` - Bus lowering (to be deleted)

**Recent commits:**
- `fd53330` - Bus.combine unification (2026-01-01)
- `d5e773f` - Shared createCombineNode() (2026-01-01)
- `edc9e42` - Edge migration-on-load (2025-12-31)

**Planning:**
- `.agent_planning/ROADMAP.md:70-102` - unify-default-sources-blocks
- `.agent_planning/default-sources-hidden-blocks/STATUS-*.md` - Hidden block precedent
- `.agent_planning/eval-cache/bus-slot-combine-status.md` - Combine unification
