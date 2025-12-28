Deep dive 1: Port identity + expansion contract

This is the “root of a thousand paper cuts” problem. If you fix it cleanly, composites, macros, buses, diagnostics, undo/redo, and multi-UI all get dramatically easier. If you don’t, you’ll keep shipping features that randomly break when something expands, renames, or reorders.

Below is the nuts-and-bolts end-state: what identity means, how expansions work, and exactly what invariants you enforce.

⸻

1) The real failure mode you’re seeing

You currently have at least four different “names” for the same concept:
	•	UI Slot identity: {blockId, slotId}
	•	Compiler Port identity: {blockId, port} (or some other derived name)
	•	Composite expansion identity: block-123::render.radius (new block ids created during expand)
	•	Bus endpoints: BindingEndpoint { blockId, port } (in report)

This causes your current bug class:

A reference that was valid at authoring time becomes invalid after expansion, because expansion rewrote the IDs without rewriting all the references.

Your engineer’s “bus listeners don’t work through composites” is exactly this: buses reference pre-expansion endpoints.

⸻

2) The end-state principle

Principle A: one canonical address for “a port”

Every place in the system references ports the same way. No exceptions.

Principle B: expansion never breaks addresses

Expansion is allowed to change internal topology, but it must preserve the ability to resolve all external references deterministically.

There are only two ways to accomplish that:

Option 1 (recommended): Composites are boundaries

A composite’s external ports are real, stable endpoints. The compiler resolves bus/wire dependencies through composite boundaries without requiring composite expansion to rewrite document references.

Expansion may happen internally, but the composite remains addressable.

Option 2: Expansion rewrites everything

Every expansion pass also rewrites all references to ports (wires, bus bindings, selections, diagnostics maps, etc). This is brittle and cascades quickly.

Given your goals (multi-UI, undo tree, stability), Option 1 is the right contract.

⸻

3) Canonical PortKey: the one address format

Define a canonical key. It must be:
	•	stable under moves/layout changes
	•	stable under compilation
	•	serializable
	•	precise enough for diagnostics and UI highlighting

Use this:

PortRef

type PortRef = {
  blockId: BlockId;
  slotId: SlotId;        // the canonical name of the port
  dir: 'in' | 'out';
};

Then define:

type PortKey = `${BlockId}:${'in'|'out'}:${SlotId}`;

SlotId is the port’s identity. Not label. Not index. Not “port name” inferred in compiler.

If you ever want to rename a port label, you keep slotId stable and change only label.

This implies a requirement:

BlockDefinition must define stable slotIds

Slots in the registry cannot be generated ad-hoc per instance. They must come from the definition and be stable across versions (or versioned with migrations).

⸻

4) Composite boundary contract (the key design)

A composite block definition must provide an explicit mapping between its external ports (slotIds on the composite block) and its internal graph.

CompositeDefinition must contain:
	•	external slots (inputs/outputs) with slotIds
	•	internal graph (nodes, edges)
	•	portMap: where each external port goes internally

Think of it like a function signature mapping.

Example: external input port “radius”
	•	composite external input: {slotId: "radius"}
	•	maps to internal node: RenderInstances2D input slot “radius”

This mapping is part of the composite definition, not inferred later.

Why this solves your bus bug

A bus listener can target:
	•	DotsRenderer:in:radius

The compiler can resolve:
	•	“DotsRenderer input radius” → internal port via portMap
without the listener needing to know block-123::render.

The composite instance remains addressable.

⸻

5) Compilation model that respects boundaries

Your compiler currently wants a flat DAG over blocks. With composites as boundaries, you instead compile via two-phase resolution:

Phase 1: Build a dependency graph over addressable ports

Graph nodes are ports, not blocks.
	•	Node: PortKey
	•	Edge: from output port to input port for wires
	•	Edge: from publisher output port to bus
	•	Edge: from bus to listener input port

But for composite ports:
	•	If an input port belongs to a composite instance, it has an internal mapping.
	•	The compiler does not expand the patch into a new patch with new IDs.
	•	It expands during compilation into an internal sub-compiler context.

Phase 2: Compile each block (primitive or composite) to artifacts
	•	Primitive compilers produce artifacts for their output slotIds.
	•	Composite compilers:
	•	compile their internal graph using a local namespace (internal ids)
	•	map composite external inputs to internal inputs
	•	map internal outputs back to composite external outputs

The important part: the patch document never changes for compilation.

That keeps:
	•	undo/redo clean
	•	multi-UI stable
	•	diagnostics attachable to original authored blocks

⸻

6) Namespacing and internal identity

Inside a composite, internal nodes still need stable identity for:
	•	caching
	•	stateful blocks
	•	lazy Field evaluation keyed by element identity + node identity
	•	debugging

Use a deterministic namespace scheme:

<instanceId>/<internalNodeId>

But crucially: this is compiler-internal identity, not document identity.

So your internal block id might be:
	•	block-123#RenderInstances2D (or similar)

But the UI and buses never point at that directly.

⸻

7) What about macros?

Macros are an authoring convenience. They expand in the document today. That’s fine, but it creates two regimes:
	•	Macro expansion rewrites the patch
	•	Composite compilation expands internally

That’s okay if you treat macros as purely a “paste template” and never as an encapsulation boundary.

But you must be consistent about ports after macro expansion:
	•	macro-expanded blocks must use canonical {blockId, slotId} too
	•	any bus endpoints created by macro expansion must reference those exact ids

⸻

8) Diagnostics and UI selection become trivial

Once PortKey is canonical:
	•	compile errors point to {blockId, slotId, dir}
	•	UI can highlight exactly that port in any view
	•	selection model is stable across all UIs
	•	“jump to source” always works

This is enormous for multi-UI.

⸻

9) The invariants you enforce (non-negotiable)

To make this bulletproof, enforce these:

Invariant 1: SlotIds are stable and unique within a block

No “radius2” by index. No “port0”. If a port is removed, migrate.

Invariant 2: All connections/bindings store PortRef only

No {blockId, portName} anywhere.

Invariant 3: Composites never leak internal identities

No listener/publisher endpoint may reference a composite-internal node.

Invariant 4: All expansion is either:
	•	authoring-time (macros/templates), OR
	•	compile-time internal (composites)
Never both for the same mechanism.

Invariant 5: Compilation never mutates the document

Compiler produces an executable representation + metadata, but does not rewrite block IDs in the document.

⸻

10) Practical migration steps (what to change in your current code)

Based on your report’s facts, the likely concrete changes are:
	1.	Replace BindingEndpoint { blockId, port } with { blockId, slotId, dir }
	2.	Replace compiler-side port naming with slotId
	3.	Make compileBusAware and wire compiler resolve everything through PortRefs
	4.	Change composite compilation to compile internally without replacing document blocks
	5.	Add CompositePortMap and require it for any composite
	6.	Update macro expansion to emit bindings using canonical PortRefs (no “port” strings)

⸻

11) How you know you nailed it (tests to prove it)

The minimum “coffin nails” tests:
	1.	Composite bus listener survives internal change

	•	Listener binds to composite port
	•	Composite definition changes internals
	•	Listener still resolves and affects output

	2.	Composite swapping preserves bindings when slotIds unchanged

	•	replace composite def
	•	endpoints still valid

	3.	Diagnostics location stable

	•	cycle/type errors point to stable authored port keys

	4.	No document mutation during compile

	•	hash of patch doc unchanged by compilation

⸻

If you say “Next”, we’ll deep dive the second issue on the list (time authority unification: player vs patch time).