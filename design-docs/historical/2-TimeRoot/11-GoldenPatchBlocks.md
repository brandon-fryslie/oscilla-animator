Below is the complete block set (primitive + composite) required to implement the Golden Patch “Breathing Constellation” as specified, long-term, with no shortcuts, and in a way that stays consistent with:
	•	TimeRoot topology
	•	bus-first routing
	•	lazy Field evaluation
	•	stable element identity
	•	no-jank hot swaps
	•	export correctness (phase-driven sampling)

I’m listing blocks in three tiers:
	1.	Kernel / topology primitives (must be rock-solid)
	2.	Signal primitives (building modulators and energy)
	3.	Field & domain primitives (identity + per-element shaping)
	4.	Render primitives
	5.	Composites (not required for correctness, but required for usability and canonical library)

Where needed, I specify exact port types and key semantics.

⸻

1) Time / Topology Primitives (Required)

These are non-negotiable for your “looping is real” architecture.



Inputs
	•	period: Scalar<duration>
	•	mode: Scalar<enum('loop'|'pingpong')> (param or scalar)
	•	phaseOffset: Signal<phase> (optional, default 0)
	•	drift: Signal<number> (optional, default 0)

Outputs
	•	t: Signal<time> (unbounded)
	•	cycleT: Signal<time> (0..period or pingpong)
	•	phase: Signal<phase> (primary)
	•	wrap: Event (pulse)
	•	cycleIndex: Signal<number>

Built-in bus publish hooks (not optional in final system)
	•	publish phase → reserved bus phaseA
	•	publish wrap → reserved bus pulse

⸻

1.2 FiniteTimeRoot (primitive, role=TimeRoot) (not used by golden patch but required by the system spec)

(You need it because the UI/architecture requires exactly one of the three.)

1.3 InfiniteTimeRoot (primitive, role=TimeRoot)

(same rationale)

⸻

2) Signal Primitives (Required)

These primitives must exist so the golden patch is not “one-off bespoke blocks”.

2.1 BusListen (primitive utility)

Purpose: typed subscription point for any bus signal.
Outputs: out: Signal<T> or Event depending on bus type.
(Internally might not be a block if binding is per-port, but conceptually it exists. Long-term, you need a debuggable node form.)

2.2 BusPublish (primitive utility)

Same rationale.

If your system models bus binding as slot metadata rather than nodes, you still need these as conceptual primitives for debugging and tooling. In “complete long-term” architecture, they must exist as inspectable objects.

⸻

2.3 PhaseClock (primitive, derived clock)

Inputs
	•	tIn: Signal<time> xor phaseIn: Signal<phase>
	•	period: Scalar<duration>
	•	mode: Scalar<enum('loop'|'pingpong'|'once')>
	•	rate: Signal<number> (optional, default 1)
	•	phaseOffset: Signal<phase> (optional, default 0)
	•	reset: Event (optional)

Outputs
	•	phase: Signal<phase>
	•	u: Signal<unit>
	•	wrap: Event
	•	cycleIndex: Signal<number>

⸻

2.4 Oscillator (primitive) — at least one periodic source

You need a canonical periodic function; for the golden patch it’s used for “breath”.

Inputs
	•	phase: Signal<phase> (or t: Signal<time> with frequency)
	•	shape: Scalar<enum('sine'|'cosine'|'triangle'|'saw')> (param)
	•	amplitude: Signal<number> (optional)
	•	bias: Signal<number> (optional)

Outputs
	•	out: Signal<number>

You can also model this as separate Cos + Mul + Add, but long-term you want a single oscillator block because it’s what artists reach for.

⸻

2.5 Shaper (primitive)

A wave shaping block used to get pleasant motion and clamp energy.

Inputs
	•	in: Signal<number>
	•	kind: Scalar<enum('tanh'|'softclip'|'sigmoid'|'smoothstep'|'pow')>
	•	amount: Scalar<number> (optional)
Outputs
	•	out: Signal<number>

⸻

2.6 MathSignalBinary (primitive family)

You must have basic math in signal space.
	•	AddSignal : Signal + Signal → Signal
	•	MulSignal
	•	MinSignal / MaxSignal (useful for energy)
	•	ClampSignal (or Saturate)

⸻

2.7 EnvelopeAD (primitive, event→signal)

Used to generate accent energy from pulse.

Inputs
	•	trigger: Event
	•	attack: Scalar<duration>
	•	decay: Scalar<duration>
	•	peak: Scalar<number> (default 1)
