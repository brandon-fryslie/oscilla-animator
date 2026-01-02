# IMPLEMENTATION PLAN: Unified Transforms (Hybrid Model)
**Date**: 2026-01-01
**Context**: Implementation steps for PaletteRegistry, Primitive Blocks, and Graph Surgery.

## 1. Executive Summary
We are implementing the Hybrid Model.
*   **Track A (Registry)**: Replace `TransformRegistry` with `PaletteRegistry`.
*   **Track B (Blocks)**: Implement the 4 Primitives (`Lag`, `UnitDelay`, `Phasor`, `SampleAndHold`).
*   **Track C (Editor)**: Implement "Graph Surgery".

## 2. Phase 1: Infrastructure (The Palette)
**Goal**: Create the source of truth for all operations.

*   [ ] **Create `src/editor/palette/types.ts`**:
    *   Define `PaletteEntry` union type (`stateless-transform` | `infrastructure-block`).
*   [ ] **Create `src/editor/palette/PaletteRegistry.ts`**:
    *   Implement singleton registry.
    *   Add `registerStateless(...)`.
    *   Add `registerBlock(...)`.

## 3. Phase 2: Definition Migration
**Goal**: Move existing logic.

*   [ ] **Migrate Stateless Modifiers**:
    *   Create `definitions/stateless/math.ts` (Scale, Clamp).
    *   Register them in `PaletteRegistry`.
*   [ ] **Define Primitive Blocks**:
    *   **LagBlock**: `src/editor/blocks/infrastructure/LagBlock.ts` (Linear/Expo modes).
    *   **UnitDelayBlock**: `src/editor/blocks/infrastructure/UnitDelayBlock.ts`.
    *   **PhasorBlock**: `src/editor/blocks/infrastructure/PhasorBlock.ts`.
    *   **SampleAndHoldBlock**: `src/editor/blocks/infrastructure/SampleAndHoldBlock.ts`.
    *   Register "Slew" in Palette: `kind: 'infrastructure-block'`, `blockType: 'Lag'`, `params: { mode: 'linear' }`.
    *   Register "LPF" in Palette: `kind: 'infrastructure-block'`, `blockType: 'Lag'`, `params: { mode: 'exponential' }`.

## 4. Phase 3: Editor Logic (Graph Surgery)
**Goal**: Smart drag-and-drop.

*   [ ] **Implement `GraphSurgery.ts`**:
    *   Function: `insertBlockOnEdge(patch, edgeId, blockType, params)`.
    *   Logic:
        1.  Get `edge` (source/target).
        2.  Create `newBlock` of `blockType` with `params`.
        3.  Delete `edge`.
        4.  Connect `source -> newBlock`.
        5.  Connect `newBlock -> target`.
*   [ ] **Update Drop Handlers**:
    *   In `PatchEditor`:
    *   Check `PaletteEntry.kind`.
    *   If `infrastructure-block`: Call `GraphSurgery.insertBlockOnEdge`.
    *   If `stateless-transform`: Append to `Edge.transforms`.

## 5. Phase 4: UI Cleanup
**Goal**: Unified UI.

*   [ ] **Rename `LensSelector` to `ModifierList`**:
    *   It now *only* lists stateless modifiers on the current wire.
*   [ ] **Update Palette UI**:
    *   Show "Slew" alongside "Scale" in the menu.

## 6. Verification
*   **Test**: Drag Scale to wire. Verify `Edge.transforms` has length 1. Node count unchanged.
*   **Test**: Drag Slew to wire. Verify `Edge.transforms` is empty. Node count +1 (Lag block added). Visual graph shows new block.
