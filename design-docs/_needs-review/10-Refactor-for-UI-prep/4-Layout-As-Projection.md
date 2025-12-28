Deep dive 3: Layout as projection, not semantics (replacing lanes without free-form node hell)

Right now your patch document contains layout as lanes + ordered blockIds. That makes layout a first-class part of “the thing being authored,” which is exactly what breaks multi-UI and makes every UI refactor feel like brain surgery.

The long-term fix is to separate:
	•	Document semantics: what the patch is
	•	View projections: how a given UI shows it

This is the architectural foundation that lets you have:
	•	a “simple table UI” for building patches quickly
	•	a “graph overview” for understanding
	•	a “performance UI” for playing
…all over the same patch, without rewriting the patch every time you move a block around.

Below is the end-state spec and the nuts-and-bolts to get there.

⸻

1) The principle (non-negotiable)

Principle A: The patch document must be UI-agnostic

The patch’s semantic meaning must be completely determined by:
	•	blocks (types + params)
	•	relationships (wires, buses, publishers/listeners, composite bindings)
	•	time/root constraints
	•	project-level settings that affect compilation

Nothing about pixel positions, lanes, or UI grouping may be required to compile correctly.

Principle B: Layout lives in “ViewState”, not “Patch”

Layouts are derived or stored separately as UI preferences.

A layout may be persisted, but it is not patch semantics.

⸻

2) Your current pain: why lanes are toxic (architecturally)

Lanes encode 3 things at once:
	1.	visual grouping
	2.	ordering
	3.	an implied “flow” narrative

But your actual system flow is buses + compilation dependencies, not lane order. So lanes become a story that often lies.

And since block position is derived from lane membership + array order:
	•	rearranging UI becomes a semantic patch change (in diffs, history, undo logs)
	•	different UIs can’t coexist because they all want to “own” lanes

⸻

3) The end-state data model

PatchDocument (semantic)

Contains no layout.
	•	blocks: Block[]
	•	connections: Connection[] (if you keep wires at all)
	•	buses/publishers/listeners
	•	timeRoot (explicit or validated)
	•	composites (defs)
	•	settings (semantic only: seed defaults, etc.)

ViewState (projection)

Stored per layout profile (and per UI, optionally).

Minimum viable view state:

type ViewState = {
  activeViewId: string;          // which UI “lens” is currently shown
  views: Record<string, ViewLayout>;
}

type ViewLayout =
  | GraphLayout
  | TableLayout
  | PerformanceLayout
  | … (future)

For the “graph-like” view you described (small overview, minimal manual positioning), you still want a layout store—but it’s not freeform.

GraphLayout stores:
	•	“which subgraph is currently open/focused”
	•	optional pinned nodes
	•	collapsed groups
	•	viewport (pan/zoom)
	•	maybe stable node ordering hints (NOT x/y coordinates)

The key: layout stores hints and preferences, not geometry.

⸻

4) The core mechanism: deterministic auto-layout

Since you hate edge-dragging and manual node wrangling, you want a layout that:
	•	is algorithmic
	•	is predictable
	•	is stable under small edits
	•	exposes relationships without spaghetti
	•	doesn’t require the user to position anything

This is the “fixed-layout, navigable graphs” approach.

4.1 Layout is computed from semantic relationships

Build a unified adjacency model from:
	•	wires (if present)
	•	bus listeners/publishers
	•	composite boundaries (external ports)

Then compute layout positions every render (or cache).

4.2 The stability requirement (the hard part)

Auto-layout systems usually “jitter” when you add a node.

You must enforce layout stability by design:

Rule: layout is anchored on stable IDs + stable ordering keys, not on array order or discovery order.

Examples:
	•	stable topological order (using PortKey edges)
	•	stable grouping by capability (time/identity/render/pure) if you choose
	•	stable sorting by blockId as tie-breaker

Then apply a layout algorithm that preserves existing placements as much as possible (“incremental layout”):
	•	unchanged nodes keep their prior computed rank
	•	new nodes slot into the smallest gap
	•	minimal movement of existing nodes

