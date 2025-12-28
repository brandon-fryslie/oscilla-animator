xAlright — here’s the expanded, “this is the semantics kernel” version. I’m going to treat this as the one module that makes multi-UI, buses, time roots, composites, lazy fields, undo/redo, and diagnostics all line up without drifting. This is the thing you build once and then everything else becomes “a view” or “a consumer.”

⸻

The Patch Semantics Kernel

Purpose

A single, pure, deterministic layer that:
	1.	Defines what a patch means (independent of any UI)
	2.	Enforces what patch states are allowed to exist
	3.	Produces the canonical graph representation used by:
	•	UI(s)
	•	compiler(s)
	•	runtime tooling (health snapshots, perf counters)
	•	undo/redo + checkpointing
	4.	Explains violations with precise, actionable diagnostics

The kernel is not the compiler and not the UI.
It is the contract that both obey.

⸻

1) Inputs and outputs

Inputs
	•	PatchDocument (blocks, buses, publishers/listeners, wires if kept, composites defs, settings, timeRoot selection)
	•	RegistrySnapshot (block definitions, slot definitions, type descs, composite port maps, adapter library, lens library)
	•	KernelConfig (hard policy decisions: allow wires? allow cycles? strictness? etc.)

Outputs
	•	SemanticGraph (canonical adjacency + indices)
	•	ValidationReport (errors/warnings/info + fix suggestions)
	•	Resolution (normalized references: resolved slotIds, resolved endpoints, adapter chains chosen/validated)
	•	Hints (for UI projections: groups, focus roots, implied defaults, etc.)

⸻

2) The single source of truth representations

2.1 Canonical port identity

