5) How this impacts Fields

Fields are where looping, phase, and infinite time stop being abstract and become texture, grain, and life.
This section explains—precisely—how Fields behave in a phase-driven system without collapsing into chaos, jank, or performance death.

⸻

A. Reframing Fields: not “arrays over time”

A critical mental shift:

A Field is not “a list that updates every frame.”
A Field is a function over (element identity × time).

Formally:
	•	A Field answers the question:
“Given this element, at this time, what is its value?”
	•	Time comes from Signals (especially phase)
	•	Identity comes from the Element Domain

This reframing is what makes infinite animation feasible.

⸻

B. Lazy Fields are non-negotiable for infinite systems

Because:
	•	Infinite time means no fixed evaluation window
	•	Per-element × per-frame eager computation does not scale
	•	Fields must compose without materializing intermediate buffers

Therefore:
	•	Fields are represented as expression graphs
	•	Evaluation is pulled by sinks, not pushed by sources
	•	Materialization happens only when rendering or exporting

This is what allows:
	•	deep composability
	•	late binding to phase
	•	cheap experimentation

⸻

C. Element Domain: the anchor of stability

Every Field is evaluated over a Domain.

A Domain defines:
	•	the set of elements (points, particles, glyphs, segments…)
	•	a stable identity for each element
	•	optional topology (neighbors, order, hierarchy)

Key invariant:

Element identity must not depend on array index.

This guarantees:
	•	no flicker
	•	stable per-element phase offsets
	•	persistent per-element state (when used)

⸻

D. How looping propagates into Fields

Fields never “loop” on their own.

They loop because:
	•	they consume phase Signals
	•	they interpret phase per element

Examples:
	•	phase + elementHash * 0.2
	•	quantize(phase, steps = elementIndex % 5)
	•	gate(phase, window = elementGroup)

This creates:
	•	coherent global rhythm
	•	local desynchronization
	•	rich texture

All without any Field-level time accumulation.

⸻

E. Field buses: combining per-element influence

A Field bus combines FieldExprs, not arrays.

Combination semantics:
	•	Combination is per element
	•	All publishers must share the same Domain
	•	Combine functions are lifted pointwise

For example:
	•	Field sum: value(e) = A(e) + B(e)
	•	Field max: value(e) = max(A(e), B(e))

There is no implicit zipping or broadcasting across domains.

Domain mismatch is a compile error.

⸻

F. Phase inside Fields: controlled multiplicity

Fields can consume phase Signals in three main ways:
	1.	Uniform phase
Every element sees the same phase
	2.	Offset phase
Phase is shifted per element via stable hash
	3.	Derived phase
Per-element phase computed from signal + field

All are explicit, cheap, and deterministic.

⸻

G. Stateful Fields: rare, explicit, and scoped

State inside Fields is allowed only when:
	•	explicitly declared (DelayLine, IntegrateField, History)
	•	keyed by element identity
	•	bounded in memory

Rules:
	•	No hidden per-element state
	•	No implicit accumulation
	•	No state without a memory block

This prevents runaway complexity.

⸻

H. Performance model for Fields

The system is optimized around this flow:
	1.	Build a FieldExpr DAG
	2.	Fuse compatible operations
	3.	Evaluate in dense batches at sinks
	4.	Use typed buffers
	5.	Avoid per-element closures

Critical guarantee:

The cost of a Field is proportional to the number of elements only at render time, not at authoring time.

This is what makes live editing viable.

⸻

I. How Fields stay intuitive for users

Despite all this machinery, the UX rule is simple:
	•	Users never “edit a Field”
	•	Users bind buses and tweak interpretation
	•	Fields emerge from structure, not configuration

The complexity is structural, not procedural.

⸻

J. Why this feels musical instead of mechanical

In music:
	•	the rhythm is shared
	•	each instrument interprets it differently
	•	texture comes from timing offsets, not randomness

Fields play the role of instruments.

Phase is the rhythm.

The result:
	•	infinite variation
	•	stable identity
	•	expressive systems

⸻

When you say Next, I’ll continue with:

6) Overview of the system as a whole (runtime + UX unified view of phase, looping, and infinite animation)

—or, if you’d prefer to proceed in your original bullet order, say so and I’ll adjust.