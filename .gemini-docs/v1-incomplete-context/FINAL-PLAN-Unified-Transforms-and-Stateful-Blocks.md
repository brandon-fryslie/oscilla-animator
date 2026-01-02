# FINAL Plan: Unified Transforms and the "Hidden Block" Architecture
**Date**: 2026-01-01
**Context**: This document supersedes all previous plans regarding Transform Unification. The architecture must support a fully scheduled backend where all state is explicitly managed.

## 1. Core Architectural Mandate

The system requires that **any operation with state must be a distinct, schedulable unit** (a "Block"). This is to support backends (like Rust) that require an explicit dataflow graph and state management. "Just a function call" with a JS closure for state is not a valid pattern for stateful operations.

This forces a clear distinction:
*   A **Block** is a schedulable process, which may have state. This is the fundamental unit of computation.
*   A **Stateless Transform** is a pure mathematical function that modifies a signal (e.g., `scale`, `clamp`). It can be inlined by the compiler.
*   A **Stateful Transform** (e.g., `slew`, `delay`) is a UX concept that **must be compiled into a Hidden Block**.

---

## 2. The "Hidden Block" Model

When a user applies a stateful transform to a wire (e.g., `A -> [Slew] -> B`):
1.  **Editor Data Model**: The `Slew` is stored as a "Port Modifier" on the input of Block B. This keeps the *visual* graph topology simple (`A -> B`).
2.  **Compiler**: The compiler sees the `isStateful` flag on the `Slew` transform. It then:
    a.  Materializes a `SlewBlock` in the Intermediate Representation (IR).
    b.  Assigns this `SlewBlock` a stable, deterministic ID (e.g., `hash(source_id, dest_id, transform_index)`).
    c.  Rewires the graph in the IR to `A -> SlewBlock -> B`.
3.  **Runtime**: The scheduler receives a graph with three nodes (`A`, `SlewBlock`, `B`) and executes them in order. The state (`lastValue`) is managed by the runtime against the `SlewBlock`'s stable ID.

**This is the optimal architecture because it satisfies all constraints**:
*   The UX is clean (no graph spam).
*   The backend receives a pure, schedulable graph.
*   State is explicitly managed.

---

## 3. Implementation Plan

### Phase 1: Registry Infrastructure & Population

**Goal**: Unify all transforms into the registry, with a clear flag for statefulness.

1.  **Update `TransformDef`** (`src/editor/transforms/TransformRegistry.ts`):
    *   Add `isStateful: boolean` (Default `false`).
    *   Update `allowedScopes`: `'input' | 'output' | 'param'`. The legacy `'wire' | 'publisher' | 'listener'` must be removed.

2.  **Create Definition Files**:
    *   `src/editor/transforms/definitions/stateless/` (e.g., `math.ts`, `quantize.ts`).
    *   `src/editor/transforms/definitions/stateful/` (e.g., `timing.ts` for `slew`).
    *   `src/editor/transforms/definitions/adapters/` (all adapters are stateless type converters).

3.  **Populate Definitions**:
    *   **Stateless Lenses** (`scale`, `clamp`): Port from `src/editor/lenses/index.ts`. Set `isStateful: false`.
    *   **Stateful Lenses** (`slew`): Port from `src/editor/lenses/index.ts`. Set `isStateful: true`. The `apply` function should be pure (take `lastValue` as an argument), assuming the runtime will provide it.
    *   **Adapters**: Port from legacy code. Set `isStateful: false`.

4.  **Create Registration Entry Point**:
    *   Create `src/editor/transforms/registerAll.ts`.
    *   Import all definitions and call `TRANSFORM_REGISTRY.register...`.
    *   Import in `src/main.tsx` to execute on startup.

### Phase 2: UI Integration

**Goal**: Make the UI data-driven and scope-aware.

1.  **Refactor `LensSelector.tsx`**:
    *   Populate the lens list from `TRANSFORM_REGISTRY.getAllLenses()`.
    *   Read the `lensDef.params` schema to generate parameter editors.
    *   **Delete the hardcoded `LENS_TYPES` and `switch` statements.**

2.  **Scope Validation**:
    *   When adding a lens, check `allowedScopes`. For example, `isStateful` lenses should only be attachable to `input` scopes. The UI should filter the list of available lenses based on the context.

### Phase 3: Cleanup

**Goal**: Remove all legacy transform code.

1.  **Delete `src/editor/lenses/index.ts`** (or gut it, leaving only exports from the new system).
2.  **Delete `src/editor/adapters/autoAdapter.ts`**. Update any code that used it to use `TRANSFORM_REGISTRY.findAdapters()`.
3.  **Remove any switch-based logic** in `compileBusAware.ts` or other old compiler passes.

---

## 4. Follow-Up Work (To be tracked separately)

### 4.1 Compiler: "Hidden Block" Generation
*   **Goal**: Implement the core logic in the compiler (e.g., `pass8-link-resolution.ts`) to generate `Hidden Blocks`.
*   **Task**:
    1.  When processing a connection's transforms, check `isStateful`.
    2.  If `true`, dynamically create a block definition for the transform (e.g., `SlewBlock`).
    3.  Generate a stable ID for this hidden block.
    4.  Insert the new block into the IR graph, rewiring the connections.
    5.  Pass the block's state handle to the scheduled operation.

### 4.2 IR & Runtime: State Management
*   **Goal**: Ensure the runtime can manage state for these deterministically generated hidden blocks.
*   **Task**: The runtime state manager needs to store state against the stable IDs generated by the compiler.

### 4.3 Full `compileToIR` Coverage
*   **Goal**: Implement the `compileToIR` function for all transforms (stateless and stateful).
*   **Task**: For stateful transforms, the `compileToIR` function will define the inputs, outputs, and state schema for its corresponding `Hidden Block`.

---
## 5. Verification Checklist
1.  **Registry Population**: A script can run at build time to verify that all expected lenses/adapters are registered.
2.  **UI Correctness**: Adding/removing lenses in the UI correctly modifies the `Edge.transforms` array. The list of available lenses is filtered by `isStateful`.
3.  **Compiler (Future)**: A test patch with a Slew transform generates an IR with one extra `SlewBlock` node compared to the editor patch.
