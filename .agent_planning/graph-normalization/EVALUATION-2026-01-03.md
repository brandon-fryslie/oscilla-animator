# Evaluation: Graph Normalization Layer
Timestamp: 2026-01-03-114500
Confidence: FRESH
Git Commit: 1c4bd23
Scope: project/graph-normalization

## Executive Summary

**Target Architecture**: RawGraph → NormalizedGraph separation where the compiler never sees UI concepts (badges, attachments, wire-state markers). Everything must be explicit blocks + edges + roles.

**Current State**: Partial normalization exists but **does not match the spec architecture**.
- Default sources: ✅ Materialized as blocks in pass0-materialize.ts
- Bus system: ✅ Unified to BusBlock (no separate bus entities)
- **MISSING**: No RawGraph/NormalizedGraph separation
- **MISSING**: No anchor-based ID stability for structural artifacts
- **MISSING**: No GraphNormalizer module
- **MISSING**: Wire-state as blocks (not yet implemented)
- **MISSING**: Role metadata on blocks/edges to distinguish user vs structural

**Verdict**: **INCOMPLETE** - Core architecture not yet implemented. Current system has ad-hoc normalization scattered across compiler passes, not the clean separation described in the spec.

---

## Current Architecture (What Exists)

### 1. Patch Type (src/editor/types.ts:790-822)

```typescript
interface Patch {
  blocks: Block[];
  edges: Edge[];
  defaultSources: DefaultSourceState[];  // Legacy system
  defaultSourceAttachments?: DefaultSourceAttachment[];  // Advanced system
  // ... settings, composites
}
```

**Analysis**:
- Single graph representation (no RawGraph/NormalizedGraph split)
- Mixes user blocks and structural artifacts in same array
- Default sources exist as attachments, not explicit blocks (in Patch)
- No role metadata on edges (only blocks have `role?: BlockRole`)

### 2. Pass 0: Materialize Default Sources (src/editor/compiler/passes/pass0-materialize.ts)

**What it does**:
- Scans blocks for unconnected inputs with `defaultSource` metadata
- Creates hidden provider blocks (DSConstSignalFloat, DomainN, etc.)
- Generates deterministic IDs: `${blockId}_default_${slotId}`
- Adds edges from providers to inputs

**Strengths**:
- ✅ Deterministic ID generation (anchor-based on blockId + slotId)
- ✅ Creates explicit blocks + edges for defaults
- ✅ Runs early in pipeline (compiler sees blocks, not attachments)

**Gaps vs Spec**:
- ❌ Not a pure rewrite (mutates CompilerPatch, not RawGraph → NormalizedGraph)
- ❌ No bidirectional mapping (anchor ↔ structural ID)
- ❌ No incremental stability (no previousNormalized reuse)
- ❌ IDs not hashed (spec requires `hash("structNode", anchor)`)
- ❌ Runs inside compiler, not in editor store layer

### 3. Pass 1: Normalize (src/editor/compiler/passes/pass1-normalize.ts)

**What it does**:
- Freezes block IDs to dense indices (BlockIndex)
- Canonicalizes edges (filter enabled, sort by sortKey)
- Creates DefaultSourceAttachment[] for unwired inputs
- Builds const pool for default values

