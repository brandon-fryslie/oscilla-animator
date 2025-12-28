Great — this report is exactly the kind of concrete baseline that makes a real multi-UI foundation possible. Based on these facts, here is the complete technical architectural foundation you should build so that you can have multiple visualizations (List/Inspector, Influence View, Time-Sliced Activity, later performance views) over the same patch, without forking logic or coupling UI to compiler quirks.

I’m going to be decisive: one canonical model, one mutation API, one query layer, N projections.

⸻

0) The Core Decision

You currently have two “truths”
	•	PatchStore owns blocks + connections + lanes
	•	BusStore owns buses + publishers + listeners

This is the single biggest blocker to multi-UI.

The foundation requires one canonical graph

Move to a single “PatchGraph” state model that contains:
	•	blocks[]
	•	connections[] (legacy / optional)
	•	buses[]
	•	publishers[]
	•	listeners[]
	•	composites[]
	•	settings
	•	uiLayouts (optional, per-view)

You can still keep multiple stores for organization, but they may not own separate pieces of the patch. They become facades over the same underlying document.

Call this canonical structure:

type PatchDocument = Patch & {
  // explicit: buses/publishers/listeners always present (can be empty arrays)
  buses: Bus[];
  publishers: Publisher[];
  listeners: Listener[];

  // lanes either removed or treated as one layout projection
  lanes?: Lane[];
};


⸻

1) The Multi-UI Contract

A multi-UI system lives or dies on three contracts:

Contract A: Canonical Document State

There is exactly one authoritative in-memory document:
	•	RootStore.document: PatchDocument

All UIs read it.
No UI owns alternative truth.
No store owns separate arrays that need sync.

Contract B: Primitive Mutation Ops

All changes happen via a small set of typed operations:
	•	applyOp(op) is the only mutating entry point
	•	everything else (macros, composite edits, bus binding, time-root changes) is built as transactions of ops

This is what makes:
	•	undo/redo possible
	•	multi-view consistency automatic
	•	event emission coherent
	•	checkpointing feasible

(You already want this, and it’s the right move.)

Contract C: Projection Queries

Every UI is a projection computed from the document:
	•	no UI re-derives its own “graph logic”
	•	no UI directly inspects compiler internals
	•	UIs use a shared query layer that returns stable view models

Think:
	•	selectors.getBusSummary(busId)
	•	selectors.getBlockBindings(blockId)
	•	selectors.getInfluenceGraph() (target → influences)
	•	selectors.getActivityFrame(t) (optional)

⸻

2) The Architecture Layers

Layer 1 — Document Store (immutable-ish behavior, mutable implementation)
	•	Holds the patch document
	•	Applies ops
	•	Maintains revision increment
	•	Emits events after commit (already close with GraphCommitted)

Key change: BusStore becomes either:
	•	removed entirely, or
	•	a namespaced facade that calls document.applyOp and runs selectors

Layer 2 — Selector/Query Layer (pure)

A module of pure functions that:
	•	takes (doc: PatchDocument) (and sometimes indexes)
	•	returns “answers” for UIs

Examples:
	•	getBlockById(doc, id)
	•	getPortTypeDesc(doc, blockId, slotId) (via SlotType → TypeDesc mapping)
	•	getPublishersForBus(doc, busId) (sorted by sortKey)
	•	getListenersForBus(doc, busId)
	•	getBindingsForBlock(doc, blockId) (both publish and listen endpoints)
	•	getCompatibleBusesForPort(doc, portRef) (TypeDesc-compatible + convertible)
	•	getInfluenceRows(doc) (UI-ready representation)

Layer 3 — Index Cache (incremental speed, still deterministic)

Selectors will get expensive if they scan arrays constantly.

So introduce an index object that is rebuilt on revision change:

type PatchIndex = {
  blocksById: Map<BlockId, Block>;
  slotsByKey: Map<string, Slot>; // `${blockId}:${slotId}`
  connectionsByFrom: Map<string, Connection[]>;
  connectionsByTo: Map<string, Connection[]>;
  publishersByBus: Map<string, Publisher[]>;
  listenersByBus: Map<string, Listener[]>;
  publishersByBlock: Map<BlockId, Publisher[]>;
  listenersByBlock: Map<BlockId, Listener[]>;
};

	•	Built once per committed revision
	•	Used by all views
	•	This is essential for multi-UI performance and sanity

Layer 4 — View Models (projection-specific, no mutations)

