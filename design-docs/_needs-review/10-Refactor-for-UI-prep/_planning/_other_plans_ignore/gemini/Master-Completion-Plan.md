# Master Completion Plan: Core Refactor

This plan outlines all remaining work required to fully implement the architecture described in `design-docs/10-Refactor-for-UI-prep/`. It builds upon the completed Phase 1 (Core Alignment) and organizes the remaining architectural shifts into dependent Work Packages.

**Status:**
- Phase 1 (Core Alignment): **Complete** (TimeRoot, Bus Contracts, Port Identity, Default Sources).
- Phase 2-5: **Pending** (Detailed below).

---

## Work Package 2: The Mutation Kernel (Transactions)
**Goal:** Replace direct store mutation with a safe, reversible, and validated transaction system. This is the "Brain" of the editor.

**References:** `PatchOpsCompleteSet.md`, `TransactionBuilderContract.md`, `TxView-Query-Surface.md`, `DiffSummary.md`

### 2.1. Op Definition & Serialization
- [ ] Define the canonical discriminated union of `Op` types (e.g., `BlockAdd`, `ConnectionRemove`, `BusUpdate`).
- [ ] Ensure every `Op` is JSON-serializable and structurally pure (no runtime objects).

### 2.2. Transaction Builder Implementation
- [ ] Implement `PatchKernel` and `TxBuilder` classes.
- [ ] Implement **Atomic Validation**: `commit()` only succeeds if `Validator` returns OK.
- [ ] Implement **Op Expansion**: High-level actions (e.g., `removeBlock`) must expand to explicit atomic ops (e.g., `removeWire`, `removeListener`, `removeBlock`) for invertibility.
- [ ] Implement **History Tree**: A non-truncating DAG of committed transactions.

### 2.3. TxView (Query Surface)
- [ ] Implement the `TxView` read-only API.
- [ ] Provide canonical queries for UI: `canWire`, `canListen`, `listCompatibleBuses`.
- [ ] Ensure `TxView` reflects "staged" states during transaction building (optimistic updates).

### 2.4. DiffSummary System
- [ ] Implement the `DiffSummary` generation algorithm.
- [ ] Compute "Affected Regions" (sets of blocks/buses changed).
- [ ] Calculate `RuntimeImpact` (Instant vs Crossfade vs Reset) based on the nature of changes.

---

## Work Package 3: Layout & Projection
**Goal:** Decouple visual layout from patch semantics to enable multi-UI support. This is the "Eyes" of the editor.

**References:** `Layout-As-Projection.md`

### 3.1. ViewStateStore
- [ ] Create a new `ViewStateStore` separate from `PatchStore`.
- [ ] Move `lanes`, `collapsed` states, and block positions/ordering into `ViewState`.

### 3.2. Semantic-to-Spatial Projection
- [ ] Implement a stable auto-layout engine that positions nodes based on the `SemanticGraph` (topology) rather than manual drag-and-drop.
- [ ] Create "GraphNavigator" view logic that focuses on specific render roots or subgraphs.

### 3.3. Lane Removal
- [ ] Deprecate semantic lanes in `PatchDocument`.
- [ ] Migrate existing patches to store layout groups in `ViewState` or derive them dynamically.

---

## Work Package 4: Runtime State & Hot-Swap
**Goal:** Enable flicker-free editing by externalizing state from compiled closures. This is the "Heart" of the runtime.

**References:** `StatePreservationContract.md`

### 4.1. RuntimeStateStore
- [ ] Implement `RuntimeStateStore` keyed by stable `StateKey` (e.g., `blockId:slotId`).
- [ ] Ensure state persists across program re-instantiation.

### 4.2. Compiler State Handles
- [ ] Update block compilers (especially `Integrator`, `Delay`, `Envelope`) to request `StateHandle` objects instead of using closure variables.
- [ ] Ensure the compiler emits a `stateHandles` metadata manifest.

### 4.3. Swap Controller
- [ ] Implement the `SwapController` in `Player`.
- [ ] Consume `DiffSummary.RuntimeImpact` to decide swap strategy:
    - **Instant**: reuse state, swap program.
    - **Crossfade**: run old and new programs in parallel, blend outputs.
    - **Freeze**: hold last frame, warm up new program, fade in.

---

## Work Package 5: Logic Completeness
**Goal:** Finalize the "everything is a source" philosophy and data transformation capabilities. This is the "Body" of the system.

**References:** `RemoveParams.md`, `CanonicalLenses.md`, `AdaptersCanonical-n-Impl.md`

### 5.1. "No Params" Block Migration
- [ ]Systematically update all `BlockDefinitions` in the registry.
- [ ] Move every property from `paramSchema` to `inputs` with a `defaultSource`.
- [ ] Mark inputs with `tier: 'primary' | 'secondary'` for Inspector organization.
- [ ] Remove `params` handling from the compiler (it should only read `inputs`).

### 5.2. Finalize Adapters & Lenses
- [ ] Complete the population of `AdapterRegistry` (as per `Work-Adapters-Lenses.md`).
- [ ] Complete the population of `LensRegistry` (as per `Work-Adapters-Lenses.md`).
- [ ] Implement `applyLensStack` in `compileBusAware.ts` (currently a placeholder).
- [ ] Implement `applyAdapter` runtime logic.

---

## Execution Strategy

1.  **Start with WP2 (Kernel):** It changes the data flow of the entire application.
2.  **Parallelize WP3 (Layout) and WP5 (Logic):** Layout work is UI-heavy; Logic work is Compiler-heavy.
3.  **Finish with WP4 (Runtime):** Requires the stable diffs from WP2 and the clean compilation model from WP5.
