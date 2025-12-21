This is a good moment to be very deliberate about naming, because this concept will quietly become one of the most important pieces of the mental model. The name needs to be:
	•	technically honest
	•	non-magical
	•	not cute
	•	compatible with compiler/runtime thinking
	•	comfortable living half in UI, half in graph semantics

Let’s reason from what it is, not from how it looks.

⸻

What this thing actually is

Stripped of UI language, this block is:
	•	a per-input implicit source
	•	that produces a value of a specific TypeDesc
	•	that is structurally part of the graph
	•	that is automatically substituted when no explicit upstream exists
	•	and that represents the identity / neutral element / constant fallback for that input

It is not:
	•	a parameter (too UI / too block-local)
	•	a literal (too code-y)
	•	a wire (it produces values)
	•	a bus (wrong abstraction)
	•	a macro or composite

It is:
	•	a source
	•	a constant
	•	implicit
	•	defaulted
	•	typed
	•	replaceable

That gives us a very clear semantic category.

⸻

The correct conceptual name

Default Source

That is the cleanest, most accurate name.

Why this works:
	•	Source matches graph semantics (it produces values)
	•	Default explains why it exists, not how
	•	It does not imply UI visibility
	•	It does not imply mutability
	•	It does not imply ownership by the block
	•	It scales to all worlds (Signal, Field, Scalar)

Every input always has a source.
If no explicit source is connected, the Default Source is used.

That sentence alone is worth a lot.

⸻

Why not other tempting names

Let’s quickly rule out the common alternatives so you don’t second-guess this later.

❌ Parameter

Too UI-centric, wrong abstraction. Parameters configure blocks; this feeds them.

❌ Constant

Too low-level and misleading. These are replaceable, typed, contextual sources—not just literals.

❌ Identity

Sometimes wrong. Some defaults are neutral, some are sensible, some are domain-specific. Also “identity” is already overloaded in your system.

❌ Fallback

Behavioral, not structural. Also suggests error handling.

❌ ImplicitInput / PhantomBlock

Cute, but unclear and slightly magical.

❌ InlineValue

UI-biased and minimizes the fact that this is a real node in the graph.

⸻

Canonical terminology (lock this in)

I strongly recommend you formalize the following terms:

1. Default Source (the block class)

An implicit, per-input source node that produces a typed default value when no explicit upstream connection exists.

2. Explicit Source

Any user-created block or bus that feeds an input.

3. Source Replacement Rule

When an explicit source is connected, the Default Source for that input is removed. When it is disconnected, the Default Source is reinstated.

This gives you a very crisp invariant:

Every input always has exactly one source.

That invariant will simplify:
	•	compiler logic
	•	bus/listener logic
	•	UI assumptions
	•	error handling
	•	hot swaps
	•	undo/redo

⸻

Naming in code (recommended)

Use these names consistently across layers:

Block type

type BlockType = 'DefaultSource:number' | 'DefaultSource:vec2' | ...

or, if you want one generic class:

type BlockType = 'DefaultSource'
params: { typeDesc: TypeDesc; value: unknown }

Compiler / runtime
	•	DefaultSourceBlock
	•	isDefaultSource(block)
	•	replaceDefaultSource(input, explicitSource)

UI copy (minimal, factual)
	•	Inspector label: Default value
	•	Tooltip (optional): Used when no input is connected

No metaphors. No marketing language.

⸻

Why this will age well

This naming survives future evolution:
	•	Lazy Fields? Still a source.
	•	WASM backend? Still a source.
	•	Multi-client runtime? Still a source.
	•	Composite expansion removed? Still a source.
	•	Different default behaviors per domain? Still a source.

It also plays perfectly with your desire to:
	•	remove jank
	•	eliminate disconnected states
	•	keep graphs always evaluatable
	•	reduce “plumbing” UX

⸻

Final answer

They are called:

Default Sources

If you adopt that term consistently, a lot of other design decisions will suddenly feel simpler and more inevitable.