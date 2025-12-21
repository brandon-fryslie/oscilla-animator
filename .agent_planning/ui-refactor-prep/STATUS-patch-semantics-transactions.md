# Status: Patch Semantics & Transaction System
**Evaluation Date**: 2025-12-21
**Scope**: Patch semantics kernel, operation system, transaction builder
**Evaluator**: project-evaluator

---

## Executive Summary

**Overall Completion**: 15% (Foundations only)
**Critical Issues**: 3 major gaps
**Status**: SUBSTANTIAL WORK REQUIRED

### What Exists (15%)
- ✅ SemanticGraph with indices (graph.ts) - COMPLETE
- ✅ Validator with structural rules (validator.ts) - PARTIAL
- ✅ PortKey canonical identity (types.ts) - COMPLETE
- ✅ PatchDocument adapter (patchAdapter.ts) - COMPLETE

### What's Missing (85%)
- ❌ Transaction builder API (0%)
- ❌ Operation types and apply/invert (0%)
- ❌ TxView query surface (0%)
- ❌ History tree persistence (0%)
- ❌ Mutation through ops (PatchStore still uses direct mutation)

---

## What the Specs Require

### 1. Semantic Kernel (7-PatchSemantics.md)

**Core Responsibilities:**
1. Define canonical patch semantics (independent of UI)
2. Enforce structural validity through validation
3. Produce SemanticGraph for all consumers
4. Provide actionable diagnostics with suggested fixes
5. Support incremental validation

**Key Invariants:**
- Canonical port identity: `PortRef = { blockId, slotId, dir }`
- Three relationship primitives: WireEdge, PublishEdge, ListenEdge
- Everything else (macros, composites) compiles down to these
- One ruleset shared by UI, compiler, and diagnostics

**Current State:**
- ✅ SemanticGraph indices implemented correctly
- ✅ Port identity using canonical PortKey
- ✅ WireEdge, PublisherEdge, ListenerEdge types defined
- ⚠️ Validator exists but incomplete (missing adapter validation, implicit bindings)
- ❌ No suggested fixes system
- ❌ No incremental validation hooks

---

### 2. Operations System (8-PatchOpsCompleteSet.md)

**Required Op Types (26 total):**

**Blocks (5)**:
- BlockAdd, BlockRemove, BlockRetype, BlockSetLabel, BlockPatchParams

**Wires (3)**:
- WireAdd, WireRemove, WireRetarget

**Buses (3)**:
- BusAdd, BusRemove, BusUpdate

**Publishers/Listeners (6)**:
- PublisherAdd, PublisherRemove, PublisherUpdate
- ListenerAdd, ListenerRemove, ListenerUpdate

**Composites (4)**:
- CompositeDefAdd, CompositeDefRemove, CompositeDefUpdate, CompositeDefReplaceGraph

**Time/Settings (2)**:
- TimeRootSet, PatchSettingsUpdate

**Assets (3, optional for now)**:
- AssetAdd, AssetRemove, AssetUpdate

**Key Invariants:**
1. Every op is serializable, invertible, kernel-validated
2. Ops reference stable IDs only (never array indices or names)
3. Removals cascade to explicit removal ops (no hidden mutation)
4. Deterministic op ordering within transactions

**Current State:**
- ❌ No Op types defined
- ❌ No apply/invert functions
- ❌ No cascade expansion logic
- ✅ PatchStore has action methods, but they mutate directly (not op-based)

**Evidence:**
```typescript
// Current PatchStore mutations (direct, not op-based):
addBlock(type, laneId, params) { this.blocks.push(...) }
removeBlock(id) { this.blocks = this.blocks.filter(...) }
connect(from, to) { this.connections.push(...) }
```

These need to become:
```typescript
kernel.transaction('Add Block', tx => {
  tx.addBlock({ type, params })
  tx.commit()
})
```

---

### 3. Transaction Builder Contract (9-TransactionBuilderContract.md)

**Required API:**

