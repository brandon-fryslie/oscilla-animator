Adapter Spec (Complete, implementation-level)

This is the full, long-term adapter system spec for your bus/field/type model. It defines:
	•	What an adapter is (semantically and technically)
	•	Where adapters live (listener-side only, plus explicit field/signal operators)
	•	The exact adapter categories (cast, lift, reduce, time/phase lens, domain lens)
	•	The adapter chain rules (deterministic, bounded, inspectable)
	•	How adapters compile in a lazy FieldExpr world
	•	How they appear in the Bus Board + Port UI
	•	How to prevent performance footguns without “fallbacks”

This spec assumes your TypeDesc approach: (world, domain, semantics?, unit?).

⸻

1) Core Principle: Adapters are explicit per-listener lenses

A bus is a shared channel with a defined TypeDesc.
A listener port has its own TypeDesc.

If they don’t match, the system may connect them only by inserting an adapter chain on the listener binding.

Authoritative rule
	•	Adapters are attached to the listener binding, not the bus, not the publisher.
	•	Publishers publish “truth”; consumers decide “how to perceive it.”

This matches your UX intent: “change how it perceives the bus signal.”

⸻

2) Adapter Types (taxonomy)

There are four categories. Only the first two are “free” and should be common.

2.1 CAST adapters (cheap, shape-preserving)
	•	World stays the same.
	•	Domain stays the same.
	•	Only semantics/units change, or representation changes within same domain.

Examples:
	•	Signal<number>(unit=ms) → Signal<number>(unit=s)
	•	Signal<phase>(semantics=sample) → Signal<phase>(semantics=wrapped) (if representationally identical but semantically annotated)
	•	color(hsl) → color(rgb) if your runtime treats both as equivalent representation (or as a conversion)

Cost expectations: O(1) per evaluation.

2.2 LIFT adapters (change world or widen meaning)

These adapters increase structure without losing information.

Examples:
	•	Signal<T> → Field<T> (broadcast over a domain)
	•	Scalar<T> → Signal<T> (constant program)
	•	Scalar<T> → Field<T> (constant field over domain)

Cost expectations:
	•	Must compile to lazy FieldExpr nodes, not materialization.
	•	Broadcast is O(1) per element at sink time, not upfront.

2.3 REDUCE adapters (lose information, must be explicit)

These collapse structure.

Examples:
	•	Field<number> → Signal<number> (mean/max/sum)
	•	Field<vec2> → Signal<vec2> (centroid)
	•	Field<color> → Signal<color> (average)

Hard rule
	•	Reduce adapters are never auto-inserted.
	•	They require explicit user action (because they destroy per-element detail).
	•	They carry a “heavy” label in UI.

2.4 LENS adapters (domain-specific transforms)

These are the most important for usability: “map phase to radius”, “shape energy”, “quantize”, “remap”.

They can be cheap and common, but must be clearly defined.

Examples:
	•	phase → unit (phase normalization)
	•	phase → pulse(event) (edge/threshold)
	•	number → number (scale/offset, clamp, curve, smoothstep)
	•	color → color (hue rotate, lighten, mix)

Important: A lens adapter does not change world unless it’s specifically a lift/reduce lens. Most lenses keep world and change domain or semantics.

⸻

3) Adapter Definition Interface

Adapters are registered and typed.

interface Adapter {
  id: string
  label: string

  // For discovery + validation:
  from: TypeDesc
  to: TypeDesc

  // Classification & UX:
  kind: 'cast' | 'lift' | 'reduce' | 'lens'
  cost: 'free' | 'normal' | 'heavy'
  deterministic: true

  // Compilation:
  compileSignal?: (src: SignalArtifact, params: AdapterParams) => SignalArtifact
  compileFieldExpr?: (src: FieldExprArtifact, params: AdapterParams) => FieldExprArtifact

  // Some adapters need domain context:
  requiresDomain?: boolean
}

Key rule: Adapters compile to the same artifact world as their to.world.
	•	If to.world = signal → compileSignal required
	•	If to.world = field → compileFieldExpr required

⸻

4) Adapter Chains: strict and bounded

A listener binding contains:

interface ListenerBinding {
  busId: string
  to: { blockId: string; portId: string }
  chain: AdapterStep[]          // ordered
}
interface AdapterStep {
  adapterId: string
  params?: Record<string, unknown>
}

Chain constraints (hard)
	•	Max chain length: 3 steps
	•	At most one of these per chain:
	•	world change (lift/reduce)
	•	Reduce adapters cannot appear unless user explicitly chooses “Reduce…”

Determinism

Adapter chain is part of patch state. No inference at runtime. No “best guess.”

⸻

5) Compatibility Resolution Rules (how a binding is accepted)

When user binds bus → port:
	1.	If TypeDesc exactly matches → connect (no chain)
	2.	Else if there exists a chain using only:
	•	cast + lens + lift (no reduce)
	•	chain length ≤ 3
	•	and the system can auto-suggest it
→ show suggestion and auto-apply if user allows “Auto-lens” on that port
	3.	Else reject connection and show “Why” with suggested actions (including reduce option)

No silent auto-reduce. Ever.

⸻

6) Canonical adapters you must support (minimum long-term set)

This list is required for the Golden Patch and for general usability.

6.1 World adapters
	•	Scalar<T> → Signal<T> (ConstSignal)
	•	Scalar<T> → Field<T> (ConstField)
	•	Signal<T> → Field<T> (Broadcast)

6.2 Numeric lenses (Signal and Field variants)