**Analysis**:
- This is NOT graph normalization (it's IR preparation)
- Creates attachments metadata, not explicit blocks
- Works on CompilerPatch (already post-materialization)
- Focus: stable indexing for runtime, not structural artifact management

### 4. Bus System (BusBlock in PatchStore)

**What exists**:
- Buses are BusBlock instances (type === 'BusBlock')
- All edges are port-to-port (no special bus endpoints)

**Strengths**:
- ✅ Buses are explicit blocks (no implicit bus entities)
- ✅ Edges are ordinary port-to-port connections

**Gaps vs Spec**:
- ❌ No anchor-based IDs (`bus:<busId>:<pub|sub>:<typeKey>`)
- ❌ BusBlocks created by user actions, not normalization pass
- ❌ No role metadata on edges to distinguish bus edges from user wires

### 5. PatchStore Mutation Pattern (src/editor/stores/PatchStore.ts)

**Current flow**:
```
User action → PatchStore.addBlock/connect/etc
  → Mutate blocks[] and edges[] directly
  → Emit events (BlockAdded, WireAdded)
  → Emit GraphCommitted
  → Compiler reads Patch, runs pass0-materialize, pass1-normalize
```

**Analysis**:
- No RawGraph vs NormalizedGraph distinction
- Structural artifacts (BusBlocks) created via direct mutations
- Default source providers created by compiler, not editor
- No single "normalize" step - normalization is scattered

---

## Target Architecture (From Spec)

### Module Structure (design-docs/final-System-Invariants/16-Graph-Normalization.md:131-140)

```
src/editor/graph/
├── RawGraphStore.ts       # Authoritative, undoable user intent
├── GraphNormalizer.ts     # Pure function: RawGraph → NormalizedGraph + Mapping
├── StructuralManager.ts   # Policy engine: decides what structural objects must exist
└── StructuralMapping.ts   # Anchor ↔ IDs, for UI selection + incremental stability
```

**None of these modules exist.**

### Type Shapes (Spec lines 143-171)

```typescript
// What the user edits
interface RawGraph {
  blocks: RawBlock[];           // User blocks only
  edges: RawEdge[];             // User edges only
  attachments: Attachment[];    // Default sources, wire-state markers, etc.
}

// What the compiler sees
interface NormalizedGraph {
  blocks: BlockInstance[];      // User + structural blocks
  edges: Edge[];                // User + structural edges
  // No attachments - everything is explicit
}

// Anchor types
type Anchor =
  | { kind: "defaultSource"; blockId: BlockId; port: PortRef; direction: "in" | "out" }
  | { kind: "wireState"; wireId: WireId }
  | { kind: "busJunction"; busId: BusId; role: "pub" | "sub"; typeKey: string };
```

**None of these types exist.**

### Normalization Passes (Spec lines 172-178)

1. **Default sources** → Create structural blocks + edges for unconnected inputs
2. **Bus junctions** → Create explicit junction blocks for bus connections
3. **Wire-state** → Create infrastructure blocks for slew/delay on wires
4. **Final validation** → Type-check, cycle-check, role consistency

**Current state**: Only Pass 1 (default sources) partially exists as pass0-materialize.

---

## Gap Analysis

### What's Missing

| Component | Status | Evidence | Impact |
|-----------|--------|----------|--------|
| **RawGraph type** | MISSING | No separate type for user intent | Compiler sees UI state |
| **NormalizedGraph type** | MISSING | Patch serves both roles | No clean boundary |
| **Anchor types** | MISSING | No anchor system | IDs not stable across edits |
| **GraphNormalizer** | MISSING | No pure normalize() function | Non-deterministic output |
| **StructuralManager** | MISSING | No policy engine | Ad-hoc structural decisions |
| **StructuralMapping** | MISSING | No anchor ↔ ID mapping | Can't track structural artifacts |
| **Role metadata on edges** | MISSING | Only blocks have roles | Can't distinguish wire types |
| **Wire-state blocks** | NOT IMPLEMENTED | No slew/delay infrastructure | Missing feature |
| **Incremental normalization** | MISSING | No previousNormalized reuse | ID churn on every edit |
| **Hash-based IDs** | MISSING | Uses string concat | Not cryptographically stable |

### What Exists (Partial Implementation)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Default source materialization | PARTIAL | pass0-materialize.ts | Creates blocks but inside compiler |
| Deterministic provider IDs | YES | `${blockId}_default_${slotId}` | Anchor-like but not hashed |
| BusBlock unification | YES | PatchStore, pass0-materialize | Buses are blocks, not entities |
| Block role metadata | YES | Block.role?: 'defaultSourceProvider' | Only blocks, not edges |

---

## Data Flow Verification

### Current Flow (What Actually Happens)

```
User creates block
  → PatchStore.addBlock()
  → Block added to blocks[]
  → No normalization

User connects wire
  → PatchStore.connect()
  → Edge added to edges[]
  → No normalization

Compilation triggered
  → editorToPatch() converts Store to CompilerPatch
  → pass0-materialize() adds default source blocks
  → pass1-normalize() creates BlockIndex mapping
  → Later passes compile
```

**Problem**: Normalization happens in compiler, not in editor. No RawGraph/NormalizedGraph separation.

### Target Flow (Spec Requirement)

```
User edits → mutate RawGraph → run normalization → produce NormalizedGraph → compile
```

**Analysis**: This flow does not exist. Current system skips the normalization step in the editor.

---

## Ambiguities & Design Questions

### 1. Where should normalization run?

**Spec says**: "Store flow: user edits → mutate RawGraph → run normalization → produce NormalizedGraph → compile"

**Current reality**: PatchStore directly mutates unified Patch. Compiler runs materialization.

**Question**: Should normalization be:
- **Option A**: Eager (after every edit, PatchStore maintains both RawGraph and NormalizedGraph)
- **Option B**: Lazy (only when compilation requested, like current pass0-materialize)
- **Option C**: Hybrid (maintain RawGraph in store, normalize on-demand for compiler)

**Tradeoff**:
- Eager: Clean separation, but overhead on every edit (undo/redo complexity)
- Lazy: Minimal overhead, but compiler pass location unclear (editor vs compiler?)
- Hybrid: Best of both? But where does normalized graph live?

**Recommendation needed**: Clarify eager vs lazy normalization strategy.

### 2. What is a "RawBlock" vs "Block"?

**Spec shows**: RawGraph has RawBlock[], NormalizedGraph has BlockInstance[]

**Current code**: Only has Block type (no RawBlock)

**Question**: Are these the same type or different?
- If same: Why separate names in spec?
- If different: What's the difference? Hidden field? Role field?

**Impact**: Type system design depends on answer.

### 3. How do roles work for structural artifacts?

**Spec requirement**: "Roles (for debug labeling only)"

**Current state**:
- Blocks have `role?: BlockRole` ('defaultSourceProvider' | 'internal')
- Edges have NO role field

**Question**: Should roles be:
- **Option A**: Metadata only (never affects compilation)
- **Option B**: Used for validation (e.g., reject user edits to structural blocks)
- **Option C**: Used for UI filtering (show/hide structural artifacts)

**Missing spec detail**: How are roles used beyond "debug labeling"?

### 4. Wire-state blocks - what are they?

**Spec mentions**: "Wire-state → Create infrastructure blocks for slew/delay on wires"

**Current code**: No wire-state blocks exist. Edges have optional `transforms?: TransformStep[]` for lenses/adapters.

**Question**: What is "wire-state"?
- Slew rate limiting?
- Delay buffers?
- Something else?

**Impact**: Can't implement what isn't defined. Need spec for wire-state semantics.

### 5. Anchor-based ID hashing

**Spec says**: `structNodeId = hash("structNode", anchor)`

**Question**: What hash function?
- Cryptographic (SHA-256)?
- Fast hash (FNV-1a, xxHash)?
- UUID v5 (deterministic UUID from namespace + name)?

**Tradeoff**:
- Crypto hash: Stable, no collisions, but slower
- Fast hash: Fast but collision risk
- UUID v5: Standard, deterministic, reasonable speed

**Recommendation needed**: Specify hash algorithm.

---

## Test Coverage Assessment

### Existing Tests

**pass1-normalize.test.ts**:
- Tests BlockIndex freezing ✅
- Tests edge canonicalization ✅
- Tests DefaultSourceAttachment creation ✅

**Verdict**: Tests exist for pass1-normalize but that's NOT graph normalization (it's IR prep).