This is critical for “no-jank” in the editor view itself.

⸻

5) The multi-graph / “root node with children” idea

Your instinct is good. You’re describing a document that can contain multiple scenes or graphs, and a UI that lets you “enter” one at a time.

Architecturally, you need to decide: what is a “graph” in the document?

Canonical definition: Graph = Output Tree rooted at a Render sink

If you have multiple render outputs (or multiple “Scenes”), each can be treated as a graph root.

So:
	•	Each “graph tab” corresponds to one Render output pipeline (or one Scene program)
	•	“Master root node” is a UI construct that lists these roots

This maps perfectly to your ambient goals: a patch can host multiple visual instruments, and the UI can navigate among them.

Important: this doesn’t require a new semantic type called “graph.”
It’s a projection:
	•	Find render sinks
	•	Trace upstream dependencies
	•	That’s a graph cluster

⸻

6) The UI contract that replaces lanes

You said you still want proximity + visible arrows when possible, but not user-drawn wiring.

So the view provides:

6.1 Two modes of relationship visualization
	1.	Spatial adjacency arrows (short enforced arrows)
	•	used inside the focused graph
	•	only between “primary relationships” you choose (see below)
	2.	Chips / badges / highlights for non-spatial relationships
	•	buses
	•	lenses
	•	secondary influences
	•	fan-in/fan-out relationships

You do not want to show every bus relationship as a line. That becomes spaghetti immediately.

6.2 Primary vs secondary relationships

You must decide what gets arrows.

A good long-term rule:
	•	Show arrows for structural dependencies (identity → render, time → derived phase → render, etc.)
	•	Do not show arrows for “modulation” relationships (bus bindings), those become chips anchored on ports and shown in the bus board.

This makes the layout readable:
	•	structure is visible
	•	modulation is inspectable

⸻

7) How to transform your existing UI to this without breaking everything

Step 1: Make lanes optional and introduce ViewState
	•	Keep lanes in Patch for now, but stop relying on them as the source of layout.
	•	Add a parallel ViewState store.
	•	Build the new layout view using computed layout from the semantic graph.

Step 2: Replace PatchBay with “GraphNavigatorView”

This view:
	•	shows a “root overview” of render outputs / scene roots
	•	clicking one enters the focused graph
	•	focuses on upstream nodes only
	•	provides a mini-map for the entire patch

Step 3: Deprecate lane editing operations

Once the new view is stable:
	•	remove lane reorder, collapse, pin features
	•	eventually remove lanes from PatchDocument entirely

Because layout is now a projection, removing lanes no longer destroys the user’s ability to understand the patch.

⸻

8) The hidden killer: selection, inspection, and navigation

Your UI must be “bring info to the user when needed,” not “user finds it by scrolling.”

So your view needs navigation primitives:
	•	“Go to publisher” from a bus chip
	•	“Show all subscribers” from a bus row
	•	“Reveal dependency path” (highlight path from time → render)
	•	“Focus mode”: show only nodes relevant to selected port/block/bus

These are the affordances that make a non-freeform graph UI usable.

⸻

9) The invariants that keep this from sucking

If you want this to be long-term practical (not a cool mockup), enforce:
	1.	Layout never changes patch semantics
	2.	Auto-layout is stable
	3.	Only primary relations become arrows
	4.	Everything else is navigable via chips and focus tools
	5.	Every relationship is discoverable from either endpoint
	•	(from a port you can see what it reads/writes)
	•	(from a bus you can see who publishes/listens)
	6.	No UI requires manual wiring to be “complete”
	•	all connections are created by menu-driven compatible suggestions

⸻

10) What you gain immediately
	•	Multi-UI becomes real (table view + graph overview + performance view)
	•	Undo/redo becomes clean (moving things doesn’t spam history)
	•	Patches become shareable without “layout fights”
	•	The editor finally communicates “this is an instrument,” not “this is plumbing”
