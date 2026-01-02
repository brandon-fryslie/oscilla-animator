# DECISION RECORD: Adoption of Explicit Infrastructure Blocks
**Date**: 2026-01-01
**Context**: Finalizing the architecture for stateful signal operations.

## 1. The Decision

We have decided that **all stateful signal operations must be represented as Explicit Blocks** in the patch data.

*   **Stateless Operations** (e.g., `Scale`, `Clamp`) -> **Edge Modifiers** (stored on the wire).
*   **Stateful Operations** (e.g., `Slew`, `Delay`) -> **Infrastructure Blocks** (stored as nodes).

## 2. Rationale

### A. Scheduling & Determinism
Our backend (and future Rust port) requires a strict dependency graph where every node with state is explicitly schedulable. Hidden state "tucked away" inside input ports or wires creates an implicit execution graph that differs from the explicit one, leading to race conditions and ordering bugs.

### B. Debuggability
When a user inspects a patch, they must see *exactly* what is running. If `Slew` has state (`lastValue`), it must be inspectable. By making `Slew` a Block (mapped to the `Lag` primitive), it automatically gains:
*   Visual status indication (active/inactive).
*   Value inspection (current output).
*   Standard serialization.

### C. Backend Simplicity
The Compiler/Runtime need only understand **Blocks** and **Wires**. They do not need to support a special "Input State" subsystem.

## 3. Implementation Strategy: "Graph Surgery"

To preserve the ease of use ("I just want to smooth this connection"), the **Editor** will handle the complexity.

*   **Action**: Dropping a `Slew` item onto a wire.
*   **Logic**:
    1.  The Editor identifies `Slew` as an `infrastructure-block` mapping to the `Lag` primitive.
    2.  It calculates the midpoint of the wire.
    3.  It performs an atomic transaction: `{ deleteEdge(old); createBlock(Lag); createEdge(A->Lag); createEdge(Lag->B); }`.

## 4. Conclusion

We accept the trade-off of "more blocks in the graph" in exchange for "system stability and simplicity." The UI will be responsible for making these infrastructure blocks look unobtrusive (e.g., smaller "pill" nodes).
