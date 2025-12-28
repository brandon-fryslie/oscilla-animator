Roadmap: Implement the Golden Patch end-to-end (dependency-ordered, long-term, no shortcuts)

This is the one true sequence that gets you to a correct, performant, loop-native system with the Golden Patch as the integration harness. Each step is ordered so you never build something you’ll throw away, and every milestone produces a meaningful, testable increment.

I’m going to structure this as Work Packages with:
	•	Goal (what becomes possible)
	•	Must-haves (hard requirements)
	•	Deliverables (code + UX outcomes)
	•	Golden Patch checkpoint (what should now work)

⸻

WP0 — Lock the contracts (types + invariants)

Goal

Make the system “strict” enough that later layers can rely on invariants without defensive code.

Must-haves
	•	TypeDesc is authoritative for ports + buses.
	•	Reserved bus names/types are enforced (phaseA, pulse, energy, palette, progress).
	•	Exactly one TimeRoot enforced at compile time.
	•	TimeRoot cannot have upstream dependencies.
	•	No composite may contain a TimeRoot.

Deliverables
	•	Compile-time validation pass (before artifact compilation) emitting structured errors (Spec 7).
	•	Reserved bus registry rules.

Golden Patch checkpoint

Patch loads, but cannot run yet—it validates and produces intelligible errors until time/runtime exists.

⸻

WP1 — TimeRoot + TimeModel + Player rewrite (loop is not the player)

Goal

Make looping/finite/infinite be a property of the patch, not the player.

Must-haves
	•	Implement CycleTimeRoot fully with the ports described earlier.
	•	Compiler must output timeModel + UiSignalBindings.
	•	Player runs unbounded t and never wraps/clamps it.
	•	Time Console UI is driven by timeModel only (Finite vs Cycle vs Infinite layout).

Deliverables
	•	CycleTimeRoot block compiler
	•	Player transport rewrite (remove loopMode)
	•	Time Console UI rework:
	•	CYCLE badge
	•	phase ring (bound to phaseA)
	•	pulse indicator (bound to pulse)
	•	Bus auto-publication from TimeRoot (phaseA + pulse)

Golden Patch checkpoint

With a dummy RenderTree, you can see:
	•	phase ring animating
	•	pulse indicator ticking
	•	no clamping/wrapping bugs

⸻

WP2 — Bus-aware compiler graph (publish/listen is first-class)

Goal

Make bus routing real and deterministic, with stable ordering and no ambiguity.

Must-haves
	•	Compiler graph includes:
	•	block outputs
	•	bus value nodes
	•	publisher edges
	•	listener edges
	•	Deterministic publisher ordering (sortKey contract enforced).
	•	Bus combination semantics implemented for:
	•	last (phaseA/palette/progress)
	•	sum (energy)
	•	or (pulse)
	•	Hot-swap safe: old program keeps running until new compiles.

Deliverables
	•	Unified bus-aware compile pipeline (no “late hacks”)
	•	Bus artifact compilation with stable ordering
	•	UiSignalBindings uses bus IDs, not ports

Golden Patch checkpoint

All signal-only parts work:
	•	breath energy signal exists
	•	pulse events exist
	•	palette color signal exists
Even if fields/render aren’t implemented yet, Bus Board scopes show meaningful movement.

⸻

WP3 — Domain + stable element identity (the Field world anchor)

Goal

Introduce the first true “stuff to animate” that has stable identity, so Field graphs have a spine.

Must-haves
	•	Domain type exists as a first-class artifact:
	•	stable element IDs
	•	deterministic ordering
	•	deterministic elementCount
	•	GridDomain produces:
	•	Domain
	•	Field for base positions (pos0)
	•	StableIdHash produces Field in [0,1) deterministically from element IDs + salt.

Deliverables
	•	Domain artifact + utilities
	•	GridDomain block compiler
	•	StableIdHash block compiler

Golden Patch checkpoint

You can render debug outputs:
	•	element count
	•	a preview of grid points (even as simple dots)
	•	stable hash values (visualized as grayscale)

⸻

WP4 — Lazy FieldExpr core (no bulk fields anywhere)

Goal

Make Fields fully lazy and composable, and ensure nothing accidentally materializes early.

Must-haves
	•	A FieldExpr IR that can represent:
	•	const field
	•	source field (pos0, idRand)
	•	broadcast (Signal→Field)
	•	map unary
	•	zip (Field+Field, Field+Signal)
	•	wrap/frac phase
	•	FieldExpr evaluation is only allowed at declared sinks.
	•	FieldExpr nodes carry TypeDesc metadata for validation.

Deliverables
	•	FieldExpr data model
	•	Type checking rules for FieldExpr composition
	•	A FieldExpr evaluator interface (not necessarily fast yet—correct first, but still lazy)

Golden Patch checkpoint