Outputs
	•	env: Signal<number>

Deterministic, transport-aware.

⸻

2.8 PulseDivider (primitive) (or “PhaseQuantizedTrigger”)

To create 8 ticks per cycle without hacks.

Inputs
	•	phase: Signal<phase>
	•	divisions: Scalar<number> integer
	•	mode: Scalar<enum('rising'|'wrap')> (how to detect)
Outputs
	•	tick: Event

⸻

2.9 ColorLFO (primitive)

A stable and simple palette generator.

Inputs
	•	phase: Signal<phase>
	•	base: Scalar<color>
	•	hueSpan: Scalar<number> (degrees)
	•	sat: Scalar<number>
	•	light: Scalar<number>
Outputs
	•	color: Signal<color>

(If you prefer a palette struct domain, fine, but for the golden patch, a single color signal is enough.)

⸻

3) Domain & Field Primitives (Required)

This is where your “points to animate” problem gets solved properly.

3.1 GridDomain (primitive, domain source)

Inputs
	•	rows: Scalar<number>
	•	cols: Scalar<number>
	•	spacing: Scalar<number>
	•	origin: Scalar<vec2> or center: Scalar<vec2>
	•	optional: jitter: Scalar<number> (but keep deterministic if present)

Outputs
	•	domain: Domain (special)
	•	pos0: Field<vec2> (base positions, aligned with domain)

Domain contract
	•	stable element IDs for each cell (row/col)
	•	deterministic ordering

⸻

3.2 StableIdHash (primitive)

Generates deterministic per-element pseudo-random values from Domain identity.

Inputs
	•	domain: Domain
	•	salt: Scalar<number|string> (optional)
Outputs
	•	u01: Field<number> in [0,1)

This block is foundational for “variety without randomness”.

⸻

3.3 FieldFromSignalBroadcast (primitive adapter)

Broadcast a signal to a field lazily.

Inputs
	•	domain: Domain (or elementCount)
	•	signal: Signal<T>
Outputs
	•	field: Field<T>

This should be pure and ideally compile to a very cheap FieldExpr node.

⸻

3.4 FieldMapUnary (primitive)

Map per element: Field → Field

Inputs
	•	a: Field<A>
	•	fn: Scalar<enum or functionId>
	•	optional params
Outputs
	•	b: Field<B>

This is how phasePer gets constructed from idRand and phaseA when paired with a zip.

⸻

3.5 FieldZipBinary (primitive)

Zip two fields lazily: Field + Field → Field

You will use this everywhere long-term.

⸻

3.6 FieldZipSignal (primitive)

Zip Field with Signal → Field lazily.

This is critical because the golden patch does:
	•	Field phase offsets + global phase
	•	Field drift + global phaseB
	•	Field radius + global energy

⸻

3.7 FieldFracPhase / WrapPhase (primitive)

Because phase semantics matter and must be explicit.

Input
	•	Field or Signal
Output
	•	wrapped phase (Field or Signal)

⸻

3.8 FieldSmoothstep / FieldShaper (primitive)

A per-element shaping function; can be generalized as FieldMapUnary with fnId, but long-term artists need named shaping blocks too.

⸻

3.9 JitterFieldVec2 (primitive)

Deterministic per-element drift based on idRand and a phase input.

Inputs
	•	idRand: Field<number>
	•	phase: Signal<phase>
	•	amount: Scalar<number> (pixels)
	•	frequency: Scalar<number> (cycles per phrase)
Outputs
	•	drift: Field<vec2>

⸻

3.10 FieldAddVec2 (primitive)

pos0 + drift → pos

⸻

3.11 FieldColorize (primitive)

Combine global palette color with per-element variation.

Inputs
	•	base: Signal<color> (or palette)
	•	idRand: Field<number>
	•	variance: Scalar<number>
Outputs
	•	fill: Field<color>

⸻

3.12 FieldOpacity (primitive)

Optional but makes the patch richer:

Inputs
	•	phasePer: Field<phase>
	•	base: Scalar<number>
	•	span: Scalar<number>
Outputs
	•	opacity: Field<number>

⸻

4) Render Primitives (Required)

4.1 RenderInstances2D (primitive render sink)

The golden patch assumes a renderer that can batch instance draws.

Inputs
	•	domain: Domain
	•	position: Field<vec2>
	•	radius: Field<number>
	•	fill: Field<color>
	•	opacity: Field<number> (optional)
	•	optional: stroke, strokeWidth, etc.

