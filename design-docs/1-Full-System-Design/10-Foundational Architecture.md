
10) Foundational architecture

(Deep technical pass tying time, phase, buses, signals, fields, and the compiler/runtime into one coherent machine)

This section is the engineering truth behind everything you’ve seen so far.
If this architecture is right, everything else stays simple.
If this architecture is wrong, no amount of UX polish will save the system.

⸻

A. The single invariant that governs everything

The system is a pure function of (TimeCtx, Patch Definition, Explicit State).

Nothing else is allowed to influence evaluation.

That one sentence dictates:
	•	how looping works
	•	how scrubbing works
	•	how determinism is preserved
	•	how infinite time is possible

⸻

B. Canonical evaluation pipeline (end to end)

Every frame, the runtime does:
	1.	Produce a TimeCtx
	2.	Evaluate all Signal buses
	3.	Evaluate all Field sinks (lazy, on demand)
	4.	Produce a RenderTree
	5.	Render

No block “runs.”
No system “advances.”
Everything is queried.

⸻

C. Time is data, not control flow

C1) TimeCtx (the only time source)

TimeCtx contains:
	•	t: absolute time (double)
	•	dt: delta since last frame
	•	frame: monotonic counter
	•	mode: scrub | performance

All temporal behavior emerges from reading this structure.

There are:
	•	no engine loops
	•	no timers
	•	no hidden clocks

⸻

C2) Why absolute time is mandatory

Absolute time allows:
	•	perfect scrubbing for derived systems
	•	deterministic reconstruction
	•	stateless looping
	•	reproducible exports

Relative time only exists inside explicit state blocks.

⸻

D. Signals: pure evaluators over TimeCtx

A Signal is compiled to:

(TimeCtx, EvalCtx) → Value

Key properties:
	•	evaluated once per frame
	•	memoized per frame
	•	no side effects
	•	cheap

Phase signals are just Signals with wrap semantics.

⸻

E. Phase clocks: two architectural forms

E1) Derived phase clocks (stateless)

Computed as:

phase(t) = fract((t + offset) / period)

Properties:
	•	scrub-perfect
	•	zero state
	•	infinite precision (modulo FP)
	•	preferred default

⸻

E2) Stateful phase clocks (explicit memory)

Implemented via:
	•	PhaseAccumulator
	•	Integrate + Wrap
	•	Delay feedback

Properties:
	•	performance-first
	•	drift-capable
	•	must declare scrub behavior
	•	must cross memory boundaries

Compiler enforces legality.

⸻

F. Buses: first-class compilation nodes

A bus compiles to:
	•	Signal bus → Signal evaluator
	•	Field bus → FieldExpr node

Architecturally, buses are:
	•	shared reduction points
	•	ordering boundaries
	•	semantic anchors

They are not “wires.”
They are named influence fields.

⸻

F1) Bus compilation contract

For each bus:
	1.	Collect publishers
	2.	Sort by sortKey, then stable ID
	3.	Apply adapter chains
	4.	Combine using domain-specific reducer
	5.	Produce a single evaluator

This process is deterministic and repeatable.

⸻

G. Fields: lazy, domain-aware expression graphs

Fields compile to FieldExpr DAGs, not buffers.

A FieldExpr represents:

(elementId, TimeCtx, EvalCtx) → Value

But is evaluated in dense batches at sinks.

Key architectural rules:
	•	no per-element closures
	•	no hidden iteration
	•	explicit domain
	•	explicit identity

⸻

H. Element identity is a first-class concern

Every Field evaluation is parameterized by a Domain:
	•	stable element IDs
	•	consistent ordering
	•	optional topology (neighbors)

This ensures:
	•	no flicker
	•	stable per-element phase offsets
	•	valid per-element state

Domain mismatch is a compile error.

⸻

I. State: explicit, scoped, and inspectable

State only exists in:
	•	Delay
	•	Integrate
	•	History
	•	Explicit state blocks

Each state block:
	•	declares its memory shape
	•	declares its scrub policy
	•	is visible in the UI
	•	participates in cycle validation

There is no implicit state anywhere else.

⸻

J. Scrub vs performance at the architecture level

The only difference is:
	•	how state blocks interpret TimeCtx

Derived systems:
	•	ignore mode
	•	always correct

Stateful systems:
	•	increment in performance
	•	reconstruct or freeze in scrub

This keeps behavior predictable.

⸻

K. Compiler responsibilities (non-negotiable)

The compiler must:
	•	build a unified dependency graph (blocks + buses)
	•	detect illegal instantaneous cycles
	•	enforce memory boundaries
	•	preserve stable ordering
	•	produce evaluators with known state layouts

It must fail loudly when invariants are violated.

No fallbacks. No magic.

⸻

L. Runtime responsibilities (minimal by design)

The runtime must:
	•	hold current state buffers
	•	call evaluators
	•	swap programs safely
	•	never infer meaning

The runtime does not:
	•	know about loops
	•	know about phase
	•	know about domains
	•	know about UI concepts

This separation is critical for WASM, testing, and longevity.

⸻

M. Why this architecture scales

Because:
	•	time is uniform
	•	evaluation is pull-based
	•	state is explicit
	•	identity is stable
	•	composition is structural

You can add:
	•	new domains
	•	new loop types
	•	new state blocks
	•	new combiners

Without rewriting the system.

⸻

N. Why this architecture is hard—but correct

This design refuses:
	•	shortcuts
	•	hidden behavior
	•	timeline metaphors
	•	engine-level hacks

That makes it harder up front.

But it guarantees:
	•	infinite time
	•	determinism
	•	composability
	•	playability

Which is exactly what you’re building.

⸻

When you say Next, I’ll continue with:

11) How this makes things flexible and open-ended (like a music visualizer, but structurally deeper)

and after that:
	•	Risks & mitigations
	•	Engineering roadmap

Say Next when ready.