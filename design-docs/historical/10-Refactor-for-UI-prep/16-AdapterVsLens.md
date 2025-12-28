No — in your architecture they should be related, but they are not the same thing, and treating them as the same will cause confusion and weird implementation constraints.

Here’s the clean separation that matches what you’re already doing (publishers/listeners have adapterChain and listeners also have lens/lensStack).

Terms (make these canonical)

Adapter

A type/shape conversion required to make two endpoints compatible.
	•	Purpose: make TypeDesc A → TypeDesc B valid.
	•	Lives in: compiler/type system.
	•	Usually auto-selected (or at least auto-suggested).
	•	Should be minimal and predictable.

Examples:
	•	signal:number → signal:phase (normalize / wrap, if you allow it)
	•	signal:number → field:number (broadcast)
	•	field:vec2 → field:number (reduce length, if explicitly requested)
	•	field:number → signal:number (reduce mean, expensive / warning)

These are about changing the data’s world/domain, not “how you want it to feel.”

Lens

A per-listener (or per-port) perceptual transform that keeps the same fundamental type but reshapes meaning.
	•	Purpose: “how does this consumer interpret the bus?”
	•	Lives in: binding layer / UX (BusBoard + Listener UI).
	•	Should be explicitly user-controlled and stackable.
	•	Often parameterized (scale, offset, ease, slew, quantize).

Examples (usually type-preserving):
	•	signal:phase → signal:phase (phase shift, ping-pong, wrap)
	•	signal:number → signal:number (scale, clamp, ease, slew)
	•	signal:color → signal:color (hue rotate, desat)
	•	field:number → field:number (per-element gain, remap)

These are about expression, not compatibility.

⸻

How this maps to your current code model

You currently have:
	•	Publisher.adapterChain?: AdapterStep[]
	•	Listener.adapterChain?: AdapterStep[]
	•	Listener.lens?: LensDefinition
	•	Listener.lensStack?: LensDefinition[]

The intended interpretation should be:

adapterChain

Only for compatibility.
	•	If types match exactly, adapterChain should be empty/undefined.
	•	If types don’t match but are convertible, adapterChain is the conversion path.
	•	UI should show it as “Auto conversion” (with a warning if heavy).

lensStack

Only for artistic shaping.
	•	Always optional, even when types already match.
	•	Lives on the listener (consumer-side perception).
	•	Should never be required for type-checking.

So: not all adapters are lenses, and lenses are not adapters.

⸻

The naming collision you’re experiencing

You’ve been using “lens” to mean “bus adapter” because bus-binding feels like “perception.” But type conversion is a separate axis from perception shaping.

If you keep calling conversions “lenses,” you’ll end up with problems like:
	•	“Why does my lens change Field↔Signal?” (that’s an adapter)
	•	“Can I stack multiple type conversions for creative effect?” (dangerous)
	•	“Why is this lens mandatory?” (because types didn’t match)

Better mental model:
	•	Adapters make it legal
	•	Lenses make it musical

⸻

Practical rule to enforce in code (so this stays clean)
	1.	Adapter selection happens at bind-time (when you attach listener/publisher), based on TypeDesc compatibility.
	2.	Lens editing happens at any time and never affects TypeDesc.
	3.	Heavy world-crossing adapters (reduce/broadcast) must be explicit and visually loud.
	4.	Wire connections use the same adapterChain mechanism as buses — but never the lens mechanism.

So:
	•	Wiring adapters = adapters
	•	Bus “adapter” = also adapters (if it changes type/world)
	•	Bus “lens” = lensStack (type-preserving shaping)

⸻

Recommendation on your terminology

Keep Adapter as the umbrella for compatibility conversions everywhere (wire or bus). Keep Lens for expressive shaping on listeners.

If you want a single UI term for “stuff applied on this binding,” use:
	•	“Binding Stack” (contains: 0–1 adapterChain + 0–N lenses)
But don’t collapse the concepts internally.

If you want, next we can formalize the exact allowed operations in each category (cast vs lift vs world-crossing) so the UI can enforce “lenses never change TypeDesc” at compile time.

Yes — publishers can have lenses, and in a mature version of this system they should. But the rules for them must be stricter and more intentional than listener lenses, or things will get confusing fast.

Here is the clean, durable model.

⸻

