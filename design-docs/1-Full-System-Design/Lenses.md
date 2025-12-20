Lenses Design Spec

Lenses = per-port “perception stacks” that shape how a port reads from (or publishes to) a bus.
They are the primary mechanism for making a small set of buses produce rich, non-samey behavior—without duplicating buses or proliferating specialized blocks.

This spec is written to be implementable and extensible.

⸻

1) Purpose and non-goals

Purpose

A Lens answers:

“This port is bound to that bus. How should this port perceive that bus?”

It provides:
	•	local interpretation (consumer-specific shaping)
	•	unit/range mapping
	•	temporal feel (slew, lag, sample/hold, quantize)
	•	domain-specific transforms (phase warp, trigger shaping, color mapping)
	•	safety (clamping, NaN guards, deadzones)
	•	debuggability (you can inspect what changed where)

Non-goals
	•	Lenses are not a general subgraph editor.
	•	Lenses do not create hidden state (any stateful lens is explicit and visible).
	•	Lenses do not mutate buses.
	•	Lenses do not replace blocks for complex logic (they cover 80% “modulation feel” cases).

⸻

2) Conceptual model

2.1 Lens as a pipeline

For a port bound to a bus:

busValue → lensStack → portValue

Where lensStack is an ordered list of steps; each step is pure unless it explicitly declares memory.

2.2 Two categories of steps
	1.	Casts (type-level adapters)
	•	Ensure compatibility: world/domain/semantics
	•	Examples: signal:number → signal:phase (wrap), signal:number → field:number (broadcast)
	•	Usually auto-inserted / suggested
	2.	Shapers (feel-level transforms)
	•	Artistic intent: range, easing, gating, quantizing, slew, wavefold
	•	User-authored

Key rule: the UI should present both as “Lens steps,” but internally they’re distinct so the compiler can treat them differently.

⸻

3) Where lenses exist

3.1 Listener-side lenses (required)

Every bus subscription may have a lens stack.

This is the default and most important use:
	•	“Everything listens to phaseA, but each parameter hears it differently.”

3.2 Publisher-side lenses (optional, advanced)

A publisher may also have a lens stack that shapes what it contributes to the bus:
	•	useful for gain staging, clamping, normalization, smoothing before summing

But you can ship v1 with listener lenses only. Keep publisher lenses as a planned extension (the data model can support it).

⸻

4) Type rules and compatibility

4.1 TypeDesc integration

Each port and bus has a TypeDesc:
	•	world: signal | field | scalar | special
	•	domain: number | phase | color | trigger | vec2 | ...
	•	optional semantics, unit

A lens step has:
	•	from: TypeDesc pattern
	•	to: TypeDesc
	•	and a cost + stateful flag

4.2 Invariants
	•	A binding is valid if there exists a lens chain from bus type to port type.
	•	Lens steps are ordered and deterministic.
	•	Lens steps cannot change world unless the step is explicitly a “lift” (broadcast/reduce) and marked as such in UI.

4.3 World-changing steps are “heavy”

Examples:
	•	Signal → Field (broadcast)
	•	Field → Signal (reduce)

These must:
	•	be explicit
	•	show a warning badge (“Heavy”)
	•	require confirmation or an “Advanced” toggle depending on UX philosophy

⸻

5) The Lens Stack UI

5.1 Visual placement
	•	After binding a port to a bus, a lens icon appears next to the port (and/or next to the parameter row in the Inspector).
	•	Clicking it opens the Lens Panel (popover anchored to port, or Inspector subpanel—both acceptable; pick one consistently).

5.2 Lens icon states
	•	Hidden: no binding
	•	Hollow lens: bound, identity lens only
	•	Solid lens: custom steps present
	•	Warning lens: heavy step, type mismatch, NaN guard triggered, etc.
	•	“Memory dot”: stateful step in stack

5.3 Lens Panel layout

Header
	•	Port name + block name
	•	Bound bus chip (click to change bus)
	•	Result type (port type)
	•	“Reset to Identity” button
	•	“Save as Preset…” button

Stack
	•	Vertical list of steps (chips/rows)
	•	Each row shows:
	•	step name
	•	tiny domain icon (phase/number/trigger/color)
	•	enable toggle
	•	drag handle
	•	quick settings affordance (chevron)
	•	warning badges (Heavy/Stateful/Clamp/NaN)

Add Step
	•	A plus button opens a searchable menu
	•	Menu is filtered by:
	•	current type at that point in stack
	•	domain relevance
	•	common presets first

