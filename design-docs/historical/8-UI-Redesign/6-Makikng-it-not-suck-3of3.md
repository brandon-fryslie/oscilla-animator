3 of 3: Policy spec — direct binding vs bus binding, with conversion UX and type/lens rules

(Complete, rigorous, long-term practical: “how the system never becomes spaghetti”)

This spec defines when direct block→block dependencies are allowed, when they are forbidden, how the UI enforces that, how conversion works, and how lenses/operators integrate without clutter or ambiguity.

Think of this as the law of the land that keeps the system fun.

⸻

1) Relationship policy: the only three “transport layers”

Every value transfer in a graph must be one of:
	1.	Direct Binding (local, short, single-writer)
	2.	Bus Binding (named, many-to-many, combined)
	3.	Inline Literal (constant or param widget)

Nothing else exists.

⸻

2) Direct Binding: what it is and why it exists

Direct binding exists only to support “close-coupled” construction where buses would be ceremony.

Examples:
	•	Add consumes Sin output
	•	Scale consumes PhaseClock output
	•	RenderInstances2D.radius consumes a MapRange output

Direct binding is therefore local glue, not a routing mechanism.

2.1 Direct binding invariants

A direct binding must satisfy all of:
	•	Single writer: one upstream source
	•	Single hop: direct edge only; chaining occurs by multiple direct bindings, not one long cable
	•	Short: eligible for short connector rendering (distance <= Lmax)
	•	Same graph: never cross-graph
	•	Same cluster: producer and consumer must share clusterKey (or be in a sanctioned adjacency relationship, see below)

If any invariant is violated, direct binding is not permitted. The UI forces bus binding.

⸻

3) Bus Binding: the default routing mechanism

Bus binding is the default for:
	•	modulation (phaseA, energy, pulse)
	•	shared control signals
	•	layering / mixing
	•	cross-cutting influences

Bus binding can be many-to-many, with combination semantics and lens chains.

3.1 Bus binding invariants
	•	Subscriber can have exactly one bus bound per input port (plus lens chain)
	•	Publisher can publish to multiple buses (rare but allowed)
	•	Bus world is immutable (signal vs field)

⸻

4) The Decision Table (authoritative)

This table defines what transport layer should be used, and what the editor enforces.

4.1 Value world & domain categories

We categorize TypeDesc into Policy Domains:

A) High-frequency modulation (always bus-friendly)
	•	signal:number, signal:phase, signal:unit, signal:vec2, signal:color
	•	event/trigger buses (if you have them)

B) Local operator glue (direct-friendly)
	•	signal:number between math ops
	•	signal:phase into shaping ops
	•	scalar:number/vec2/color into converters
	•	small “utility” nodes

C) Heavy per-element (field) (bus is primary; direct only for immediate consumption)
	•	field:number/vec2/color/path/etc.

D) Authority outputs (never bus-combined casually)
	•	Domain
	•	RenderTree / Scene / RenderNode
	•	TimeModel / Timeline hints
	•	Spec:* types

⸻

4.2 Policy matrix (what’s allowed)

1) signal → signal (same domain)

Allowed: direct OR bus
Default: direct for local chains, bus for cross-cutting modulation

Enforcement:
	•	direct allowed only if within Lmax and same cluster
	•	if not, subscribe/publish bus required

2) signal → signal (convertible)

Allowed: bus with lens chain OR direct with inline converter
Default: bus + lens chain

Reason: keeps the transformation visible at the port.

Example: signal:phase → signal:number is allowed if semantics match (phase used as normalized).
	•	direct path: insert converter operator block (auto)
	•	bus path: lens chain step phaseAsUnit or mapRange

Hard rule: conversions are never “implicit”. They must exist as either:
	•	lens step on the binding, or
	•	an explicit converter operator block

3) scalar → signal

Allowed: direct only (conceptually “lift constant into time”)
Default: inline literal widget, not a block

If needed: bus is allowed only if the bus is also scalar (rare). Prefer a signal constant operator.

4) signal → field

Allowed: bus only, with explicit lift (broadcast / sample)
Default: bus + lens chain

This is a critical clarity rule: going from time signal to per-element values must be explicit.
	•	Lens step example: broadcast(signal:number) -> field:number
	•	Optional step: perElementOffset (id-hash jitter)

5) field → field

Allowed: direct only when it is a tight pipeline feeding one sink
Default: direct within a rendering subsystem; bus for shared fields

Enforcement:
	•	if a field is consumed by more than one consumer, strongly recommend bus
	•	if field binding would create long connector or cross-cluster link, force bus
	•	if combine mode is required for fields, it must be bus (direct has no combine)

6) field → signal (reduce)

Allowed: bus only, with explicit reduce lens (heavy)
Default: disallowed unless user opts into “heavy adapter”

UX enforcement:
	•	Reduce is flagged “expensive” and requires an explicit confirmation per binding.
	•	Binding chip shows ⚠ Reduce(mean) etc.

7) Domain / Render / Spec types

Allowed: direct only within same subsystem
Default: never bus

Buses are not for authorities. They are for modulation.

⸻

5) Sanctioned adjacency rules (the exceptions)

Some blocks should be adjacent even if clusters differ because they form a “unit”:
	•	Domain producers adjacent to their first mapper/render sink
	•	TimeRoot adjacent to primary phase/pulse derivations
	•	Render sink adjacent to its immediate shaping stack

