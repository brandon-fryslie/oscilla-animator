# ADR: Hybrid Architecture (Explicit Infrastructure Blocks)
**Date**: 2026-01-01
**Status**: Adopted

## Context
We need to support "Stateful Transforms" (like Slew) while maintaining a strict, schedulable execution graph for future backend compatibility.

## Decision
We adopt a **Hybrid Architecture**:

1.  **Stateless Operations** (`Scale`) are **Edge Modifiers**.
    *   They are pure functions inlined by the compiler.
    *   They live on the wire definition.
2.  **Stateful Operations** (`Slew`) are **Explicit Blocks**.
    *   They are nodes in the graph.
    *   They are inserted via **Graph Surgery** (Editor automation).

We explicitly **reject** "Input-Hosted State" because it creates a hidden, secondary state model that complicates the runtime and debugging.

## Consequences

### Positive
*   **Correctness**: The execution graph is explicit. No hidden state.
*   **Portability**: Easy to port to Rust/WASM (standard node graph).
*   **Debuggability**: Slew blocks can be inspected like any other block.

### Negative
*   **Graph Complexity**: Simple patches have more nodes. (Mitigated by "Nano-Block" styling in future).
*   **Editor Complexity**: The Editor must handle the logic of splitting/joining wires.

## References
*   `PLAN-UNIFIED-TRANSFORMS-FINAL.md` (Implementation Plan)