You can build:
	•	phasePer = wrap(phaseA + idRand*spread)
	•	drift = jitter(idRand, phaseB)
	•	radius field = f(phasePer, energy)
…and nothing materializes until you ask it to.

⸻

WP5 — Render sink + buffer materialization strategy (performance-critical)

Goal

RenderInstances2D becomes the first serious “sink” that forces efficient field evaluation.

Must-haves
	•	RenderInstances2D can consume:
	•	Domain
	•	Field position
	•	Field radius
	•	Field fill
	•	Field opacity
	•	It materializes into typed buffers (ArrayBuffer-backed) with:
	•	stable reuse across frames
	•	minimal allocations
	•	deterministic element ordering consistent with Domain
	•	Field evaluation supports:
	•	evaluating N elements into buffers in one pass
	•	reuse of intermediate buffers when beneficial (implementation detail, but required for speed)

Deliverables
	•	RenderInstances2D compiler + runtime renderer
	•	Buffer pool / arena
	•	FieldExpr → “evaluateMany” pipeline into typed arrays
	•	ViewportInfo block (center/size)

Golden Patch checkpoint

The full “Breathing Constellation” renders:
	•	grid of dots
	•	breathing radius
	•	drifting positions
	•	palette drift
…and it holds frame rate at reasonable sizes.

⸻

WP6 — No-jank hot swap scheduling (pulse boundary + state preservation)

Goal

Editing the patch while running feels instrument-like, not like restarting an animation.

Must-haves
	•	Change classification (Param / Structural / Topology)
	•	Program swap scheduling:
	•	frame boundary
	•	pulse boundary (for CycleTimeRoot)
	•	freeze boundary
	•	State preservation:
	•	stateful node registry (Delay/Integrate/etc, later)
	•	StateKey mapping
	•	UI: “Change scheduled” banner and modal for topology changes.

Deliverables
	•	Swap scheduler in player/runtime
	•	Pulse-edge detection from pulse bus
	•	UI affordances for apply-now/apply-on-pulse/apply-on-freeze
	•	Guarantees: no blank frame, no flicker, no silent reset

Golden Patch checkpoint

While running:
	•	change breath amplitude → instant, no jank
	•	change cycle period → scheduled at next pulse, seamless
	•	change grid size → requires explicit apply boundary (freeze/pulse), no surprise

⸻

WP7 — Composite library (make the Golden Patch one-click)

Goal

Turn the Golden Patch into a usable template and a canonical learning artifact.

Must-haves
	•	Composite instance system works with bus bindings (no broken listeners through composites).
	•	Composite editing/expansion rules remain consistent with bus routing and TimeRoot constraints.
	•	Provide these composites (as previously defined):
	•	AmbientLoopRoot
	•	BreathEnergy
	•	PulseAccentEnergy
	•	SlowPaletteDrift
	•	BreathingDotsRenderer

Deliverables
	•	Composite resolution strategy (transparent compilation without “ID breakage”)
	•	Composite library UI surfacing
	•	Golden Patch as:
	•	one-click template
	•	single-block composite (“BreathingDotsRenderer”) demo

Golden Patch checkpoint

A user can start from empty patch → insert “Breathing Constellation” template → it works and is editable live.

⸻

WP8 — Export correctness for cyclic patches (phase-driven sampling)

Goal

Export produces a truly loopable clip/SVG without relying on fps luck.

Must-haves
	•	Export uses TimeModel-derived ExportTimePlan
	•	Cycle export supports phase-driven sampling:
	•	sample by phase steps, not wrapped time
	•	Loop closure guarantee:
	•	first and last sample match (within tolerance)
	•	Export UI reflects topology (Cycle vs Finite vs Infinite)

Deliverables
	•	Export pipeline
	•	Phase-driven evaluation pathway (CycleRoot override for export context)
	•	Loop integrity reporting

Golden Patch checkpoint

Export “Breathing Constellation” as a loop:
	•	plays seamlessly in a dumb external player
	•	no visible seam

⸻

WP9 — Feedback readiness (not needed for Golden Patch, but required long-term integrity)

Goal

Ensure the system can later host dynamical systems safely without revisiting foundations.

Must-haves
	•	SCC detection with memory boundary policy
	•	Memory block registry
	•	Deterministic integration semantics
	•	Transport vs scrub-safe declared

Deliverables
	•	Graph SCC validation
	•	Memory blocks integrated cleanly into state system

Golden Patch checkpoint

Not required for the golden patch visuals, but required so the architecture remains coherent as you expand.

⸻

Summary: The “spine” you’re building

If you keep only one mental map:
	1.	TimeRoot defines topology and time signals
	2.	Buses are the shared routing fabric
	3.	Domain defines element identity
	4.	Lazy FieldExpr defines per-element computation
	5.	Render sinks materialize fields efficiently
	6.	Hot swap keeps it playable under edits
	7.	Composites make it usable
	8.	Export is evaluation under TimeModel