These are layout exceptions only; they do not alter the binding rules. They simply improve proximity for legitimate direct bindings.

⸻

6) The “no-long-edges” enforcement algorithm (UI-level)

When user attempts to create or preserve a direct binding:
	1.	Layout is computed.
	2.	Compute prospective connector length d.
	3.	If d <= Lmax AND same clusterKey (or sanctioned adjacency):
	•	allow direct binding
	•	render short arrow
	4.	Else:
	•	direct binding is not allowed
	•	editor automatically proposes bus binding:
	•	either select existing bus
	•	or create a new bus with suggested name

This rule is what prevents the UI from ever degenerating into spaghetti.

⸻

7) Conversion UX: “Direct → Bus” and “Bus → Direct”

7.1 Direct → Bus (primary)

Trigger points:
	•	connector too long after layout
	•	user chooses “convert to bus” on a direct binding chip
	•	user needs to share same value with multiple consumers

Flow (no modal unless naming):
	1.	On the consumer port chip: from: BlockName click
	2.	Popover actions:
	•	“Convert to Bus…”
	•	“Keep Direct (not recommended)” (only available if still within Lmax; otherwise absent)

Convert to Bus:
	•	Opens bus picker with:
	•	existing compatible buses
	•	“Create New Bus” at top

Auto-suggest bus name:
	•	derived from consumer port semantic name (radius → radius, phase → phaseA)
	•	if a standard bus exists (phaseA, energy), suggest it

On accept:
	•	remove directBinding edge
	•	create publisher on producer output to bus (or subscriber on consumer input, depending on direction model)
	•	create subscriber on consumer input
	•	lens chain copied if any (see below)

7.2 Bus → Direct (rare, but useful for cleanup)

Allowed only if:
	•	there is exactly one publisher
	•	bus combine mode is effectively passthrough (last) and no other subscribers rely on its identity
	•	the two blocks can be adjacent within Lmax

Flow:
	•	In binding editor popover:
	•	“Inline (direct)”
	•	On accept:
	•	creates directBinding
	•	removes subscriber
	•	optionally removes bus if now unused (only if user confirms)

⸻

8) Lens/operator placement rules (to avoid clutter)

You asked earlier: does every port have a transformer? The answer in this model:

Every bus subscription has a lens chain.
Direct bindings do not have hidden transformers; transforms are explicit operator blocks.

That yields clean mental separation.

8.1 Where transforms live
	•	Bus binding transforms live in the binding chip as a lens chain
	•	Direct binding transforms are separate operator blocks placed by the system

8.2 Lens chain UI rules

A bus chip renders like:

⟵ phaseA · Scale(3→15) · Ease(InOut) · Slew(60ms)
	•	Always shows first lens step if any
	•	Collapses to ⟵ phaseA · +2 if more than 2 steps in overview density
	•	Clicking opens Lens Editor

8.3 Lens Editor rules (no surprises)
	•	Steps are ordered; reorderable
	•	Each step must declare:
	•	fromTypeDesc, toTypeDesc
	•	“cost class” (cheap/moderate/heavy)
	•	Editor must display type evolution: phase → unit → number → number
	•	Heavy steps require explicit acknowledgment on first use (reduce, resample, etc.)

8.4 Auto-suggestion policy

When binding a bus to an incompatible port:
	•	system offers a single best path (not a menu of 20 adapters)
	•	user can expand “other paths” if they want

This prevents the tool from feeling technical.

⸻

9) Direct binding creation UX (no wire drawing)

Direct binding is created only through structured actions:
	•	Typed chooser insertion (“insert block that produces this value”)
	•	“Use output from…” action list on an input port

9.1 “Use output from…” list

For an unbound port:
	•	show compatible outputs within the same cluster first
	•	then “other cluster” outputs appear but selecting them will:
	•	either refuse direct (force bus), or
	•	auto-insert an intermediate block to bring it local (rare; generally don’t)

Hard UI rule: never let the user create a direct binding that will be forced to convert moments later. If it can’t be local, start with bus.

⸻

10) Composite and graph boundaries in this policy
	•	Direct bindings do not cross composite boundaries unless the composite explicitly exposes a port as direct-bindable.
	•	Bus bindings are always allowed at composite boundaries (that’s the point).

This ensures you never reintroduce the “composite expansion breaks routing” class of problems: buses operate at the semantic interface level.

⸻

11) Diagnostics: when the UI must complain

The editor must emit diagnostics (non-fatal) when:
	•	A direct binding exists but is not drawable (d > Lmax)
	•	Suggest convert to bus
	•	A bus has only one publisher and one subscriber and no semantic name
	•	Suggest inline/direct cleanup (optional)
	•	A subscription has heavy lens step
	•	Show performance warning badge on chip
	•	A bus is unused or silent
	•	Show “Silent” badge on BusBoard

These keep patches healthy over time.

⸻

12) Summary: the “anti-suck contract”

Your system won’t suck if these are true:
	1.	Direct edges are always short or they don’t exist.
	2.	Buses handle long-range and many-to-many relationships.
	3.	Transforms are always visible (lens chain or explicit operator blocks).
	4.	Layout is deterministic; users never organize diagrams.
	5.	The UI never lets you do something it will immediately punish.

That’s the complete policy spec.

If you want another message later, the natural next artifact is a complete event-flow spec for each user action (bind, convert, swap, insert) so engineers don’t invent interaction quirks.