# FINAL PLAN: Infrastructure Blocks & Stateless Transforms
**Date**: 2026-01-01
**Status**: Authoritative Plan of Record. This document supersedes all others.

## 1. Architecture & Concepts

This plan implements a hybrid architecture that ensures compatibility with a fully scheduled backend where all state must be explicitly managed. The core principle is a strict separation between stateless and stateful operations.

### 1.1 Core Principle: Operations are either Stateless or Stateful

1.  **Stateless Transforms (e.g., `scale`, `clamp`)**:
    *   **What**: Pure mathematical functions that modify a signal.
    *   **Representation**: Stored in the existing `Edge.transforms` array. This is the single, authoritative place for stateless operations on a connection.
    *   **Execution**: The compiler can inline these as pure math operations. They do not create new nodes in the schedule.

2.  **Stateful Operations (e.g., `slew`, `delay`) are "Infrastructure Blocks"**:
    *   **What**: Any operation with memory. These are regular blocks, with their own state, inputs, and outputs.
    *   **Representation**: A real block (`SlewBlock`) explicitly inserted into the patch data.
    *   **Execution**: When a user applies a "Slew" to a wire, the **Editor** performs graph surgery, changing `A->B` to `A->SlewBlock->B`. The scheduler sees `SlewBlock` as a normal node.

### 1.2 The `PaletteRegistry`
This registry provides the UI with a list of available operations and distinguishes between the two types.

*   **`PaletteEntry` Type**:
    ```typescript
    // To be created in a new file, e.g., `src/editor/palette/types.ts`
    interface PaletteEntry {
      id: string;
      label: string;
      description: string;
      operationType: 'stateless-transform' | 'stateful-block';
      // For stateless: defines parameters for the UI to build an editor.
      params?: Record<string, { type: 'float' | 'int'; default: number; }>;
      // For stateful: the blockType to be inserted.
      blockType?: string;
    }
    ```

---

## 2. Implementation Plan (Immediate Work)

### Phase 1: Define Core Components

**Goal**: Create the block/modifier definitions according to the new architecture.

1.  **Create `PaletteRegistry` and Types**:
    *   Create a new file `src/editor/palette/types.ts` and define `PaletteEntry`.
    *   Create `src/editor/palette/PaletteRegistry.ts` to register and retrieve `PaletteEntry` items.

2.  **Define `SlewBlock`**:
    *   Create a new block definition file: `src/editor/blocks/infrastructure/SlewBlock.ts`.
    *   Define it as a standard block with one input (`in`) and one output (`out`), and parameters (`riseMs`, `fallMs`).
    *   Its internal logic will manage the state for `lastValue` and `lastTime`.
    *   Register it with the main `BlockRegistry`.

3.  **Define Stateless Transforms**:
    *   Create `src/editor/transforms/definitions/stateless.ts`.
    *   Port the logic for `scale`, `clamp`, `quantize` from legacy files into plain objects that conform to the `PaletteEntry` interface (`operationType: 'stateless-transform'`).

4.  **Create Registration Entry Point**:
    *   Create `src/editor/palette/registerAll.ts`.
    *   This file will import the stateless transform definitions and the `SlewBlock` metadata.
    *   It will call `PALETTE_REGISTRY.register()` for each item.
        *   **For `scale`**: `{ id: 'scale', operationType: 'stateless-transform', ... }`
        *   **For `slew`**: `{ id: 'slew', operationType: 'stateful-block', blockType: 'SlewBlock', ... }`
    *   Import and run this function once in `src/main.tsx`.

### Phase 2: Implement the Editor Logic

**Goal**: Make the UI perform the correct action (modify array vs. insert block).

1.  **Implement Graph Surgery Logic**:
    *   In the UI component that handles drag-and-drop onto wires:
        a. On drop, look up the item in the `PaletteRegistry`.
        b. **If `stateless-transform`**: Add a new transform object to the `Edge.transforms` array.
        c. **If `stateful-block`**:
            i.   Execute a command to create a new block using the `blockType` from the palette entry.
            ii.  Execute a command to delete the original connection.
            iii. Execute commands to create the two new connections (`source -> newBlock`, `newBlock -> target`).

### Phase 3: UI Integration & Cleanup

**Goal**: Connect UI to the `PaletteRegistry` and remove legacy code.

1.  **Update `LensSelector.tsx`**:
    *   This component's responsibility is now only to manage the `transforms` array on an existing connection. It should only list and allow editing of **stateless transforms**. The data for this can come from the `PaletteRegistry`.

2.  **Create a Global Operation Palette**:
    *   A new UI component is needed to display all items from the `PaletteRegistry`, allowing users to drag them onto the patch.

3.  **Cleanup**:
    *   Delete old `Lens`-related files (`src/editor/lenses/index.ts`).
    *   Delete `src/editor/adapters/autoAdapter.ts`.
    *   Remove any logic from the compiler that attempted to handle stateful transforms; the compiler will now only ever see an explicit graph of blocks.

---

## 3. Follow-Up Work (Out of Scope for this Task)

1.  **UX for Infrastructure Blocks**:
    *   **Task**: Design how `SlewBlock` and similar nodes are visually represented. They are real blocks, but could have a different, more compact appearance to signify their "utility" role.

2.  **Implement More Infrastructure Blocks**:
    *   **Task**: Create block definitions for `DelayBlock`, `LatchBlock`, `IntegrateBlock`, etc., and register them as `stateful-block` operations in the `PaletteRegistry`.
