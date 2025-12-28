Block registry spec: Canonical primitives

(Ports are written as name: TypeDesc where TypeDesc is (world, domain[, semantics]).)
Assumptions:
	•	Domain is special:domain
	•	Field<T> is (field, <domain>)
	•	Signal<T> is (signal, <domain>)
	•	Scalar<T> is (scalar, <domain>)
	•	Render output is (special, renderTree)
	•	All blocks are pure unless explicitly marked STATEFUL
	•	Field outputs are lazy (compile to FieldExpr) and are always evaluated against a Domain.

⸻

1) Domain primitives

1.1 DomainN

Form: primitive
Purpose: create a stable population of N elements.

Inputs
	•	n: (scalar, number) (integer expected; clamp/round policy in block)
	•	seed: (scalar, number) (optional; default 0)

Outputs
	•	domain: (special, domain)

Notes
	•	Domain IDs must be stable across recompiles as long as (seed,n) unchanged.
	•	Count changes obey stable extension/shrink policy.

⸻

1.2 DomainFromSVGSample

Form: primitive
Purpose: create domain from an SVG asset by sampling.

Inputs
	•	svgAsset: (special, path) (or asset ref; whatever your asset system uses)
	•	sampleCount: (scalar, number)
	•	seed: (scalar, number) (optional)

Outputs
	•	domain: (special, domain)
	•	bounds: (special, bounds) (optional but recommended)

Notes
	•	IDs stable for a given (assetId, sampleCount, seed).
	•	Sampling method should be deterministic.

⸻

2) Position mappers (Domain → Field)

2.1 PositionMapGrid

Form: primitive
Purpose: map domain IDs to grid positions.

Inputs
	•	domain: (special, domain)
	•	rows: (scalar, number)
	•	cols: (scalar, number)
	•	spacing: (scalar, number) (in px or world units)
	•	origin: (scalar, vec2)
	•	order: (scalar, string) (enum: "rowMajor" | "serpentine" )
	•	fit: (scalar, string) (enum: "wrap" | "crop" | "pad" )

Outputs
	•	pos: (field, vec2)

Notes
	•	Always emits a position for every element ID.
	•	If rows*cols ≠ domain.count, behavior defined by fit.

⸻

2.2 PositionMapCircle

Form: primitive
Purpose: map domain IDs to a circle/ring.

Inputs
	•	domain: (special, domain)
	•	center: (scalar, vec2)
	•	radius: (scalar, number)
	•	startAngle: (scalar, number) (radians)
	•	winding: (scalar, number) (+1/-1)
	•	distribution: (scalar, string) (enum: "even" | "goldenAngle" )

Outputs
	•	pos: (field, vec2)

⸻

2.3 PositionMapLine (optional but small and useful)

Inputs
	•	domain: (special, domain)
	•	a: (scalar, vec2)
	•	b: (scalar, vec2)
	•	distribution: (scalar, string) (enum: "even" | "easeInOut" )

Outputs
	•	pos: (field, vec2)

⸻

3) Field generators (Domain → Field)

3.1 FieldConstNumber

Form: primitive
Purpose: uniform per-element numeric value.

Inputs
	•	domain: (special, domain)
	•	value: (scalar, number)

Outputs
	•	out: (field, number)

⸻

3.2 FieldConstColor

Inputs
	•	domain: (special, domain)
	•	value: (scalar, color) (store as CSS hex or RGBA struct; pick one)

Outputs
	•	out: (field, color)

⸻

3.3 FieldConstVec2 (optional; handy)

Inputs
	•	domain: (special, domain)
	•	value: (scalar, vec2)

Outputs
	•	out: (field, vec2)

⸻

3.4 FieldHash01ById

Form: primitive
Purpose: deterministic per-element variation in [0,1).

Inputs
	•	domain: (special, domain)
	•	seed: (scalar, number) (default 0)

Outputs
	•	u: (field, number) (0..1)

Notes
	•	Must be stable for a given element ID + seed.
	•	Should not depend on element index ordering.

⸻

3.5 FieldHashVec2ById (optional; but powerful)

Inputs
	•	domain: (special, domain)
	•	seed: (scalar, number)

Outputs
	•	v: (field, vec2) (each component 0..1 or -1..1; declare policy)

⸻

4) Field combinators (lazy FieldExpr constructors)

4.1 FieldMapNumber

Form: primitive
Purpose: unary mapping over Field<number>.