### Missing Tests

No tests exist for:
- ❌ RawGraph → NormalizedGraph conversion
- ❌ Anchor-based ID generation
- ❌ Incremental normalization (ID stability)
- ❌ Structural artifact validation
- ❌ Role metadata handling

**Test Quality**: Can't test what doesn't exist. Need implementation first.

---

## LLM Blind Spots Discovered

### 1. "Normalization" is overloaded

**Problem**: Two different "normalize" concepts in codebase:
- **pass1-normalize.ts**: IR preparation (BlockIndex, const pool)
- **Spec normalization**: RawGraph → NormalizedGraph rewrite

**Risk**: LLM might confuse these. Rename pass1 to "pass1-prepare-ir" or similar.

### 2. Default sources have TWO systems

**Current code has**:
1. `defaultSources: DefaultSourceState[]` (legacy)
2. `defaultSourceAttachments: DefaultSourceAttachment[]` (advanced)
3. `pass0-materialize` (creates blocks)

**Spec expects**: ONE system (attachments in RawGraph, explicit blocks in NormalizedGraph)

**Risk**: LLM might try to unify wrong parts. Need migration plan.

### 3. BusBlock is user-facing AND structural

**Observation**: Users can create BusBlocks manually (via PatchStore.addBus). But buses could also be structural artifacts (auto-created for implicit channels).

