# Analysis: Architecting Stateful Connections
**Date**: 2026-01-01
**Topic**: Selecting the optimal architecture for stateful signal transformations (e.g., Slew, Delay) on connections.

## The Core Conflict
We have three competing requirements:
1.  **Stateless Wires**: Wires should be simple topological definitions (`From: A, To: B`).
2.  **No Compiler Inserted Blocks**: The runtime graph should match the editor graph 1:1 for debugging/serialization sanity.
3.  **Rich Connections**: Users want to apply operations (Smooth, Quantize) to connections without manually inserting extra nodes for every trivial operation.

## The Options

We are evaluating four architectural patterns to solve: *"Where does the state (e.g., `last_value`) live?"*

### Option A: The "Stateful Wire" (Smart Edges)
*Concept*: The Wire itself is a runtime entity that holds state and has an `update()` method.
*   **Pros**: Matches the UI concept "The wire has a slew on it".
*   **Cons**: **Violates Invariant**: Wires are no longer just definitions. Execution overhead increases significantly.

### Option B: The "Hidden Compiler Inserted Block" (Compiler Middleware)
*Concept*: The user sees a wire. The compiler generates a `LagBlock` and inserts it between Source and Target.
*   **Pros**: Keeps runtime entities simple (everything is a Block).
*   **Cons**: **Identity Crisis**: The generated block has no persistent ID in the editor. Debugging becomes confusing as the visual graph differs from the execution graph.

### Option C: The "Explicit Block" (The Purist Approach)
*Concept*: We forbid stateful transforms on wires. If you want Slew, you MUST drag in a "Lag Node".
*   **Pros**:
    *   **Architecturally Perfect**: Zero ambiguity. 1:1 Map between visual and execution graphs.
    *   **Simple Compiler**: No "features", just connections.
*   **Cons**:
    *   **UX Friction**: High. Simple patching becomes tedious.
    *   **Visual Clutter**: Patches explode in size with tiny utility nodes.

### Option D: The "Port Modifier" (Input-Hosted State)
*Concept*: We reframe the feature. You aren't putting Slew on the *Wire*; you are attaching a Slew Modifier to the **Input Port** of the destination block.
*   **Pros**: Topologically sound (graph remains `A -> B`).
*   **Cons**: **Runtime Complexity**. Every block must now manage "input state" buckets. This complicates the runtime engine significantly and creates a bifurcated state model (Block State vs. Input State).

---

## The Selected Solution: Option C (Explicit Blocks) with "Graph Surgery"

### Why it wins
We select **Option C** because it is the only option that creates a **schedulable, serializable, and debuggable** graph without requiring complex "hidden state" machinery in the runtime.

To mitigate the **UX Friction**, we will implement **Automated Graph Surgery** in the Editor.

### The New User Experience
1.  User drags "Slew" onto a wire `A -> B`.
2.  **Editor Action**:
    *   Deletes wire `A -> B`.
    *   Inserts `LagBlock` (Primitive) at the midpoint.
    *   Creates wires `A -> Lag` and `Lag -> B`.
3.  **Result**: The user gets the convenience of a "drop on wire" interaction, but the underlying data model remains pure: **It is just a block.**

### Recommendation
Adopt **Explicit Infrastructure Blocks**.
*   **Stateless** transforms (`Scale`) remain as lightweight edge modifiers (inline math).
*   **Stateful** transforms (`Slew`) become real Blocks (mapping to the `Lag` primitive).
