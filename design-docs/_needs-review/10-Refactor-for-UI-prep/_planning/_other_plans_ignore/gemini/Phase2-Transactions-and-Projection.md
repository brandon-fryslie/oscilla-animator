# Phase 2: Transactions, Projections & State

Phase 2 transitions the editor from a direct-mutation model to an atomic, validated, and projection-aware architecture.

## Objectives

### 1. Transaction & Op System (Nails in Coffin for Undo/Redo)
- **Define Op Set**: Enumerate the minimal serializable `Op` types (`BlockAdd`, `ConnectionAdd`, `BusUpdate`, etc.).
- **Implement TransactionBuilder**: Replace direct MobX actions in `PatchStore` with a `transaction(tx => { ... })` API.
- **Atomic Validation**: Transactions must commit only if the `Validator` confirms structural integrity.
- **History Tree**: Implement a non-truncating history DAG instead of a simple stack.

### 2. Layout as Projection (Enabling Multi-UI)
- **Decouple Lanes**: Move `lanes` and `blockId` ordering out of the `Patch` document and into a separate `ViewStateStore`.
- **ViewState Persistence**: Ensure layouts are stored separately from patch semantics.
- **Topological Layout Engine**: Implement a stable, deterministic auto-layout that can derive node positions from semantic dependencies.

### 3. State Preservation (No-Jank Hot Swap)
- **RuntimeStateStore**: Implement an external store for stateful blocks (integrators, buffers) keyed by stable `StateKey`.
- **Compiler State Handles**: Update block compilers to emit `StateHandle` metadata instead of keeping state in closures.
- **Swap Strategy Controller**: Implement the `RuntimeImpact` logic to choose between `instant`, `crossfade`, and `freezeAndFade` swaps.

### 4. Adapter & Lens Execution
- **Execute Adapters**: Implement the runtime logic for `adapterChain` (broadcast, lift, reduce).
- **Apply Lens Stack**: Update `compileBusAware.ts` to actually apply the `lensStack` transformations during bus value resolution.

## Implementation Sequence

1. **Transaction Kernel**: Build the `Op` types and `TxBuilder` first, as all other changes will flow through it.
2. **Layout Projection**: Extract lanes from the patch document to prove the semantic independence of the graph.
3. **StateStore**: Introduce the state externalization to enable flicker-free editing of complex patches.
4. **Adapter/Lens Logic**: Finally, implement the mathematical conversion logic to make the bus system fully expressive.

## Acceptance Criteria
- [ ] No `PatchStore` method mutates state without an Op.
- [ ] Changing lane order does not change the patch's hash/identity.
- [ ] The animation does not "reset" or "jump" when a block parameter is tweaked.
- [ ] Types are automatically converted across buses (e.g., Signal -> Field broadcast).