**Question**: Are all BusBlocks user-created? Or can normalization create them?

**Risk**: Unclear if BusBlock fits "structural" or "user" classification.

---

## Runtime Check Requirements

### Persistent Checks (run these)

| Check | Command | Purpose | Status |
|-------|---------|---------|--------|
| Type check | `just typecheck` | Catch type errors | PASS |
| Lint | `just check` | Code quality | PASS (with --max-warnings) |
| Tests | `just test` | Unit tests | PASS |

**Recommendation**: Add integration test suite for normalization once implemented.

### Missing Checks (implementer should create)

1. **Normalization determinism test**:
   ```typescript
   // Given same RawGraph, normalize() returns identical NormalizedGraph
   const raw = createTestRawGraph();
   const norm1 = normalize(raw);
   const norm2 = normalize(raw);
   expect(norm1).toEqual(norm2); // Deep equality
   ```

2. **Anchor ID stability test**:
   ```typescript
   // Move a block - structural IDs should NOT change
   const raw1 = createGraphWithBlock('b1', { x: 0, y: 0 });
   const norm1 = normalize(raw1);
   const raw2 = moveBlock(raw1, 'b1', { x: 100, y: 100 });
   const norm2 = normalize(raw2);

   // Structural artifact IDs should be identical
   const structId1 = getStructuralId(norm1, { kind: 'defaultSource', blockId: 'b1', port: 'in', direction: 'in' });
   const structId2 = getStructuralId(norm2, { kind: 'defaultSource', blockId: 'b1', port: 'in', direction: 'in' });
   expect(structId1).toBe(structId2);
   ```

3. **Round-trip test**:
   ```typescript
   // RawGraph → NormalizedGraph → edits → RawGraph should be consistent
   const raw = createTestRawGraph();
   const norm = normalize(raw);
   const mapping = norm.mapping;

   // Edit normalized graph (add structural block)
   const edited = addStructuralBlock(norm, { kind: 'defaultSource', blockId: 'b1', port: 'in' });

   // Reverse mapping should identify structural artifacts
   for (const block of edited.blocks) {
     const anchor = mapping.idToAnchor.get(block.id);
     if (anchor) {
       expect(block.role).toBe('structural'); // Or appropriate role
     }
   }
   ```

---

## Implementation Red Flags

### Current Code Smells

1. **pass0-materialize runs in compiler, not editor**
   - **Why bad**: Compiler should be pure transform of NormalizedGraph
   - **Evidence**: src/editor/compiler/passes/pass0-materialize.ts (compiler module)
   - **Fix**: Move to editor/graph/ module, run in PatchStore

2. **No validation after materialization**
   - **Why bad**: Spec requires "Final validation → Type-check, cycle-check, role consistency"
   - **Evidence**: No validation pass after pass0-materialize
   - **Fix**: Add validation step

3. **Deterministic IDs use string concatenation, not hash**
   - **Why bad**: Spec requires `hash("structNode", anchor)`
   - **Evidence**: `${blockId}_default_${slotId}` (pass0-materialize.ts:94)
   - **Fix**: Implement hash-based ID generation

4. **No incremental normalization support**
   - **Why bad**: Spec says "Can reuse previous mapping to avoid churn"
   - **Evidence**: No previousNormalized parameter anywhere
   - **Fix**: Add incremental normalization

5. **Role metadata only on blocks, not edges**
   - **Why bad**: Can't distinguish user wires from structural edges
   - **Evidence**: Edge type has no role field (types.ts:293-323)
   - **Fix**: Add `role?: EdgeRole` to Edge type

---

## Recommendations

### Priority 1: Architecture Foundation (MUST DO FIRST)

1. **Define type system**:
   - Create RawGraph, NormalizedGraph, Anchor types
   - Add role field to Edge type
   - Clarify RawBlock vs BlockInstance distinction

2. **Create module structure**:
   - mkdir src/editor/graph/
   - Stub out GraphNormalizer.ts, StructuralManager.ts, StructuralMapping.ts
   - Define function signatures