```typescript
interface PatchKernel {
  readonly doc: PatchDocument
  readonly graph: SemanticGraph
  readonly report: ValidationReport

  transaction<R>(meta: TxMeta, build: (tx: TxBuilder) => R): TxResult<R>
  applyTx(tx: CommittedTx): ApplyTxResult

  undo(): ApplyTxResult
  redo(branchId?: BranchId): ApplyTxResult
  checkout(nodeId: TxId): ApplyTxResult

  exportHistory(): PersistedHistory
  importHistory(data: PersistedHistory): void
}

interface TxBuilder {
  readonly view: TxView  // Read-only staged state

  // High-level helpers (emit ops internally)
  addBlock(spec): BlockId
  removeBlock(blockId): void
  // ... all 26 op types as methods

  commit(): void  // Explicit commit
  abort(reason?): void
}
```

**Key Features:**
1. **Atomic commits**: All ops succeed or none do
2. **Staged view**: `tx.view` shows state as-if ops already applied
3. **Explicit commit**: Transactions can be previewed without mutation
4. **No async**: Callback cannot return Promise (enforced by TypeScript)
5. **Invertible**: Every committed tx stores inverseOps for undo
6. **History tree**: DAG of committed transactions, no truncation

**Current State:**
- ❌ No PatchKernel interface
- ❌ No TxBuilder interface
- ❌ No transaction mechanism
- ❌ No history tree
- ❌ No undo/redo beyond basic MobX reactions

---

### 4. TxView Query Surface (10-TxView-Query-Surface.md)

**Required Query APIs:**

```typescript
interface TxView {
  // Entity lookup
  getBlock(blockId): Block | null
  getBus(busId): Bus | null
  getPort(ref: PortRef): PortInfo | null

  // Neighborhood queries
  getIncoming(ref: PortRef): IncomingSummary
  getOutgoing(ref: PortRef): OutgoingSummary
  getBusPublishers(busId): Publisher[]
  getBusListeners(busId): Listener[]

  // Time topology
  readonly time: TimeTopologyView

  // Compatibility and suggestions
  actions(): ActionsAPI
  diagnostics(): DiagnosticsAPI
}

interface ActionsAPI {
  canWire(from, to): CapabilityCheck
  canListen(to, busId): ListenCapability
  canPublish(from, busId): PublishCapability

  listCompatibleBusesForInput(to): BusCandidate[]
  listCompatibleBusesForOutput(from): BusCandidate[]
  suggestBlockInsertions(target): BlockInsertionSuggestion[]
  listRetypeOptions(blockId): RetypeCandidate[]

  buildFix(fixId): PlannedTransaction
}
```

**Purpose:**
- All UI compatibility menus query this, not ad-hoc type checks
- All "suggested fixes" come from diagnostics API
- No UI implements its own compatibility logic

**Current State:**
- ❌ No TxView interface
- ❌ No ActionsAPI
- ❌ No DiagnosticsAPI with fixes
- ⚠️ Validator has `canAddConnection()` - partial preflight check
- ❌ UI currently does ad-hoc compatibility checks scattered across components

---

## Current Implementation State

### Implemented (src/editor/semantic/)