Inputs
	•	x: (field, number)
	•	fn: (scalar, string) (enum id: "neg" | "abs" | "sin" | "tanh" | "smoothstep" | ..." )
	•	optional params depending on fn (e.g., k, a, b)

Outputs
	•	y: (field, number)

Notes
	•	Compiles to a FieldExpr map node; fusable.

⸻

4.2 FieldZipNumber

Form: primitive
Purpose: binary op over number fields.

Inputs
	•	a: (field, number)
	•	b: (field, number)
	•	op: (scalar, string) (enum: "add" | "sub" | "mul" | "min" | "max" )

Outputs
	•	out: (field, number)

⸻

4.3 FieldZipVec2

Inputs
	•	a: (field, vec2)
	•	b: (field, vec2)
	•	op: (scalar, string) (enum: "add" | "sub" )

Outputs
	•	out: (field, vec2)

⸻

4.4 FieldMapVec2

Inputs
	•	v: (field, vec2)
	•	fn: (scalar, string) (enum: "rotate" | "scale" | "normalize" | "clampLen" )
	•	params:
	•	angle: (scalar, number) for rotate
	•	s: (scalar, number) for scale
	•	maxLen: (scalar, number) for clampLen

Outputs
	•	out: (field, vec2)

⸻

4.5 FieldFromSignalNumber (world-lift, advanced but minimal)

Purpose: broadcast a signal into a domain-aligned field.

Inputs
	•	domain: (special, domain)
	•	x: (signal, number)

Outputs
	•	out: (field, number)

Notes
	•	Mark as “Heavy” in UI, but implementable early and very useful.

⸻

5) Signal primitives (time/phase/trigger)

5.1 PhaseClock

Form: primitive
Purpose: derived scrub-safe phase.

Inputs
	•	period: (scalar, duration) (ms; or seconds—pick one globally)
	•	offset: (scalar, duration) (optional)
	•	phaseOffset: (scalar, number) (0..1 optional; convenience)

Outputs
	•	phase: (signal, phase)

Notes
	•	phase(t) = fract((t + offset)/period + phaseOffset).

⸻

5.2 PhaseMath

Purpose: common phase ops.

Inputs
	•	phase: (signal, phase)
	•	op: (scalar, string) (enum: "wrap" | "fold" | "invert" | "quantize" )
	•	steps: (scalar, number) (for quantize)

Outputs
	•	out: (signal, phase)

⸻

5.3 TriggerOnWrap

Form: primitive
Purpose: emit trigger when phase wraps.

Inputs
	•	phase: (signal, phase)

Outputs
	•	trig: (signal, trigger)

Notes
	•	Must be deterministic, derived from phase; no hidden state.

⸻

5.4 EnvelopeAD STATEFUL

Form: primitive
Purpose: simple trigger→envelope.

Inputs
	•	trig: (signal, trigger)
	•	attack: (scalar, duration)
	•	decay: (scalar, duration)

Outputs
	•	env: (signal, number) (0..1)

Notes
	•	Explicit state (current value, phase).
	•	Declares scrub policy: performance-only unless you implement reconstruction.

⸻

5.5 DelaySignalNumber STATEFUL

Form: primitive
Purpose: delay numeric signal (feedback-safe boundary).

Inputs
	•	x: (signal, number)
	•	delay: (scalar, duration) (or samples/frames)

Outputs
	•	y: (signal, number)

Notes
	•	This is a legal cycle breaker for SCC validation.

⸻

5.6 IntegrateNumber STATEFUL

Purpose: integrate dx/dt into state.

Inputs
	•	dx: (signal, number)
	•	initial: (scalar, number)
	•	clampMin: (scalar, number) optional
	•	clampMax: (scalar, number) optional

Outputs
	•	x: (signal, number)

⸻

6) Renderer primitives (Field sinks → RenderTree)

6.1 RenderInstances2D

Form: primitive
Purpose: draw one instance per domain element.

Inputs
	•	domain: (special, domain)
	•	pos: (field, vec2)
	•	shape: (scalar, string) (enum: "circle" | "square" | "triangle" | "path" )
	•	pathAsset: (special, path) (required if shape=“path”)
	•	size: (field, number)
	•	rot: (field, number) (optional; default 0)
	•	fill: (field, color)
	•	opacity: (field, number) (optional; default 1)

Outputs
	•	tree: (special, renderTree)

Notes
	•	This is the primary Field materialization sink.
	•	Internally should evaluate fields into typed buffers once per frame for the domain.

⸻

6.2 LayerCombine (simple scene assembly)

Form: primitive
Purpose: combine multiple RenderTrees into one.

Inputs
	•	a: (special, renderTree)
	•	b: (special, renderTree)
	•	mode: (scalar, string) (enum: "over" | "add" | "multiply" )

Outputs
	•	out: (special, renderTree)

Notes
	•	Keep this minimal now; compositors can grow later.

⸻

7) Optional: minimal bus IO blocks (if you want explicit publishing as blocks)

If your bus system is UI-level binding rather than block-level, skip these.
If you want a purely “everything is a block” mode, add:

7.1 PublishSignal
	•	Inputs: x: (signal, T), bus: (scalar, string) (or bus ref)
	•	Output: passthrough x (optional)

But I’d keep publishing/subscribing as a port-level binding in v1.

⸻

Implementation order summary (canonical)
	1.	DomainN
	2.	PositionMapGrid
	3.	FieldConstNumber, FieldConstColor
	4.	FieldHash01ById
	5.	FieldMapNumber, FieldZipNumber
	6.	PhaseClock
	7.	RenderInstances2D
	8.	LayerCombine
	9.	PositionMapCircle (+ Line)
	10.	TriggerOnWrap, EnvelopeAD
	11.	DelaySignalNumber, IntegrateNumber
	12.	Heavy lifts: FieldFromSignalNumber, reducers later

