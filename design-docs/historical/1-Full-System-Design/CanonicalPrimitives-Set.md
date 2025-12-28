Below is a canonical primitive set for the “Element Domain + Mapper + Renderer” architecture, ordered in implementation order, with details on how each primitive lines up with your bus/field/type system and your no-jank live edit goals.

I’m going to be strict about “primitive” here: each item is a small orthogonal concept that doesn’t secretly bundle two axes. Anything that bundles axes becomes a composite (starter macro) later.

⸻

Canonical Primitive Set (Implementation Order)

Phase 0 — Core Types & Contracts (before any blocks)

These aren’t “blocks” but they’re the rails everything rides on.

0.1 TypeDesc worlds and domains
	•	Worlds: scalar | signal | field | special
	•	Domains: at minimum:
	•	number, vec2, color, phase, trigger
	•	domain (special)
	•	renderTree (special)

Why it matters: A Domain should not be faked as ElementCount or Field<vec2>. Make it explicit and typed as special:domain.

0.2 Domain identity contract (non-negotiable)

A Domain value must provide:
	•	count: number
	•	ids: Uint32Array | BigInt64Array | string[] (stable identities)
	•	optional: seed: Seed or seedBasis for per-id hashing
	•	optional: topology metadata later (neighbors)

This is the foundation of “no-jank”.

⸻

Phase 1 — Domain primitives (element populations)

1) DomainConst (or DomainN)

Purpose: Create a stable population of N elements.
	•	Inputs:
	•	n: scalar:number (or param)
	•	seed: scalar:number (optional; stable)
	•	Outputs:
	•	Domain: special:domain

Alignment with buses:
	•	n can be bus-driven, but changing n is inherently janky unless you define policies. See below.
	•	In practice, you keep n as a param or slow signal for v1.

No-jank live edits:
	•	When block graph edits occur, existing Domain IDs must remain stable.
	•	If n changes:
	•	shrinking: keep first K IDs (stable)
	•	growing: append new IDs deterministically (stable)
	•	This is the first place you decide your Domain ID generation policy:
	•	simplest: IDs = 0..n-1
	•	better: IDs = hash(seed, index) (still stable)
	•	best: stable monotonic pool with deterministic extension

Why this is primitive #1: nothing else can be per-element without a Domain.

⸻

2) DomainFromSVGSample (v1 minimal)

Purpose: Produce a Domain from an SVG path sample count.
	•	Inputs:
	•	path: special:pathRef or special:svgAsset
	•	sampleCount: scalar:number
	•	Outputs:
	•	Domain
	•	optional: pathMeta (bounds)

Alignment:
	•	Still produces the same Domain shape as DomainN, just anchored to asset.
	•	Ensures “what do I animate?” is solved without an SVG editor.

No-jank:
	•	Domain IDs should be stable across recompile if the SVG asset + sampleCount unchanged.
	•	If the SVG asset changes, you accept a reset (but handle it gracefully with state mapping/crossfade at runtime).

⸻

Phase 2 — Field primitives (attribute mappers)

These primitives all take a Domain and output Field(s) aligned to that Domain.

3) PositionMapGrid

Purpose: Map Domain element IDs to grid positions.
	•	Inputs:
	•	domain: Domain
	•	rows: scalar:number (or derive)
	•	cols: scalar:number (or derive)
	•	spacing: scalar:number
	•	origin: scalar:vec2
	•	order: enum (row-major, serpentine)
	•	Outputs:
	•	pos: field:vec2

Alignment with bus/type system:
	•	pos is Field<vec2> in TypeDesc.
	•	rows/cols/spacing can be driven by buses via signals → scalars (or signal->field broadcast) but initially keep them scalar/param for clarity.
	•	You can still publish pos to a Field bus (advanced later).

No-jank edits:
	•	If you change “grid settings,” elements move but identities persist, so you don’t get flicker.
	•	If you change rows/cols, you are changing how indices map to positions; IDs still stable.