Outputs
	•	renderTree: RenderTree

Implementation-level requirements
	•	Must materialize fields efficiently (ideally into typed buffers)
	•	Must preserve element ordering consistent with Domain
	•	Must not allocate per frame in a way that kills perf
	•	Must tolerate lazy FieldExpr chains

⸻

4.2 ViewportInfo (primitive)

You need a way to center the grid based on viewport/canvas size.

Outputs
	•	size: Scalar<vec2> or Signal (choose)
	•	center: Scalar<vec2>

⸻

5) Composite Blocks (Required for “golden patch as a template”)

The golden patch is not just a test. It must be a user-facing starting point. That means some composites are required so an artist can build it without seeing 30 primitives.

5.1 Composite: AmbientLoopRoot

Wraps the topology and bus publishing.

Contains:

	•	publishes phaseA + pulse
Exposes:
	•	period
	•	mode

5.2 Composite: BreathEnergy

Contains:
	•	Oscillator (cos/sine)
	•	Shaper (smoothstep/tanh)
	•	publishes to energy bus (sum)
Exposes:
	•	amount
	•	bias
	•	optional “curve”

5.3 Composite: PulseAccentEnergy

Contains:
	•	PulseDivider
	•	EnvelopeAD
	•	publishes to energy bus (sum)
Exposes:
	•	divisions
	•	decay
	•	amount

5.4 Composite: SlowPaletteDrift

Contains:
	•	PhaseClock (secondary, 32s)
	•	ColorLFO
	•	publishes to palette bus
Exposes:
	•	phrasePeriod
	•	hueSpan
	•	base color

5.5 Composite: BreathingDotsRenderer

Contains:
	•	GridDomain
	•	StableIdHash
	•	Phase spread (FieldZipSignal + wrap)
	•	RadiusFromEnergy (FieldZipSignal + shaping)
	•	JitterFieldVec2
	•	RenderInstances2D

Exposes:
	•	rows/cols/spacing
	•	radius min/max
	•	drift amount
	•	palette variance

This composite is the “single block demo” version of the golden patch.

⸻

6) Adapters required (because buses + fields must stay sane)

Even if adapters aren’t “blocks,” they must exist as first-class cast/lift operations in your type system.

Required adapters for this patch
	1.	Signal<T> → Field<T> (broadcast)
	2.	Field<phase> wrapping semantics (wrap/pingpong)
	3.	Event merge (or) (bus combine)
	4.	Signal<number> shaping/clamp (if you treat as adapter rather than block—either way it must exist)

⸻

7) Non-negotiable implementation-level properties (to make the patch real)

These are not “nice to have.” Without them, this patch will not be stable.
	1.	Domain identity contract
	•	stable element IDs
	•	deterministic ordering
	•	stable hash derived from IDs
	2.	Lazy Field evaluation
	•	FieldExpr graph
	•	evaluation only at render sink
	•	zip/map operations are lazy nodes, not materializations
	3.	Bus determinism
	•	stable publisher ordering (sortKey)
	•	reserved bus type enforcement for phaseA/pulse/etc.
	4.	No-jank program swap
	•	schedule swaps at pulse boundary
	•	preserve state keys where possible
	5.	Export by phase
	•	cyclic export must be phase-sampled for closure

⸻

Complete Block List (flat, for copy/paste into your tracker)

Time/Topology

	•	FiniteTimeRoot
	•	InfiniteTimeRoot

Signal
	•	PhaseClock (secondary)
	•	Oscillator (phase→signal)
	•	Shaper (signal)
	•	AddSignal / MulSignal / MinSignal / MaxSignal / ClampSignal
	•	PulseDivider
	•	EnvelopeAD
	•	ColorLFO
	•	(optional) SlewSignal (nice for live control stability)

Domain/Field
	•	GridDomain
	•	StableIdHash
	•	FieldFromSignalBroadcast
	•	FieldMapUnary
	•	FieldZipBinary
	•	FieldZipSignal
	•	WrapPhase (signal + field forms)
	•	FieldShaper (or Smoothstep as a named variant)
	•	JitterFieldVec2
	•	FieldAddVec2
	•	FieldColorize
	•	FieldOpacity

Render
	•	ViewportInfo
	•	RenderInstances2D

Composite Library
	•	AmbientLoopRoot
	•	BreathEnergy
	•	PulseAccentEnergy
	•	SlowPaletteDrift
	•	BreathingDotsRenderer

