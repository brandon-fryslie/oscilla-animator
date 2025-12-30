Canonical cycle-check + diagnostic algorithm (memory breaks cycles)

This is the exact compile-time rule for allowing “cycles” while keeping the per-frame schedule acyclic.

1) Build two graphs

You must construct two directed graphs over the same node set:

Node set
Choose the granularity that matches your scheduler. The simplest and fastest long-term is slot-level:
•	Node = ValueSlotId (or ValueRef), representing “this value exists in ValueStore during frame k”.
•	Edges = “to compute B you must have A”.

If you’re still block-level, you can do it, but slot-level gives better diagnostics and avoids false positives when a block has independent outputs.

Graph A: Same-frame dependency graph G_same
Add edges for all dependencies that must be satisfied within the same frame:
•	Wire: fromSlot -> toSlot
•	Bus pipeline: publisherOut -> adapter1 -> … -> combine -> listenerIn
•	Pure ops: inputSlots -> outputSlot
•	Materialize steps: domainSlot -> outBuffers, exprSlot -> outBuffers (etc.)
•	Render assemble: bufferSlots -> outFrameSlot
•	Memory: add only the commit-side dependency:
•	mem.inSlot -> mem.commitStep (or mem.inSlot -> mem.commitSlot if modeled as slot)
•	Do not add any same-frame edge from mem.inSlot to mem.outSlot.

Graph A is what must be a DAG.

Graph B: Full logical graph G_full (for “where is the cycle?” diagnostics)
Same as above but include the conceptual feedback edges:
•	Memory adds cross-frame logical edge:
•	mem.outSlot -> consumers (same as normal)
•	and also include mem.inSlot -> mem.state and mem.state -> mem.outSlot if you model state as node
•	If you don’t model state as nodes, just include:
•	mem.outSlot -> consumers (already)
•	and additionally mem.inSlot -> mem.outSlot (represents “it’s related”, not same-frame)

G_full is only for extracting SCCs and producing human-friendly explanations. It is not used to accept/reject.

⸻

2) Acceptance rule (the one that matters)

A patch is valid iff G_same is acyclic.

That’s it. If G_same has a cycle, it means there exists an instantaneous loop requiring a value from itself in the same frame. That is forbidden.

⸻

3) Detecting the cycle

Run standard cycle detection on G_same:
•	Kahn topo sort; if not all nodes are output, there is a cycle.
•	Or DFS back-edge detection.

If a cycle exists:
•	Extract a minimal cycle (or SCC + one representative cycle path).
•	Report CompileError: InstantCycle.

⸻

4) Producing useful diagnostics (what to show the user)

When you find a cycle in G_same, you must answer:
1.	Which values are in the instantaneous loop?
2.	Where can the user insert a latch to break it?
3.	Why doesn’t the current latch break it (if one exists nearby)?

4.1 SCC extraction
Compute SCCs on G_same (Tarjan/Kosaraju). Any SCC with:
•	more than 1 node, or
•	a self-loop edge

is illegal.

Pick one SCC S and diagnose it.

4.2 Find a concrete cycle path
Within SCC S, find a concrete cycle path:
•	pick any node u in S
•	DFS until you revisit a node; record the path
•	produce ordered edges [e0, e1, ..., en] closing the loop

This becomes the highlighted “red loop”.

4.3 Suggest latch insertion points
A latch “breaks” same-frame cycles only if it converts a dependency edge into a cross-frame value source.

So the compiler should propose insertion points where:
•	there is an edge a -> b in G_same
•	and a is a Signal/Field slot that is allowed to be latched
•	and b’s type matches latch output type

Suggested fix:
•	“Insert LatchSignal<T> (or LatchField<T>) between <a producer> and <b consumer>.”

Heuristic ranking (deterministic):
1.	Prefer edges that cross block boundaries (wire/bus edges) rather than internal edges.
2.	Prefer edges closest to “the user intended feedback” (often the edge that visually closes the loop).
3.	Prefer edges whose value is “stateful intent” (velocity, position, accumulator) if you can infer from port semantics (optional).

4.4 Explain memory semantics explicitly
If the SCC contains a memory block but the cycle remains, your error message must say:
•	“A latch exists, but it is not on the instantaneous dependency path. Latches only break cycles when the loop passes through their out (t-1) output.”

This prevents the common confusion “but I already have a latch in the patch”.

⸻

5) Required compile-time guarantees

Your compiler must guarantee these facts if G_same is acyclic:
•	There exists a topological order of evaluation for the frame.
•	Memory outputs are available at frame start (from prior state).
•	The schedule can be constructed without runtime fixups.

⸻

6) Minimal data structures (implementation-grade)

type NodeId = ValueSlotId;

interface Edge {
from: NodeId;
to: NodeId;
kind:
| "wire"
| "bus_publish"
| "bus_adapter"
| "bus_combine"
| "bus_listen"
| "op"
| "materialize"
| "render_assemble"
| "latch_commit_dep"; // only in G_same
blame?: {
blockId?: string;
port?: string;
publisherId?: string;
listenerId?: string;
adapterStepIndex?: number;
};
}

interface CycleDiagnostic {
sccNodes: NodeId[];
cycleEdges: Edge[];              // ordered loop
suggestedLatchEdges: Edge[];     // ranked candidate edges a->b
message: string;
}


⸻

7) Edge rules for buses (so cycles are handled correctly)

Buses are just edges in G_same.

For a publisher chain:
•	publisherSourceSlot -> adapterStep0Out -> ... -> combineNode(busId)

Then listeners:
•	combineNode(busId) -> adapterStep0Out -> ... -> listenerTargetSlot

If a listener ultimately feeds back (via wires/buses) into a publisher source, G_same will detect it—unless a latch breaks it.

⸻

If you say Next again, I’ll give the second half: the canonical lowering contract for LatchSignal / LatchField (slots allocated, step emission, cache keys, domain-change handling).