Everything in the system refers to ports using:
	•	PortRef = { blockId, slotId, dir }
	•	PortKey = ${blockId}:${dir}:${slotId}`

No other representation exists anywhere else (no {blockId, portName} strings).
This is the first non-negotiable invariant.

2.2 Canonical “relationship primitives”

There are only three relationship kinds in the semantic layer:
	1.	WireEdge: OutPort → InPort
	2.	PublishEdge: OutPort → Bus
	3.	ListenEdge: Bus → InPort

Everything else (macros, composites, lenses) is either:
	•	a transform that produces these edges, or
	•	metadata attached to them

This is what keeps the system minimal.

⸻

3) SemanticGraph: what it contains

The SemanticGraph is the “compiled” structural model — not codegen.

Nodes
	•	BlockNode(blockId)
	•	PortNode(PortKey) (only for ports that are referenced/connected/bound; optional for all)
	•	BusNode(busId)
	•	Optional: CompositeBoundaryNode(blockId) if composites are opaque boundaries

Indices (the actual power)

You keep precomputed maps:
	•	inEdgesByInPort: Map<PortKey, WireEdge | ListenEdge[]>
	•	outEdgesByOutPort: Map<PortKey, WireEdge | PublishEdge[]>
	•	publishersByBus: Map<busId, PublisherRef[]> (sorted by sortKey)
	•	listenersByBus: Map<busId, ListenerRef[]>
	•	blockPorts: Map<blockId, {inputs, outputs}> (from registry)
	•	typeByPort: Map<PortKey, TypeDesc>
	•	adjacency: Map<NodeKey, NodeKey[]> (for topo/SCC)
	•	roots: { timeRoot: blockId, renderSinks: blockId[] }

This graph is the thing every UI queries instead of scanning arrays.

⸻

4) What the kernel validates (and what it doesn’t)

4.1 Structural validity (must be prevented / must not compile)

These are “the patch is malformed” states:
	•	Missing referenced block/slot/bus
	•	PortRef points to wrong dir
	•	SlotId doesn’t exist for that block type (registry mismatch)
	•	Multiple writers into one input (wire-only rule if wires exist)
	•	Multiple TimeRoots / Missing TimeRoot
	•	Illegal cycle (if cycles disallowed or no memory boundary)
	•	Listener/publisher type incompatible with no valid adapter chain
	•	Composite boundary violation (binding to internal ports, etc.)

4.2 Semantic warnings (allowed but surfaced)

These are “you can do it, but we’ll tell you it’s risky or heavy”:
	•	Empty bus -> silent value used
	•	Expensive adapter chain (reduce Field→Signal)
	•	Unused blocks / dead ends
	•	Excessive fan-in or fan-out (UI overwhelm)
	•	Potential NaN sources (divide by zero patterns if you do expression analysis)
	•	Field materialization pressure (based on where Fields are consumed)

This division is critical. It keeps the UI “impossible to break” without turning experimentation into a fight.

⸻

5) The kernel’s resolution responsibilities

Validation alone isn’t enough. The kernel must also produce resolved semantics that all consumers use identically.

5.1 Default bindings and implied structure

Example: you want “phase exists” without wiring.

Kernel can declare “implicit listeners” as a normalized result:
	•	If an input port is Signal:phase and unbound/unwired
	•	Bind it to phaseA (or to TimeRoot.phase directly, depending on your architecture)

This is huge because it means:
	•	UI doesn’t hardcode “phaseA”
	•	compiler doesn’t hardcode it either
	•	it’s one rule, one place

5.2 Adapter chain selection and validation

You have adapter chains on publishers/listeners. The kernel should:
	•	validate that the chain exists in adapter registry
	•	validate each step’s type transitions
	•	compute the effective type after adapters
	•	optionally choose the chain if user didn’t specify one (auto-cast rules)

Then compiler just applies what kernel resolved.

5.3 Deterministic ordering

sortKey is a contract. The kernel is where it becomes authoritative:
	•	publishers sorted by sortKey then by stable tie-breakers (id)
	•	combine order is derived from this sorted list
	•	every UI reads publishers in this order
	•	compiler combines in this order

No drift possible.

⸻

6) Incrementality: how it stays fast

This is how you avoid “validating everything on every hover.”

6.1 Kernel operates on Ops (not ad-hoc mutations)

You already want applyOp(op) internal mutation primitives.

Kernel becomes the place where ops are:
	•	preflighted
	•	applied
	•	graph-updated incrementally
	•	revalidated locally

Operation lifecycle
	1.	preflight(op, graph, patch) → ok | diagnostics | suggestedFixes
	2.	apply(op) → patch’
	3.	updateGraph(delta) → graph’
	4.	validateDelta(delta, graph’) → diagnostics
	5.	emit GraphCommitted with stable diff summary

6.2 What’s “delta validation”?

You compute which constraints could have been affected.

Example:
	•	addListener(busId, toPort)
	•	check bus exists, port exists
	•	check type compatibility and adapters
	•	mark bus node + that port node as “dirty”
	•	check if this introduces new dependency edges that create a cycle
	•	cycle check can be incremental or deferred until commit

⸻

7) Diagnostics: the taxonomy that makes this usable

Kernel diagnostics should be precise, localizable, and actionable.

Each diagnostic includes:
	•	code (stable string)
	•	severity
	•	primary location (PortKey or busId)
	•	related locations (other ports/blocks/buses)
	•	message (human)
	•	why (one sentence)
	•	fixes[] (structured, machine-actionable)

Example fix

Multiple writers into input:
	•	Fix: { kind: 'replaceWire'; keep: connectionId; remove: connectionId[] }
	•	Fix: { kind: 'convertToBus'; createBusFromInputType; bindPublishers; bindListener }

This enables “one click fix” in UI without UI knowing rules.

⸻

8) How compiler and UI consume the kernel

UI

UI never “validates” on its own.

It does:
	•	ask kernel for possible actions (compatibility menus)
	•	apply ops through kernel transaction
	•	render diagnostics from kernel
	•	query graph indices for views

The UI becomes a thin interaction layer.

Compiler

Compiler does not do structural validation from scratch anymore.
It trusts the kernel:
	•	compile input is ResolvedPatch + SemanticGraph
	•	if kernel report has structural errors, compilation is skipped
	•	compiler uses:
	•	canonical topo order derived from graph
	•	resolved adapter chains
	•	deterministic publisher ordering
	•	timeRoot identity from kernel roots

This removes the “two implementations of rules” problem completely.

⸻

9) Where this sits in your codebase

Conceptually:
	•	src/editor/kernel/
	•	document.ts (PatchDocument types)
	•	registry.ts (RegistrySnapshot)
	•	graph.ts (SemanticGraph builder + incremental updates)
	•	validate.ts (rules)
	•	resolve.ts (defaults, adapters, ordering)
	•	diagnostics.ts (taxonomy)
	•	ops.ts (Op types, apply, invert)
	•	transactions.ts (transaction builder integration)

Stores become:
	•	PatchStore holds PatchDocument only
	•	BusStore may collapse into PatchDocument (since buses are semantic)
	•	UIStateStore holds UI state only
	•	RootStore orchestrates and exposes kernel

⸻

10) Why this is the “multi-UI foundation” you’re after

Because once the kernel exists:
	•	You can build a table UI, a graph UI, a performance UI
	•	They all mutate via the same ops
	•	They all see the same canonical relationships
	•	They all get the same diagnostics and suggested fixes
	•	No UI can accidentally create a broken state
	•	No compiler/UI drift can exist because there’s literally one ruleset

This is how you avoid “code gets gnarly” as the feature set grows.

⸻

If you want, the next step is to enumerate the exact Op set the kernel must support (the smallest possible set) and show how buses, composites, time roots, and layout views all become compositions of those ops.