Short answer
	•	Adapters: required for compatibility → structural
	•	Lenses: expressive transforms → perceptual
	•	Publishers may have lenses
	•	Listener lenses are more common and more powerful
	•	Publisher lenses affect the bus signal itself
	•	Listener lenses affect only that consumer’s perception

This mirrors audio systems very closely (pre-fader vs post-fader processing).

⸻

The canonical mental model

Think of a bus as a shared signal line.

[Publisher] --(lens)--> BUS --(lens)--> [Listener]

	•	A publisher lens modifies what is contributed to the bus
	•	A listener lens modifies how the bus is interpreted by that listener

Adapters can exist on either side, but only to make types line up.

⸻

Publisher lenses: when they make sense

Publisher lenses are appropriate when:
	•	You want one block’s contribution to be shaped before mixing
	•	You want to treat the bus as a mixing surface
	•	You want musical concepts like:
	•	gain
	•	polarity
	•	envelope shaping
	•	phase offset
	•	temporal smear / slew

Examples

Energy bus
	•	Particle system publishes energy
	•	Publisher lens: scale(0.3)
	•	Result: this system contributes gently, not equally

Phase bus
	•	Two oscillators publish to phaseA
	•	Publisher lens on one: phaseOffset(0.25)
	•	Result: interlocked but offset rhythms

Color bus
	•	Two color sources publish
	•	Publisher lens: desaturate(0.5)
	•	Result: palette blending before consumers see it

These are absolutely valid and powerful.

⸻

Listener lenses vs Publisher lenses (very important distinction)

Aspect	Publisher Lens	Listener Lens
Affects	The bus value itself	Only this consumer
Shared	Yes	No
Risk	Higher (affects everyone)	Lower
UX frequency	Rare but important	Common
Audio analogy	Pre-fader FX	Post-fader FX

Because publisher lenses affect everyone, they must be visible and intentional in the UI.

⸻

Hard constraints (these matter)

1. Lenses must be type-preserving

On both publishers and listeners:

A lens may not change TypeDesc.world or TypeDesc.domain

If it does, it is not a lens — it is an adapter.

This gives you a clean invariant:
	•	Adapters = legality
	•	Lenses = expression

⸻

2. Publisher lenses apply before bus combine

Order of operations:

publisher output
  → publisher adapterChain
    → publisher lensStack
      → bus combine
        → listener adapterChain
          → listener lensStack

This ordering must be fixed and documented.

⸻

3. Publisher lenses must be visually obvious

Because they affect shared state:
	•	Shown on the bus channel
	•	Shown inline on the publisher binding
	•	Never hidden in a deep inspector

A good rule:

If a publisher has a lens, the bus UI should look different.

⸻

What this means for your data model

You already have almost everything:

interface Publisher {
  busId: string
  from: BindingEndpoint
  adapterChain?: AdapterStep[]
  lensStack?: LensDefinition[]   // ADD THIS (symmetry)
  enabled: boolean
  sortKey: number
}

This symmetry is good.

One extra rule to encode
	•	Default lensStack = empty
	•	Presence of a lensStack is always explicit user intent

⸻

UI implications (important)

Bus Board

Each bus channel shows:
	•	Publishers list
	•	Per-publisher mini-strip:
	•	enable toggle
	•	gain / primary lens control
	•	“⋯” to open lens stack

This feels like a mixer, not wiring.

Listener side

Listener lenses are edited in:
	•	Port inspector
	•	Inline control overlays
	•	Preset dropdowns (“soft”, “snappy”, “quantized”, etc.)

⸻

Why this is the right call long-term

If you don’t allow publisher lenses:
	•	All shaping has to be duplicated per listener
	•	Shared rhythm/energy/color relationships become brittle
	•	You lose “mixing desk” expressiveness

If you do allow them but don’t separate them from adapters:
	•	Type system becomes mushy
	•	Debugging becomes impossible
	•	You’ll regret it in 6 months

This split gives you:
	•	Musical expressiveness
	•	Compiler clarity
	•	UI legibility
	•	Determinism

⸻

Canonical rule (write this into the spec)

Both publishers and listeners may have lens stacks.
Lenses are type-preserving perceptual transforms.
Adapters are structural and never expressive.
Publisher lenses shape shared contribution; listener lenses shape private perception.