Each UI has a thin adapter that turns selector outputs into renderable items:
	•	List View wants: tree-like entity nodes + counts
	•	Influence View wants: grouped target rows with lens stacks
	•	Time-sliced view wants: activity snapshots

But they all come from the same selector layer + index.

Layer 5 — UI Layout Projections (optional and independent)

You currently have lanes as the layout. That must become a layout.

Define layout as separate from meaning:
	•	You can keep lanes as one “LayoutPlugin”
	•	You can add “AutoLayoutGraph” later
	•	You can add “No-layout List” trivially

A layout plugin reads the document and emits positions/ordering:

type LayoutPlugin = {
  id: string;
  computeLayout(doc: PatchDocument, index: PatchIndex): LayoutModel;
};

Where LayoutModel is something like:
	•	ordered lists
	•	groups
	•	computed x/y if you ever need them
	•	but stored separately from the canonical patch

This prevents “UI needs” from corrupting the patch semantics.

⸻

3) Events, Not Coupling

You already have EventDispatcher. Good.

But for multi-UI, the most important event is:
	•	DocumentCommitted({ revision, ops, diffSummary })

That lets:
	•	any UI view refresh indexes
	•	any view animate diffs
	•	the player hot-swap compiled programs safely
	•	diagnostics attach to the right revision

Do not have UI components listen to block-specific events.
They should listen to commits and then re-query.

This keeps event volume sane and makes UI consistent.

⸻

4) The Compiler Boundary in a Multi-UI World

Compiler is not a UI dependency. It’s a consumer of the document.

Make the boundary explicit:

type CompileInput = {
  doc: PatchDocument;
  index: PatchIndex; // optional but useful
};

type CompileOutput = {
  program?: Program<RenderTree>;
  timeModel?: TimeModel;
  errors: CompileError[];
  diagnostics?: DiagnosticsModel;
  // optional: debug hooks
  debug?: { busValueSamplers?: ... }
};

UIs do not inspect compiler types directly.
They render CompileOutput.diagnostics if needed.

This is critical because your editor types and compiler types are currently divergent. The query layer shields UI from that.

⸻

5) The “Two Views Now” Requirement

You said you need:
	1.	super easy view to implement
	2.	intuitive view for creation/understanding

This architecture supports that immediately:

View A — Structured List View (easy)
	•	Renders from selectors: blocks, buses, publishers, listeners
	•	No layout plugin required
	•	Uses inspector actions (which call applyOp)

View B — Influence View (intuitive)

This view is basically:

Target parameter → (bus, lens stack, enabled, order)

It is purely a projection over listeners.

Implementation is simple once you have selectors:
	•	group listeners by listener.to
	•	show bus + lens + enabled state
	•	reorder influences → modifies listener.sortKey (or a separate ordering key)

Note: your Listener currently doesn’t have sortKey, only Publisher does. For Influence View you will want deterministic ordering of multiple modulations per target. Add sortKey to Listener too. That is not optional if you want this view to be coherent.

⸻

6) The Key Refactors You Must Do First

Based on your report, here are the minimum foundation moves.

Refactor 1: Unify patch state ownership
	•	Remove BusStore ownership of arrays
	•	Make RootStore.document own buses/publishers/listeners
	•	Keep BusStore as a facade if you like, but it calls applyOp

Refactor 2: Kill lane coupling in core logic
	•	Lanes must stop being “where blocks live”
	•	They become one layout representation
	•	Block creation should not require lane IDs as a semantic input; it should accept a layout target optionally

Refactor 3: Add index cache on document commit
	•	Required for performance and stable multi-UI behavior

Refactor 4: Add Listener sortKey
	•	Required for deterministic multi-influence behavior
	•	Without it, any “influence stacking” UI will be nondeterministic

⸻

7) What the “Multi-UI Foundation” Produces

When you’re done, you will have:
	•	A single document model the whole system trusts
	•	A single mutation system (ops + transactions)
	•	A single selector layer shared by all UIs
	•	A shared index cache for performance
	•	Layout plugins that can come and go
	•	A compiler boundary that is clean and doesn’t leak

Then adding a new visualization is:
	•	1 new projection + view models
	•	0 changes to compilers
	•	0 changes to patch semantics
	•	0 new mutation pathways

That’s the exact property you’re trying to achieve.

⸻

If you want, in the next message I can write the exact module boundaries and file-level structure I would implement inside gallery/src/editor/ (what files to create, what to delete, what functions go where), but I’m not going to do that unless you ask—this message is the architectural foundation itself.