Footer (optional)
	•	Live preview of:
	•	bus value (input)
	•	post-lens value (output)
	•	small sparkline or ring depending on domain

5.4 Interactions
	•	Drag reorder steps
	•	Toggle enable per step
	•	Expand step to edit parameters
	•	Steps can be duplicated
	•	Undo/redo works naturally

5.5 Progressive disclosure

Default “Basic” steps shown prominently:
	•	Map Range
	•	Ease
	•	Quantize
	•	Slew
	•	Gate Window (phase)
	•	Clamp
	•	Deadzone

Advanced steps behind “More…”:
	•	Wavefolder / Softclip
	•	Hysteresis
	•	SampleHold
	•	Peak Detect
	•	Reduce/Broadcast (world change)

⸻

6) Lens Step Library (canonical set)

Below is a recommended v1/v1.1 step set. Each step lists: domain applicability, statefulness, and typical use.

6.1 Universal numeric steps (signal:number or field:number)
	1.	Map Range (pure)
	•	inMin/inMax → outMin/outMax, with optional clamp
	2.	Clamp (pure)
	3.	Deadzone (pure)
	4.	Ease (pure)
	•	curve: linear, smoothstep, expo, etc.
	5.	Quantize (pure)
	•	steps, optional jitter via deterministic hash (not random)
	6.	Slew / Lag (stateful)
	•	attack/release, or tau
	7.	Softclip / Tanh (pure)
	8.	Wavefold (pure)

6.2 Phase-specific (signal:phase)
	1.	Offset Phase (pure)
	2.	Scale Phase (tempo) (pure)
	3.	Wrap / Fold (pure)
	4.	Phase Window Gate (pure)
	•	active in [a,b), outputs 0 otherwise, or gates to trigger
	5.	Phase Warp (pure)
	•	nonlinear remap: ease, power curve, skew
	6.	Phase Quantize (pure)
	•	steps per cycle
	7.	Wrap Trigger (pure, changes domain to trigger)
	•	emits trigger on wrap

6.3 Trigger/event shaping (signal:trigger)
	1.	Debounce (stateful)
	2.	Pulse Stretch (stateful)
	3.	Edge Detect (stateful if derived from boolean)
	4.	To Envelope (stateful)
	•	converts trigger to attack/decay envelope (signal:number)

6.4 Color (signal:color / field:color)
	1.	Mix With (pure)
	2.	Hue Shift (pure)
	3.	Palette Lookup (pure; may reference palette bus)
	4.	Saturation/Value scale (pure)

6.5 Vec2 (signal:vec2 / field:vec2)
	1.	Scale (pure)
	2.	Rotate (pure)
	3.	Clamp Length (pure)
	4.	Noise-free wobble (stateful only if using integrators; otherwise pure trig)

6.6 World-changing steps (advanced)
	1.	Broadcast (signal:T → field:T) (pure but heavy)
	•	requires a Domain input; it uses the domain’s element count + identity, returns uniform value for all elements
	2.	Reduce (field:T → signal:T) (pure but heavy)
	•	reducer: mean/max/min/sum; must specify reducer explicitly

⸻

7) Semantics: how lenses compile

7.1 Compilation model

A lens stack compiles into one of:
	•	a Signal evaluator transform pipeline
	•	a FieldExpr pipeline (preferred, lazy)
	•	or a mixed pipeline if heavy steps are present (discouraged)

7.2 Fusion rules
	•	Consecutive pure shapers should fuse.
	•	MapRange + Clamp + Ease should fuse into a single kernel where possible.
	•	Multiple quantizes can collapse.
	•	Disabled steps are removed.
	•	Identity lens compiles to a no-op (no overhead).

7.3 Stateful lens steps

Stateful steps are allowed but must:
	•	declare scrub policy:
	•	reconstructable from TimeCtx? (rare)
	•	performance-only? (common)
	•	show “Memory dot” badge in UI
	•	participate in cycle legality if they feed back (usually they won’t)

Important: Stateful lens steps should be treated similarly to explicit blocks, just packaged into the port’s lens pipeline.

⸻

8) Determinism and ordering
	•	Lenses are local; they do not affect global bus ordering.
	•	Publisher ordering is controlled by sortKey; the lens applies after bus combine (listener-side).
	•	If publisher-side lenses exist, they apply before bus combine for that publisher only.

All deterministic:
	•	stable compilation
	•	stable evaluation order
	•	no hidden randomness