**1. graph.ts** - SemanticGraph ✅ (95% complete)
- Builds indices from PatchDocument
- Supports wire, publisher, listener edges
- Cycle detection (Tarjan's SCC algorithm)
- Incremental query methods
- **Gap**: No incremental update methods (rebuild only)

**2. validator.ts** - Validator ⚠️ (60% complete)
- Validates TimeRoot constraint (exactly one)
- Validates unique writers per input
- Validates connection type compatibility
- Validates no cycles
- Validates endpoint existence
- Warns on empty buses
- Preflight check: `canAddConnection()`

**Missing from Validator:**
- Adapter chain validation
- Implicit binding resolution (e.g., "phase defaults to phaseA")
- Suggested fixes generation
- Delta validation (incremental)
- Publisher sortKey ordering validation
- Bus type compatibility checks

**3. types.ts** - Core types ✅ (100% complete)
- PortKey canonical identity
- GraphNode, GraphEdge union types
- PatchDocument minimal interface
- ValidationResult structure
- Utility functions for PortKey conversion

**4. patchAdapter.ts** - Store adapter ✅ (100% complete)
- Converts RootStore → PatchDocument
- Lightweight, reference-based (no cloning)

**5. __tests__/** - Tests ✅ (Partial)
- graph.test.ts: SemanticGraph construction and queries
- validator.test.ts: Basic validation rules
- **Gap**: No transaction tests (transactions don't exist yet)

---

### Not Implemented

**1. Op Types** ❌
- No Op union type defined
- No apply functions per op type
- No invert functions per op type
- No cascade expansion (e.g., BlockRemove → WireRemove* → BlockRemove)

**2. Transaction Builder** ❌
- No PatchKernel class
- No TxBuilder class
- No transaction lifecycle (preflight → apply → validate → commit)
- No staged view (TxView)

**3. History Tree** ❌
- No CommittedTx storage
- No DAG structure for undo/redo
- No persistence format (PersistedHistory)
- No checkout/branch mechanism

**4. TxView Query Surface** ❌
- No ActionsAPI for compatibility queries
- No DiagnosticsAPI with fixes
- No TimeTopologyView
- No PortInfo/IncomingSummary/OutgoingSummary types

**5. Integration with PatchStore** ❌
- PatchStore still uses direct MobX mutations
- No kernel.transaction() calls
- No op emission from store actions
- GraphCommitted events exist, but not tied to transactions

---

## Dependencies and Blockers

### Hard Blockers

**None** - All prerequisites exist:
- ✅ SemanticGraph provides the indices
- ✅ Validator provides the validation rules
- ✅ Block registry provides type definitions
- ✅ MobX store structure is stable

### Soft Dependencies (Design Decisions Needed)

1. **Cascade Policy**
   - Spec recommends: Kernel expands cascades into explicit ops
   - Decision needed: When BlockRemove(id), should inverseOps store the removed wires/bindings?
   - **Recommendation**: Yes - store expanded ops for full invertibility

2. **Validation Timing**
   - Preflight validation (before apply)?
   - Post-apply delta validation?
   - Both?
   - **Recommendation**: Both - preflight prevents invalid attempts, delta catches emergent issues

3. **Implicit Bindings**
   - Spec mentions "phase exists without wiring" via implicit listeners
   - When/how are these resolved?
   - **Recommendation**: Resolve at compile time, expose in TxView, don't store in doc

4. **Adapter Chain Auto-selection**
   - Spec says kernel can "choose the chain if user didn't specify"
   - Do we implement auto-cast now or defer?
   - **Recommendation**: Defer to Phase 2 - require explicit adapters for now

---

## Implementation Roadmap

### Phase 1: Op Types and Apply (Foundation) - 2-3 days complexity

**Goal**: Define ops, apply logic, no undo yet

1. Define Op union types (all 26 from spec)
2. Implement apply functions per op type
3. Add cascade expansion for removals
4. Test: op application mutates PatchDocument correctly

**Deliverables:**
- `src/editor/semantic/ops.ts` - Op types
- `src/editor/semantic/apply.ts` - Apply functions
- `src/editor/semantic/__tests__/ops.test.ts`

**Blocker for**: Everything else (transactions need ops)

---

### Phase 2: Transaction Builder (Core Mechanism) - 3-4 days complexity

**Goal**: Atomic transactions with commit/abort, no history yet

1. Implement PatchKernel class
2. Implement TxBuilder with staged view
3. Add preflight + post-apply validation
4. Test: transactions validate, commit, abort correctly

**Deliverables:**
- `src/editor/semantic/kernel.ts` - PatchKernel
- `src/editor/semantic/txBuilder.ts` - TxBuilder
- `src/editor/semantic/__tests__/transaction.test.ts`

**Depends on**: Phase 1 (ops)

---

### Phase 3: Inversion and History (Undo/Redo) - 2-3 days complexity

**Goal**: Full undo/redo with history tree

1. Implement invert functions per op type
2. Add CommittedTx storage and DAG structure
3. Implement undo/redo/checkout
4. Add persistence format (save/load history)
5. Test: undo/redo works, branches work, replay works

**Deliverables:**
- `src/editor/semantic/invert.ts` - Invert functions
- `src/editor/semantic/history.ts` - History tree
- `src/editor/semantic/__tests__/history.test.ts`

**Depends on**: Phase 2 (transactions)

---

### Phase 4: TxView Query Surface - 3-4 days complexity

**Goal**: All UI queries go through TxView

1. Implement TxView with PortInfo, IncomingSummary, etc.
2. Implement ActionsAPI (compatibility queries)
3. Implement DiagnosticsAPI with fixes
4. Migrate UI components to use TxView instead of raw stores
5. Test: compatibility menus work, fixes work

**Deliverables:**
- `src/editor/semantic/txView.ts` - TxView + ActionsAPI
- `src/editor/semantic/diagnosticsAPI.ts` - DiagnosticsAPI
- `src/editor/semantic/__tests__/txView.test.ts`

**Depends on**: Phase 2 (TxBuilder provides view)

---

### Phase 5: PatchStore Migration - 2-3 days complexity

**Goal**: Replace direct mutations with transactions

1. Replace PatchStore action methods with kernel.transaction() calls
2. Remove direct array mutations
3. Keep GraphCommitted events, tie to transaction commits
4. Test: all existing UI flows work via transactions

**Deliverables:**
- Modified `src/editor/stores/PatchStore.ts`
- Modified `src/editor/stores/RootStore.ts` (add kernel)

**Depends on**: Phase 2 (transactions exist)

---

## Total Complexity Estimate

**12-17 days complexity** (not time estimates - complexity units)

**Critical Path:**
1. Phase 1 (ops) → 2-3 days
2. Phase 2 (transactions) → 3-4 days
3. Phase 3 (history) → 2-3 days
4. Phase 4 (TxView) → 3-4 days
5. Phase 5 (migration) → 2-3 days

**Parallelizable:**
- Phase 3 and Phase 4 can happen in parallel after Phase 2

---

## Validation Gaps (Current Validator)

### Missing Rules

1. **Bus Type Compatibility**
   - Spec requires: Publisher type must be compatible with bus type (with adapters)
   - Current: Not checked

2. **Adapter Chain Validation**
   - Spec requires: Each adapter step validated, chain type transitions checked
   - Current: Adapters not validated at all

3. **Reserved Bus Names**
   - Spec requires: phaseA, pulse, energy, etc. enforced as reserved
   - Current: No enforcement

4. **TimeRoot Auto-publication**
   - Spec requires: CycleTimeRoot.phase auto-publishes to phaseA
   - Current: Not validated (BusStore handles this manually)

5. **Publisher SortKey Ordering**
   - Spec requires: Publishers sorted deterministically by sortKey
   - Current: SemanticGraph sorts, but not validated as invariant

6. **Implicit Bindings**
   - Spec requires: "phase exists without wiring" resolved deterministically
   - Current: Not implemented

---

## Red Flags and Risks

### 1. Direct Mutation Pattern (HIGH RISK)

**Current Pattern:**
```typescript
// PatchStore.ts line 262
addBlock(type, laneId, params) {
  this.blocks.push(block)  // Direct mutation
  this.emitGraphCommitted(...)
}
```

**Problem:**
- No atomic commits (partial state visible)
- No undo/redo
- No validation before mutation
- No invertibility

**Impact**: Entire store architecture needs refactoring

---

### 2. Scattered Compatibility Checks (MEDIUM RISK)

**Current:**
- UI components do ad-hoc type compatibility checks
- Block drag-and-drop has its own rules
- Inspector has its own validation

**Problem:**
- Rules drift between UI and compiler
- No single source of truth
- Maintenance burden

**Impact**: All UI components need migration to TxView queries

---

### 3. No History Mechanism (LOW RISK)

**Current:**
- No undo/redo beyond MobX reactions
- No branch/checkpoint support
- No replay capability

**Problem:**
- Users can't undo mistakes
- No debugging via replay
- No time-travel

**Impact**: User experience gap, but not a blocker for other work

---

## Test Coverage Assessment

### Existing Tests

**graph.test.ts** ✅
- SemanticGraph construction
- Index queries
- Cycle detection
- Coverage: ~80% of graph.ts

**validator.test.ts** ✅
- TimeRoot constraint
- Multiple writers
- Type compatibility
- Cycle detection
- Coverage: ~70% of validator.ts

**Missing Tests** ❌
- No op application tests (ops don't exist)
- No transaction tests (transactions don't exist)
- No history tests (history doesn't exist)
- No TxView tests (TxView doesn't exist)

---

## Recommendations

### Immediate Next Steps (Priority Order)

1. **Define Op Types** (Phase 1, Start Here)
   - Create `src/editor/semantic/ops.ts`
   - Define all 26 op types from spec
   - Add apply functions (mutate PatchDocument)
   - Test with basic ops (BlockAdd, WireAdd)
   - **Why first**: Everything else depends on ops

2. **Build Transaction Builder** (Phase 2)
   - Create PatchKernel and TxBuilder classes
   - Implement staged view (clone doc, apply ops, query)
   - Add commit/abort logic
   - **Why second**: Unlocks atomic mutations

3. **Migrate One Store Action** (Phase 5, Partial)
   - Pick simplest action: `addBlock()`
   - Rewrite as `kernel.transaction()` call
   - Prove pattern works before migrating all
   - **Why third**: Validates design with real usage

4. **Add Inversion** (Phase 3)
   - Implement invert functions
   - Add history tree
   - Test undo/redo
   - **Why fourth**: Enables user-facing undo

5. **Build TxView** (Phase 4)
   - Implement query APIs
   - Migrate UI to use TxView
   - **Why last**: UI layer, depends on kernel working

---

### Design Clarifications Needed

**Before starting Phase 2, decide:**

1. **Cascade Storage Strategy**
   - Store expanded ops in inverseOps?
   - Or store "removed snapshot" metadata?
   - **Recommendation**: Expanded ops (more verbose, but explicit and replayable)

2. **Implicit Binding Mechanism**
   - Resolve at compile time only?
   - Store in PatchDocument?
   - Show in TxView as virtual bindings?
   - **Recommendation**: Resolve at compile, expose in TxView, don't store

3. **Adapter Auto-selection**
   - Implement now or defer?
   - **Recommendation**: Defer - require explicit adapters for Phase 1-3

---

## Verdict

**Status**: NEEDS SUBSTANTIAL WORK

**Why:**
- Core transaction mechanism missing (0%)
- Op system missing (0%)
- History/undo missing (0%)
- TxView query surface missing (0%)
- Only validation + graph indices exist (15%)

**Can proceed with implementation?** YES

**Blockers?** NONE

**Prerequisites met?** YES
- SemanticGraph provides foundation
- Validator provides rules
- Design specs are complete and clear

**Ready for:** Phase 1 implementation (Op types and apply)

**Next Action:**
1. Read specs 8-PatchOpsCompleteSet.md and 9-TransactionBuilderContract.md again
2. Create `src/editor/semantic/ops.ts` with all 26 op types
3. Implement apply functions for block ops (BlockAdd, BlockRemove, BlockPatchParams)
4. Write tests for op application
5. Iterate until all ops work, then move to Phase 2

---

## Files Referenced

**Design Specs:**
- `/Users/bmf/code/oscilla-animator/design-docs/10-Refactor-for-UI-prep/7-PatchSemantics.md`
- `/Users/bmf/code/oscilla-animator/design-docs/10-Refactor-for-UI-prep/8-PatchOpsCompleteSet.md`
- `/Users/bmf/code/oscilla-animator/design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md`
- `/Users/bmf/code/oscilla-animator/design-docs/10-Refactor-for-UI-prep/10-TxView-Query-Surface.md`

**Implementation:**
- `/Users/bmf/code/oscilla-animator/src/editor/semantic/graph.ts` (✅ Complete)
- `/Users/bmf/code/oscilla-animator/src/editor/semantic/validator.ts` (⚠️ Partial)
- `/Users/bmf/code/oscilla-animator/src/editor/semantic/types.ts` (✅ Complete)
- `/Users/bmf/code/oscilla-animator/src/editor/semantic/patchAdapter.ts` (✅ Complete)
- `/Users/bmf/code/oscilla-animator/src/editor/stores/PatchStore.ts` (❌ Needs migration)

**Tests:**
- `/Users/bmf/code/oscilla-animator/src/editor/semantic/__tests__/graph.test.ts` (✅)
- `/Users/bmf/code/oscilla-animator/src/editor/semantic/__tests__/validator.test.ts` (✅)

---

**Evaluation Complete**
**Timestamp**: 2025-12-21 12:30
**Confidence**: FRESH