Important mismatch rule:
	•	Domain count must match mapper output count (always).
	•	If rows*cols != domain.count, mapper must have a policy:
	•	fit = wrap (repeat grid traversal)
	•	fit = crop (ignore excess, still outputs positions for all IDs by wrapping or clamping)
The output must always provide position for every element ID.

⸻

4) PositionMapCircle (and later: line, spiral)

Same structure as GridMap, different mapping math.
	•	Inputs: domain, radius, center, startAngle, winding
	•	Output: Field<vec2>

Why it’s a primitive: you want “CirclePoints” to be a composite, but the mapper is primitive.

⸻

5) ScalarFieldConst

Purpose: Give every element the same value (per-element constant).
	•	Inputs:
	•	domain: Domain
	•	value: scalar:number | vec2 | color
	•	Outputs:
	•	Field<T>

This is the primitive that makes a lot of higher stuff trivial:
	•	uniform size field
	•	uniform color field
	•	uniform rotation field

Alignment:
	•	This is the explicit and cheap version of “broadcast a signal to a field.”
	•	Later, “broadcast” can become a lens step; but this block keeps it visible and predictable.

No-jank:
	•	Always stable.

⸻

6) FieldMap (unary) and FieldZip (binary)

These are the canonical “math” primitives for fields.
	•	FieldMap: Field<A> -> Field<B> via a function id
	•	FieldZip: Field<A>, Field<B> -> Field<C> via a function id

Alignment:
	•	This is where your lazy FieldExpr DAG lives.
	•	These blocks compile to FieldExpr nodes; no materialization.

No-jank:
	•	Identity stability is inherited from the input Domain. As long as the Domain doesn’t change, the field results don’t flicker.

Why these are critical:
	•	Without them you’ll keep adding bespoke blocks like “BurstStagger” for everything.
	•	With them, many “node types” become presets/lens stacks instead of primitives.

⸻

7) FieldHashById (deterministic per-element variation)

Purpose: Generate stable per-element variation without randomness.
	•	Inputs:
	•	domain: Domain
	•	seed: scalar:number
	•	Output:
	•	Field<number> in [0,1) (or multiple outputs)

Alignment:
	•	Deterministic variation is now a first-class primitive.
	•	Later you can add “hash to vec2” or “hash to color index”.

No-jank:
	•	Variation follows element identity; if you change mapper settings or swap renderers, the “character” of each element remains stable.

This block is how you avoid “everything looks the same” without adding chaos.

⸻

Phase 3 — Signal primitives (time, phase, triggers)

These are global timing signals. They drive lenses and parameters.

8) PhaseClock (derived phase)
	•	Inputs: period, offset (scalar or signal)
	•	Output: signal:phase

Alignment:
	•	This is your default bus driver: publish to phaseA.
	•	Deterministic, scrub-safe.

No-jank:
	•	Editing unrelated parts should not reset phase; phase derives from absolute time.
	•	If you edit clock params, you get a predictable shift, not a state reset.

⸻

9) TriggerFromPhase (wrap trigger)
	•	Inputs: signal:phase
	•	Outputs: signal:trigger (fires on wrap)

Alignment:
	•	Enables event-driven modulation and envelopes.
	•	Triggers should almost always travel via buses (pulse bus).

⸻

10) Integrate / Delay (explicit memory)

Minimal memory primitives:
	•	Delay: one-frame or time-based delay
	•	Integrate: accumulator with dt

Alignment:
	•	These are the only legal boundaries for feedback cycles.
	•	Live patching must treat them as stateful nodes with mapping rules.

No-jank:
	•	When recompiling, state mapping uses block instance IDs + stable internal state layout.
	•	If graph structure changes but the state block remains, keep its state.

⸻

Phase 4 — Renderer primitives (what gets drawn)

Now you can actually see things.

11) RenderInstances (one renderer to start)

One renderer can cover many cases if it’s parameterized.

