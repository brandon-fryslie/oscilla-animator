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
*   **Pros**:
    *   Matches the UI concept "The wire has a slew on it".
*   **Cons**:
    *   **Violates Invariant**: Wires are no longer just definitions.
    *   **Execution Overhead**: The scheduler must iterate Blocks AND Wires.
    *   **Complexity**: Wires need unique IDs that persist across sessions to save their state.

### Option B: The "Hidden Compiler Inserted Block" (Compiler Middleware)
*Concept*: The user sees a wire. The compiler generates a `SlewBlock` and inserts it between Source and Target.
*   **Pros**:
    *   Keeps runtime entities simple (everything is a Block).
*   **Cons**:
    *   **Identity Crisis**: The generated block has no persistent ID in the editor. How do we save its state?
    *   **Debug Confusion**: The debugger shows a block the user didn't create.
    *   **Topology Drift**: The visual graph != the execution graph.

### Option C: The "Explicit Block" (The Purist Approach)
*Concept*: We forbid stateful transforms on wires. If you want Slew, you MUST drag in a "Slew Node".
*   **Pros**:
    *   **Architecturally Perfect**: Zero ambiguity. 1:1 Map.
    *   **Simple Compiler**: No "features", just connections.
*   **Cons**:
    *   **UX Friction**: High. Simple patching becomes tedious.
    *   **Visual Clutter**: Patches explode in size with tiny utility nodes.

### Option D: The "Port Modifier" (Input-Hosted State)
*Concept*: We reframe the feature. You aren't putting Slew on the *Wire*; you are attaching a Slew Modifier to the **Input Port** of the destination block.
*   **Pros**:
    *   **Topologically Sound**: The graph remains `A -> B`.
    *   **Lifecycle Correctness**: The Slew is part of B's input processing. If B dies, Slew dies.
    *   **No Magic**: The state is stored in `B.state.inputs['portName']`.
*   **Cons**:
    *   **Block Complexity**: Blocks must handle "input state" storage (boilerplate handled by compiler/runtime).

---

## The "Optimal" Solution: Option D (Port Modifiers)

### Why it wins
Option D is the only solution that preserves the **Stateless Wire** invariant AND avoids **Compiler Inerted Blocks** while maintaining **Good UX**.

It works because it acknowledges a fundamental truth of signal flow: **"Per-connection processing is effectively part of the Receiver."**

If `Block A` sends a signal to `Block B` and `Block C`, and we Slew the link to `B`:
*   The Slew is unique to `B`.
*   It is *dependent* on `B` existing.
*   Therefore, its state belongs to `B`.

### The Terminology Shift
We should stop calling them "Wire Transforms" or "Lenses" in the architecture. Call them **"Port Modifiers"** (or *Input Attachments*).

*   **UI**: They can *visually* sit on the wire near the destination.
*   **Data**: They are stored in the `inputs` definition of the destination block.
    ```json
    "target": { "blockId": "osc1", "portId": "freq", "modifiers": [{ "type": "slew", "params": {...} }] }
    ```
*   **Runtime**: State is allocated in `TargetBlock.state.inputs['freq'].modifiers[0]`.

### Recommendation
Adopt **Option D**. It offers the architectural purity of "Explicit Blocks" (because the modifier is explicitly part of the target block's definition) with the visual convenience of "Wire Transforms".

It requires one strict rule: **Modifiers are serialized as part of the INPUT connection definition, not the Output or the Wire independent of endpoints.**