These should exist as parametric adapters usable in chains:
	•	ScaleOffset : number → number (y = a*x + b)
	•	Clamp : number → number
	•	Curve : number → number (smoothstep / sigmoid / pow)
	•	Slew : number → number (stateful; if stateful, it’s not an adapter—see below)

Important rule: Stateful transforms are not adapters; they’re blocks.
So:
	•	Slew is a block, not an adapter.
	•	Delay is a block, not an adapter.
Adapters must be pure.

6.3 Phase lenses
	•	PhaseWrap : phase → phase (ensure [0,1))
	•	PhaseToTriangle : phase → unit (pingpong)
	•	PhaseToPulse(divisions) : phase → event
	•	PhaseOffset : phase → phase (add offset)
	•	PhaseToSin : phase → number (oscillator lens)

6.4 Color lenses
	•	HueRotate : color → color
	•	Lightness : color → color
	•	Mix : color + color → color (this is binary; belongs as block unless your adapter system supports multi-input; recommended: keep as block)

6.5 Field reduce (explicit only)
	•	ReduceMean : Field → Signal
	•	ReduceMax : Field → Signal

⸻

7) Stateful transforms are blocks, not adapters

This is critical to keep your purity and avoid hidden state in bindings.

Not adapters:
	•	Slew
	•	Integrate
	•	DelayLine
	•	SampleHold
	•	Envelope

Those must be blocks so:
	•	they appear in topology
	•	SCC/memory validation works
	•	state migration works
	•	scrubbing semantics are explicit

Adapters must remain pure and stateless.

⸻

8) Compilation semantics with Lazy FieldExpr (the big one)

8.1 Field adapters compile to FieldExpr nodes

Example: Broadcast Signal<number> → Field<number> becomes:
	•	FieldExpr.broadcast(signalRef) (lazy)
	•	At sink time, evaluator calls signal(t) once per frame and provides value to all elements without allocating an array unless needed.

8.2 Field lenses compile to map or zipSignal
	•	Field<number> + Signal<number> → Field<number> is represented as zipSignal(field, signal, fnId)

Your FieldExpr IR must directly represent:
	•	map(field, fn)
	•	zip(fieldA, fieldB, fn)
	•	zipSignal(field, signal, fn) (or represent signal as broadcast field internally)

8.3 Reduce adapters compile to sink-side reductions (heavy)

If user selects Reduce:
	•	compile to a signal artifact that, when evaluated, materializes enough of the field to compute the reduction.
	•	Must be flagged as heavy and discouraged.

⸻

9) UX spec: where adapters show up

9.1 On the port binding (the “binding dot”)

When a port listens to a bus, its binding dot shows:
	•	bus name
	•	small “lens chip” if chain length > 0:
	•	e.g. phaseA ▸ Scale(12) ▸ +3
Clicking opens the Binding Editor.

9.2 Binding Editor (required panel)

Shows:
	•	Bus: phaseA (Signal<phase>)
	•	Port expects: Field<number> or Signal<number> etc.
	•	Adapter chain as reorderable chips:
	•	each chip has params UI
	•	“Add step” dropdown filtered to valid next adapters
	•	If reduce is an option, it appears under a “Destructive / Heavy” section with warning.

9.3 Bus Board rows show aggregated adapter usage

On each bus row:
	•	publisher count
	•	listener count
	•	small histogram of adapter kinds:
	•	“12 direct, 5 lenses, 1 reduce”

This makes performance/debugging visible.

⸻

10) Performance rules (how adapters stay fast)
	1.	Adapters must not allocate per frame (except at render sinks)
	2.	Field adapters must remain lazy (FieldExpr nodes)
	3.	Chain length bounded (≤ 3)
	4.	Reduce is explicit and flagged heavy
	5.	Adapters are pure and cacheable:
	•	if adapter params unchanged, the compiled adapter node is reused

⸻

11) Deterministic ordering interaction (sortKey + adapters)

Publisher order matters for combine modes like last and layer.

Adapters do not affect ordering.
The combine happens:
	1.	sort publishers by sortKey (stable)
	2.	apply per-listener adapter chains when consuming
	3.	bus value is computed once per frame for signal buses (or as FieldExpr for field buses)

Key point: listener-side adapters do not change bus value; they change the subscriber’s perceived value.

This preserves the “shared channel” mental model.

⸻

12) Required adapter chains for the Golden Patch (explicit examples)

To make the golden patch ergonomic, these bindings should be possible:

phaseA (Signal<phase>) → radius (Field<number>)

Chain:
	1.	PhaseToSin (lens): phase → number (0..1 breath curve)
	2.	ScaleOffset (lens): number → number (radius range)
	3.	Broadcast (lift): Signal → Field
(or Broadcast first then FieldMap; either is fine as long as it stays lazy)

phaseB (Signal<phase>) → drift (Field<vec2>)

Chain:
	1.	Broadcast (lift): Signal → Field
	2.	JitterFromPhase (lens): Field + Field → Field
(This is actually binary; best as a block rather than adapter. The adapter system is unary; keep this as block.)

This highlights an important architectural decision:
	•	adapters should stay mostly unary; multi-input transforms remain blocks.

⸻

If you want to proceed next, the most important remaining decision is:
	•	Are adapters strictly unary (recommended), or do you allow multi-input adapters?
Unary keeps the system debuggable and prevents hidden compute graphs inside bindings. Multi-input adapters quickly become “blocks hiding in bindings,” which is exactly what you don’t want.

When you’re ready, say what you prefer—or just say “Next” and I’ll write the spec assuming unary-only (my strong recommendation) and include the exact UI interactions for editing chains.