Inputs:
	•	domain: Domain
	•	pos: Field<vec2>
	•	shape: enum (circle/square/triangle) or path: special:pathRef
	•	size: Field<number>
	•	rot: Field<number> (optional)
	•	color: Field<color>
	•	opacity: Field<number> (optional)
Output:
	•	special:renderTree

Alignment:
	•	Renderer consumes Fields (lazy evaluation happens here).
	•	Renderer does the first major materialization step:
	•	evaluate needed field buffers for the domain
	•	emit RenderTree nodes efficiently

No-jank:
	•	Domain identity gives stable instance correspondence.
	•	If you swap shapes, positions stay consistent.
	•	If you change field expressions, instances don’t reorder.

Implementation note:
Start with a renderer that emits a single RenderTree “instanced layer” node rather than N individual nodes if you can—this keeps your RenderTree stable and reduces DOM cost.

⸻

12) RenderPathStroke (optional next)

If your “Source” world is still SVG paths, you want:
	•	render strokes, morphs, etc.
But don’t do it until instances work.

⸻

Phase 5 — Composites (starter macros) built from primitives

Once primitives exist, you make “GridPoints” as a composite.

Composite: GridPoints
	•	DomainN(n=rows*cols)
	•	PositionMapGrid(domain)
	•	ScalarFieldConst(domain, size)
	•	ScalarFieldConst(domain, color)
	•	RenderInstances(domain, pos, size, color, shape=circle)

Similarly:
	•	CirclePoints = DomainN + PositionMapCircle + RenderInstances

This is where your library becomes friendly without growing the primitive set.

⸻

How this reduces node type explosion (and fixes BurstStagger-style opacity)

With the above primitives:
	•	“BurstStagger” becomes a preset lens stack or a small composite:
	•	phase → quantize → maprange → maybe per-id offset
	•	“Per-element transport” becomes:
	•	phase + hashById + map/zip

Most “mystery blocks” turn into:
	•	either (a) a FieldMap/Zip with a known function
	•	or (b) a saved Lens preset
	•	or (c) a composite macro

That’s how you get approachability.

⸻

How this aligns with the bus system

Buses carry shared intent
	•	phaseA, energy, pulse, palette
	•	these are Signal buses first

Fields stay domain-scoped
	•	positions, sizes, colors are Field outputs
	•	you can add Field buses later (advanced), but you don’t need them to ship the core.

Lenses are the glue
	•	A block parameter subscribes to a bus and has a lens stack.
	•	That means you don’t have to build dozens of “PhaseToX” blocks.

Example:
	•	Many render parameters subscribe to phaseA
	•	Each has a different lens:
	•	ease, quantize, window gate, offset, warp, slew
Result: cohesive but non-uniform motion.

⸻

No-jank live edits: the exact alignment points

1) Stable identity originates in Domain

As long as Domain instance remains:
	•	Fields stay aligned
	•	per-element hash stays stable
	•	render instances stay consistent

2) Mappers do not create/kill identity

GridMap/CircleMap only map IDs to positions.
Changing mapper settings moves things; it doesn’t reorder who is who.

3) Runtime swap preserves state by instance IDs

State blocks keyed by:
	•	block instance ID
	•	internal state layout
	•	domain IDs where relevant

4) Graph edits are atomic

Compile new plan → validate → swap
Keep old running until new ready.
Optional crossfade on renderer output if major topology changed.

5) Avoid coupling count changes to performance-critical signals

Let count changes be:
	•	explicit
	•	slow
	•	deliberate
Count changes are the largest source of unavoidable jank; treat them as special.

⸻

Minimal “ship it” sequence (if you want the fewest primitives that unlock everything)

If you want the tightest viable set:
	1.	DomainN
	2.	PositionMapGrid
	3.	ScalarFieldConst (number + color)
	4.	FieldMap + FieldZip
	5.	FieldHashById
	6.	PhaseClock
	7.	RenderInstances

That set alone supports:
	•	GridPoints, CirclePoints (with one more mapper)
	•	per-element variation
	•	phase-driven motion
	•	palette motion
	•	ambient evolution (with integrator later)