⸻

9) Debugging / inspection

9.1 Live probe

Lens panel shows:
	•	bus input value
	•	post-step values (optional; expensive)
	•	final output value

You can implement a “tap” mode:
	•	hover a step to see the value after that step (for signal)
	•	for field, sample a few element IDs (e.g., element 0, median, a selected element)

9.2 Why-is-this-moving

From a parameter, you can open:
	•	“Influence trace”
	•	bound bus
	•	publishers (ordered)
	•	combine mode
	•	lens stack
	•	final value

This is essential for non-technical users.

⸻

10) Presets and reusability

10.1 Lens Presets

Users can save a lens stack as a preset:
	•	name
	•	domain tags (phase/number/color)
	•	input/output TypeDesc patterns
	•	thumbnail preview (optional)

Presets appear in “Add Step” menu as:
	•	“Apply preset: …”

10.2 Starter preset set (ship with product)

Examples:
	•	“Phase → Ease In Out”
	•	“Phase → 8-step sequencer”
	•	“Phase → Stutter gate”
	•	“Energy → Slow attack / fast release”
	•	“Trigger → Decay envelope”
	•	“Palette → Slow drift”

⸻

11) Data model (minimal, stable)

11.1 Listener binding

A listener binding stores:
	•	busId
	•	lens: LensStack

11.2 LensStack
	•	steps: LensStepInstance[]
	•	optional uiCollapsed: boolean
	•	optional presetId?: string (if derived)

11.3 LensStepInstance
	•	type: LensStepTypeId
	•	params: Record<string, JSONValue>
	•	isEnabled: boolean
	•	uiExpanded?: boolean

11.4 LensStepType (registry)
	•	id
	•	label
	•	from: TypePattern
	•	to: TypeDesc
	•	category: cast | shape | heavy | stateful
	•	costHint: none | light | heavy
	•	stateful: boolean
	•	compile(planNode, params) → planNode
	•	where planNode is either SignalPlan or FieldExprPlan

Note: Keep it registry-driven like blocks. It becomes an ecosystem.

⸻

12) UX policies that prevent complexity explosion
	1.	Identity lens is default and visible.
	2.	Auto-suggest lens steps when binding mismatched semantics:
	•	e.g., binding signal:number to phase parameter suggests WrapAsPhase
	3.	Heavy steps require intent
	•	world-changing operations are not auto-inserted silently
	4.	Stateful steps are always marked
	5.	Lens stacks are short by design
	•	provide “macro steps” (compound lens steps) like “Envelope” or “Stutter Gate” so users don’t chain 12 primitives.

⸻

13) Relationship to blocks and composites
	•	Lenses are micro-compositors at the binding level.
	•	Blocks are structural nodes.
	•	Composites bundle blocks and possibly expose buses/ports.
	•	Lenses remain attached to the consumer port, so they survive internal refactors.

This is a major reason lenses are worth doing: they reduce rewiring churn.

⸻

14) Performance contract

A lens stack must be cheap enough that users can put them everywhere.

Targets:
	•	Identity lens: ~zero overhead (optimized away)
	•	Typical signal lens: a handful of ops per frame
	•	Typical field lens: fused into sink loops (no intermediate buffers)
	•	Heavy steps: explicitly marked and discouraged for mass use

A compilation pass should:
	•	fuse
	•	eliminate
	•	specialize by domain

⸻

15) Failure modes & safeguards

Type mismatch
	•	Lens editor shows red “cannot resolve” state
	•	suggests steps that would fix it
	•	compile fails loudly if unresolved

NaN/Inf propagation
	•	Provide a universal “Sanitize” step:
	•	replace NaN with 0 (or silent value)
	•	optional clamp
	•	This is important for long-running installations.

Over-modulation
	•	Provide “Gain” step and standardize it
	•	Many systems fail because everything sums to nonsense

⸻

16) What makes lenses “the right abstraction” here

Without lenses:
	•	you need many buses to avoid sameness
	•	you need many small utility blocks to interpret those buses
	•	patches get wide and hard to read

With lenses:
	•	a few global buses can drive deep variety
	•	interpretation is local and visible
	•	causality stays legible
	•	you get the “modular synth” feeling without the spaghetti

⸻

If you want, next I can produce:
	•	the exact step list and parameter schemas for a v1 lens library (down to each param name/default/range),
	•	plus a UI wire spec (pixel-level behavior: where the lens icon appears, hover states, keyboard shortcuts, and how the add-step search is filtered).