3. **Resolve ambiguities** (block implementation until answered):
   - Clarify eager vs lazy normalization
   - Define wire-state block semantics
   - Specify hash algorithm for anchor IDs
   - Define role semantics (metadata-only vs validation)

### Priority 2: Migrate Existing Code

4. **Move pass0-materialize to GraphNormalizer**:
   - Refactor pass0-materialize as GraphNormalizer.normalizeDefaultSources()
   - Add anchor-based ID generation
   - Add incremental stability (reuse IDs from previousNormalized)

5. **Unify default source systems**:
   - Migrate DefaultSourceState[] → DefaultSourceAttachment[] in RawGraph
   - Remove legacy defaultSources field from Patch

### Priority 3: New Features

6. **Implement wire-state blocks** (if spec is clarified):
   - Define wire-state block types
   - Implement normalization pass for wire-state

7. **Implement bus junction normalization** (if needed):
   - Determine if BusBlocks are structural or user-created
   - If structural: implement anchor-based junction creation

### Priority 4: Validation & Testing

8. **Add validation pass**:
   - Validate structural artifacts have valid anchors
   - Check role consistency
   - Catch cycles (unless mediated by state blocks)

9. **Write integration tests**:
   - Determinism test (same input → same output)
   - ID stability test (anchor-based IDs don't thrash)
   - Round-trip test (RawGraph → NormalizedGraph → edits → valid state)

---

## Workflow Recommendation

**PAUSE** - Ambiguities need clarification before proceeding.

### Critical Questions for User/Researcher

1. **Eager vs lazy normalization?**
   - Context: Where and when does normalization run?
   - Options:
     - A: Eager (every edit triggers normalize)
     - B: Lazy (only on compile)
     - C: Hybrid (maintain RawGraph, normalize on-demand)
   - Impact: Architecture of PatchStore and compiler integration

2. **What is wire-state?**
   - Context: Spec mentions "wire-state infrastructure blocks for slew/delay"
   - Options:
     - A: Slew rate limiting (smooth transitions)
     - B: Delay buffers (temporal offset)
     - C: Something else (specify)
   - Impact: Can't implement without definition

3. **Hash algorithm for anchor IDs?**
   - Context: Spec says `hash("structNode", anchor)` but doesn't specify hash
   - Options:
     - A: SHA-256 (crypto)
     - B: xxHash (fast)
     - C: UUID v5 (standard)
   - Impact: Performance vs collision risk tradeoff

4. **Are BusBlocks user-created or structural?**
   - Context: Users can manually create buses via PatchStore.addBus
   - Options:
     - A: Always user-created (current behavior)
     - B: Can be structural (auto-created by normalization)
     - C: Hybrid (built-in buses are structural, user buses are not)
   - Impact: Determines if buses need anchor-based IDs

---

## Summary for Implementer

**Current State**: Ad-hoc normalization in compiler (pass0-materialize). No RawGraph/NormalizedGraph separation. Default sources work but don't follow spec architecture.

**Target State**: Clean RawGraph → NormalizedGraph pipeline with anchor-based IDs, incremental stability, and role metadata.

**Blockers**:
1. Ambiguities in spec (eager vs lazy, wire-state definition, hash algorithm)
2. Type system not defined (RawGraph, NormalizedGraph, Anchor types missing)
3. Module structure not created (editor/graph/ doesn't exist)

**Next Steps**:
1. User/researcher resolves ambiguities
2. Implementer defines type system and module structure
3. Migrate pass0-materialize to GraphNormalizer
4. Add role metadata to edges
5. Implement validation and tests

**Estimated Effort**: Large (5-7 days). This is a significant architectural refactor touching PatchStore, compiler, and type system.

---

## Files Referenced

- **Spec**: design-docs/final-System-Invariants/16-Graph-Normalization.md
- **Current normalization**: src/editor/compiler/passes/pass0-materialize.ts
- **IR prep**: src/editor/compiler/passes/pass1-normalize.ts
- **Type definitions**: src/editor/types.ts (Patch, Block, Edge)
- **Store**: src/editor/stores/PatchStore.ts
- **IR types**: src/editor/compiler/ir/patches.ts

**No files exist yet** for:
- src/editor/graph/GraphNormalizer.ts
- src/editor/graph/RawGraphStore.ts
- src/editor/graph/StructuralManager.ts
- src/editor/graph/StructuralMapping.ts
