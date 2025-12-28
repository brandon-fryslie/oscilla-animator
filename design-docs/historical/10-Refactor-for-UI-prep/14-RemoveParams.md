Yes — removing “parameters” as a separate concept and making everything an input fed by a Default Source is a strong move for Oscilla. It makes the system honest: if something affects output, it’s a signal/field in the graph, so it can be animated, bussed, lensed, composed, and hot-swapped with the same rules.

That said, there are two places where “parameters” were doing real work that you still need, and you should replace them explicitly rather than pretend they weren’t there.

The core decision

Keep exactly one concept: inputs.
Replace parameters with Default Sources (per input), plus a small amount of metadata to make defaults sane and UI pleasant.

That’s the right direction.

⸻

What you must preserve from “parameters” (without keeping them)

1) Block-local constants that users expect to be “part of the block”

Examples: RenderInstances2D.opacity, glowEnabled, glowIntensity.

If you make these inputs, you’ll get power (modulation) but you risk clutter unless you give them a “compact” representation.

Solution: inputs can have UI embedding (but they’re still real inputs).
	•	Each input has a Default Source instance.
	•	The block shows a compact control for the Default Source inline (what used to be a param control).
	•	If the user connects a wire/bus, that inline control collapses into a “Driven by …” chip.

So the UI convenience remains, but the semantics are pure graph.

2) Non-signal configuration that changes compilation, not evaluation

Examples might include: “renderer mode: circles vs squares”, “domain sampler algorithm”, “quality level”, “blend mode”, “render layer”.

Some of these are legitimately compile-time choices (they change what code is built), and driving them continuously can be nonsensical or expensive.

Solution: you still model them as inputs, but you give them a distinct world/category: call it Config (or “Static”) and make it scrub-safe, stepwise, not continuous.
	•	Config<enum> / Config<boolean> inputs are allowed.
	•	They can be changed live, but they trigger the “topology changed” hot-swap path (crossfade/freeze-and-fade).
	•	They are not meant for per-frame modulation.

This preserves the “no parameters” principle without forcing everything into Signal/Field.

⸻

The practical shape of the system

Every block port becomes one of:
	•	Signal input (time-varying)
	•	Field input (per-element)
	•	Scalar input (compile-time constant-ish)
	•	Config input (compile-time selection, enum/bool/int)

All of them get Default Sources, but:
	•	Signal default source = constant signal
	•	Field default source = constant field (uniform)
	•	Scalar default source = constant scalar
	•	Config default source = constant config

This also solves your earlier confusion about “Duration vs Point vs Transport”: if it’s a port, it’s typed, and if nothing is attached, there’s still a deterministic producer.

⸻

UI implications (good ones)

Your “PARAMETERS” section disappears entirely. Replace it with:

“Inputs” section with two tiers
	•	Primary inputs: show on the block face (Domain, Positions, Radius, Color)
	•	Secondary inputs: tucked under “More” (Opacity, Glow, GlowIntensity, Fill override…)

Each input row shows:
	•	Connection state: Default / Bus: phaseA / Wire: Oscillator.out
	•	Inline control for Default Source value (only when in Default mode)
	•	“Drive…” button to bind to bus or insert operator chain

This keeps the nice “it works immediately” experience while turning everything into modulate-able graph structure.

⸻

Two cautions (so you don’t regret it)

Caution A: Don’t create a literal hidden block per input if you care about performance/debuggability

Conceptually it’s a block, but implementation-wise it should be an implicit node (a port-local source) rather than a full Block instance in the Patch arrays, otherwise you’ll explode patch size and history noise.

Treat it as:
	•	EffectiveInput = defaultSource(...) when nothing else is attached
	•	Only materialize as a “real node” when the user “detaches” it into the graph (optional feature)

Caution B: Boolean/enum “animation” is often a footgun

Letting users modulate GlowEnabled every frame will produce flicker and compile churn.

That’s why the Config category matters: you can still drive it, but it’s event/step driven and uses safe swap rules.

⸻

Bottom line recommendation

Do it. Remove parameters.

But do it with these explicit rules:
	1.	Every former parameter becomes an input with a Default Source.
	2.	Inputs are tagged as primary/secondary for UI.
	3.	Some inputs are Config (static/step), not Signal/Field, and changing them triggers safe hot-swap behavior.
	4.	Default Sources are implicit per-port, not real patch blocks (unless explicitly “detached”).

If you want, the next step is to define the exact metadata you’ll add to Slot (or a PortSpec) to support: default value, range/UI hint, primary/secondary, and config-vs-signal semantics.