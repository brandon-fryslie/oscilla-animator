# DESIGN DOC: Hybrid Runtime Architecture (Stateless + Explicit)
**Date**: 2026-01-01
**Context**: Detailed design for the Compiler & Runtime to support the Hybrid Architecture.

## 1. Architectural Overview

The runtime system distinguishes strictly between two types of signal modification:

1.  **Inline Transformations (Stateless)**: Pure math operations executed as part of the connection evaluation.
2.  **Node Execution (Stateful)**: Standard block execution for anything requiring state.

## 2. Compiler Responsibility (Pass 8)

The compiler's job is to lower the high-level graph into an executable schedule.

### 2.1 Handling Stateless Modifiers
When processing a connection `A -> B` with modifiers `[Scale, Clamp]`:
1.  The compiler emits code to evaluate `A`.
2.  It injects the logic for `Scale` and `Clamp` directly into the evaluation sequence for that specific input of `B`.
3.  **Result**: Efficient, inlined code. No extra scheduling overhead.

### 2.2 Handling Infrastructure Blocks (`Lag`, `UnitDelay`)
The compiler treats Infrastructure Blocks exactly like an `Oscillator` or `Filter`.
1.  It is assigned a node ID.
2.  It is topologically sorted.
3.  It is allocated standard Block State.
4.  **Result**: Standard execution. No special handling required.

## 3. The Palette Registry (`PaletteRegistry`)

To support the Editor, we introduce a unified registry that classifies operations.

```typescript
type PaletteEntry = 
  | { 
      kind: 'stateless-transform'; 
      id: string; 
      params: ParamSchema; 
      // Compiler inlines this
      compileOp: (val: IRValue) => IRValue; 
    }
  | { 
      kind: 'infrastructure-block'; 
      id: string;      // e.g. 'slew-limiter'
      blockType: string; // e.g. 'Lag'
      params: Record<string, unknown>; // e.g. { mode: 'linear' }
      // Editor inserts this
    };
```

## 4. Summary

*   **Runtime Complexity**: LOW. (Standard Graph + Inline Math).
*   **Editor Complexity**: MEDIUM. (Graph Surgery logic required).
*   **User Clarity**: HIGH. (What you see is what runs).
