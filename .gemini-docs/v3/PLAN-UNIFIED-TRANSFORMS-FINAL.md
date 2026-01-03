# FINAL PLAN: Unified Transforms (v3)
**Date**: 2026-01-01
**Status**: Authoritative. Supersedes v1 and v2.
**Context**: Hybrid Architecture: "Stateless Modifiers" + "Explicit Primitive Blocks".

## 1. Executive Summary

We are adopting a **Hybrid Architecture** to handle signal operations:
1.  **Stateless Operations** (`Scale`, `Clamp`) remain lightweight **Edge Modifiers**.
2.  **Stateful Operations** become **Explicit Infrastructure Blocks**.

**Key Refinement**: To prevent block explosion, we define **4 Canonical State Primitives**: `UnitDelay`, `Lag`, `Phasor`, and `SampleAndHold`. The UI's "Slew" command maps to a `Lag` block.

**The Big Decision**: We explicitly **REJECT** "Input-Hosted State" (hidden state inside destination blocks).
**Instead**: When a user applies a `Slew` to a wire, the Editor performs **Graph Surgery** to insert a real `LagBlock`.

## 2. Architecture & Concepts

### 2.1 The `PaletteRegistry`
We replace the `TransformRegistry` with a `PaletteRegistry` that serves as the single menu for all operations.

```typescript
type PaletteEntry = 
  | { kind: 'stateless-transform'; id: string; ... } // Adds to Edge.transforms
  | { 
      kind: 'infrastructure-block'; 
      id: string;      // e.g. 'slew-limiter' (UI ID)
      blockType: string; // e.g. 'Lag' (Primitive ID)
      params: Record<string, unknown>; // e.g. { mode: 'linear' }
    } 
```

### 2.2 Stateless Transforms (The "Old" Way)
*   **Storage**: `Edge.transforms`.
*   **Behavior**: Compiler inlines the math.
*   **Scope**: Can be applied to Wires (and by extension Inputs/Outputs).

### 2.3 Infrastructure Blocks (The "New" Way)
*   **Storage**: A standard Block in the `Patch` data (`kind: 'Lag'`).
*   **Behavior**: Compiler sees a normal node. Runtime sees a normal node.
*   **UX**: Users drag it onto a wire, and the wire "splits" to accommodate the block.

---

## 3. Implementation Phases

### Phase 1: Registry & Types
**Goal**: Create the `PaletteRegistry` to distinguish operation types.

1.  **Create `src/editor/palette/types.ts`**: Define `PaletteEntry`.
2.  **Create `src/editor/palette/PaletteRegistry.ts`**: Singleton for registration.

### Phase 2: Definition Migration
**Goal**: Port existing logic to the new system.

1.  **Migrate Stateless Transforms**:
    *   Create `definitions/stateless/math.ts` (Scale, Clamp).
    *   Register as `kind: 'stateless-transform'`.
2.  **Define Primitive Blocks**:
    *   Create `src/editor/blocks/infrastructure/LagBlock.ts` (Handles Slew, LPF).
    *   Create `src/editor/blocks/infrastructure/UnitDelayBlock.ts` (Handles Feedback).
    *   Register `Slew` in Palette: `kind: 'infrastructure-block'`, `blockType: 'Lag'`, `params: { mode: 'linear' }`.

### Phase 3: Editor Logic (Graph Surgery)
**Goal**: "Drop on Wire" behaves differently based on type.

1.  **Update Drop Handler**:
    *   If `entry.kind === 'stateless-transform'`: Append to `edge.transforms`.
    *   If `entry.kind === 'infrastructure-block'`:
        *   **Command**: `insertBlockOnEdge(edgeId, blockType, defaultParams)`.
        *   **Logic**: Delete `Edge A->B`. Create `Block X` (with params). Create `Edge A->X`, `Edge X->B`.

### Phase 4: UI Cleanup
**Goal**: Reflect the architecture in the UI.

1.  **Update `LensSelector`**: Rename to `ModifierList`. Only show/edit `stateless-transforms` on the selected wire.
2.  **Update `Palette`**: Show both types side-by-side.

---

## 4. Verification

1.  **Topology Check**: Adding a `Scale` does NOT change node count. Adding a `Slew` increments node count by 1 (adds a `Lag` block).
2.  **Runtime Check**: `Lag` block appears in the schedule as a distinct step.

---

## 5. Engineer Task List

1. [ ] **Palette Registry**: Implement `PaletteRegistry.ts`.
2. [ ] **Lag Block**: Create `LagBlock.ts` (primitive).
3. [ ] **Stateless Defs**: Port `Scale`, `Clamp` to `definitions/stateless/`.
4. [ ] **Graph Surgery**: Implement `insertBlockOnEdge` helper.
5. [ ] **Drop Handler**: Switch logic based on `PaletteEntry.kind`.
6. [ ] **UI Update**: Split `LensSelector` (modifiers) from `Palette` (creation).