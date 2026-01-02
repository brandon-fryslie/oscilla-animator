# FINAL Plan: Explicit Stateful Infrastructure Blocks
**Date**: 2026-01-01
**Context**: This document supersedes all previous plans. The architecture will treat stateless and stateful transforms as two distinct categories: "Port Modifiers" and "Infrastructure Blocks".

## 1. Final Architectural Decision

1.  **Stateless Transforms (e.g., `scale`, `clamp`) are "Port Modifiers"**:
    *   They are pure functions.
    *   They are stored as an array on the connection data (`Edge.transforms`).
    *   The compiler can inline them as pure math operations. They do not affect the graph topology.

2.  **Stateful Transforms (e.g., `slew`, `delay`) are "Infrastructure Blocks"**:
    *   They are regular blocks, with their own state, inputs, and outputs (e.g., `SlewBlock`).
    *   When a user applies a stateful transform to a wire, the **Editor** performs graph surgery: inserts the block and rewires the connections.
    *   The patch data explicitly contains this new block. There is **no compiler magic**.

3.  **The `TransformRegistry` is now a `PaletteRegistry`**:
    *   It provides the UI with a list of available operations.
    *   Crucially, it tells the UI whether an operation is a `stateless-modifier` or a `stateful-block`, so the Editor knows which action to perform (modify array vs. insert block).

---

## 2. Implementation Plan

### Phase 1: Create the Building Blocks

**Goal**: Define the stateless modifiers and the new stateful blocks.

1.  **Update Registry & Types**:
    *   Rename `TransformRegistry` to `PaletteRegistry`.
    *   Update its definition to include an `operationType` field:
        ```typescript
        interface PaletteEntry {
          id: string;
          label: string;
          operationType: 'stateless-modifier' | 'stateful-block';
          // ... other metadata for params, etc.
        }
        ```

2.  **Define `SlewBlock`**:
    *   Create a new block definition file: `src/editor/blocks/infrastructure/SlewBlock.ts`.
    *   It will have one input (`in`) and one output (`out`).
    *   Its internal logic will contain the state (`lastValue`, `lastTime`).
    *   Register it with the main `BlockRegistry`.

3.  **Define Stateless Modifiers**:
    *   Create `src/editor/transforms/definitions/stateless/math.ts` (etc.).
    *   Port the logic for `scale`, `clamp`, `quantize` from legacy files into this new structure.
    *   Register them with the `PaletteRegistry` with `operationType: 'stateless-modifier'`.

4.  **Register `Slew` with the Palette**:
    *   In a `registerAll.ts` file, add an entry for "Slew" to the `PaletteRegistry`.
    *   Set its `operationType: 'stateful-block'` and provide the `blockType: 'SlewBlock'` to be inserted.

### Phase 2: Implement the Editor Logic

**Goal**: Make the UI perform the correct action based on the operation type.

1.  **Modify Wire/Connection Drop Handler**:
    *   When an item from the palette is dropped on a wire:
        a. Look up the entry in the `PaletteRegistry`.
        b. **If `stateless-modifier`**: Add the modifier to the `Edge.transforms` array.
        c. **If `stateful-block`**:
            i.   Get the source and target of the wire.
            ii.  Create a new block of the specified type (`SlewBlock`).
            iii. Delete the original wire.
            iv.  Create two new wires (`source -> newBlock`, `newBlock -> target`).

### Phase 3: UI Integration & Cleanup

**Goal**: Connect the UI to the new `PaletteRegistry` and remove legacy code.

1.  **Refactor `LensSelector.tsx`**:
    *   Rename to `ModifierSelector.tsx` or similar.
    *   It should only list and manage **stateless modifiers**.
    *   The main palette for adding new operations (both stateless and stateful) will read from the `PaletteRegistry`.

2.  **Cleanup**:
    *   Delete the old `Lens` and `Adapter` concepts/files that have been fully migrated.
    *   Remove any "compiler magic" related to stateful transforms from `pass8` or other passes. The compiler should now only see a simple, explicit graph.

---

## 3. Follow-Up Work

*   **Implement other "Infrastructure Blocks"**: Create block definitions for `DelayBlock`, `LatchBlock`, etc.
*   **UI/UX for Infrastructure Blocks**: Decide how to visually represent these blocks. They are real blocks, but maybe they should have a smaller, "inline" appearance on the wire to maintain the user's mental model. This is a UX design task, not an architectural one.
