# Analysis of Architectural Options for Stateful Transforms
**Date**: 2026-01-01
**Status**: Final Decision

## 1. The Core Problem

A fully schedulable backend requires that any operation with memory (state) must be an explicit node in the execution graph. This conflicts with the user experience goal of applying simple "lenses" or "modifiers" to connections without manually adding and wiring new blocks.

## 2. Options Explored

Four architectures were considered to resolve this conflict:

*   **Option A: "Stateful Wire"**: The wire itself holds state.
    *   *Verdict*: **Rejected**. Violates the core system invariant that wires must be stateless definitions.

*   **Option B: "Hidden Block"**: The compiler "magically" inserts a stateful block into the IR that is not visible in the editor patch.
    *   *Verdict*: **Rejected**. Creates a dangerous divergence between the patch data and the runtime graph, making debugging and serialization fragile.

*   **Option C: "Port Modifier"**: The state is hosted by the destination block (Input-Hosted State).
    *   *Verdict*: **Rejected**. While it keeps the topology stable, it makes the state implicit and violates the "explicitly scheduled" mandate by hiding the stateful process inside another block's execution.

*   **Option D: "Explicit Infrastructure Block"**: A stateful operation (like "Slew") is a real block. The editor's UI automatically performs the graph surgery (`A->B` becomes `A->SlewBlock->B`) when the user applies the operation.
    *   *Verdict*: **Adopted**. This is the only model that satisfies all architectural constraints.

## 3. Final Decision: The Hybrid Model

The final architecture is a hybrid model that treats stateless and stateful operations differently:

1.  **Stateless Operations (`scale`, `clamp`)**: These are treated as **Port Modifiers**. They are pure functions stored as metadata on the connection and can be inlined by the compiler.
2.  **Stateful Operations (`slew`, `delay`)**: These are treated as **Infrastructure Blocks**. The editor explicitly inserts a block (`SlewBlock`) into the patch, making the state and the operation a first-class citizen of the graph.

This provides a clean, WYSIWYG graph that is 100% compatible with a scheduled backend, while the editor's "graph surgery" automation preserves user experience.
