
Adapter Spec Addendum: Unary-only adapters (recommended) + exact UI interactions for editing chains

I’m going to lock the decision and specify the system as:

Adapters are unary-only.
Multi-input transforms are blocks.

This is a deliberate design choice that keeps adapters as lenses rather than “hidden subgraphs,” preserves debuggability, and prevents the binding system from becoming a second patch language.

Everything below is written as a complete interaction spec you can hand to design + engineering.

⸻

0) Decision: Unary-only adapters

Definition

An adapter step takes exactly one source value and outputs exactly one value:
	•	T → U (Signal or FieldExpr)
	•	It may use parameters and context (time, seed, domain metadata), but not additional signals/fields.

Explicit non-goal
	•	No T + V → U adapters
	•	No adapters that reference another bus internally
	•	No “side-chain” in the binding layer

What replaces multi-input adapters

Multi-input transforms are normal blocks:
	•	Zip(Field, Signal) → Field
	•	Mix(Color, Color) → Color
	•	Jitter(idRand, phaseB) → Field<vec2>

This keeps all multi-input logic visible in the patch graph (or in composites).

⸻

1) The Binding Model (exact data)

Each listener is a binding between:
	•	a bus
	•	a port
	•	a unary adapter chain

interface Listener {
  id: string
  busId: string
  to: { blockId: string; portId: string }

  // unary chain, ordered:
  chain: AdapterStep[]

  // optional UI metadata:
  ui?: { collapsed?: boolean }
}

interface AdapterStep {
  adapterId: string
  params: Record<string, unknown>
}

No other hidden state.

⸻

2) Binding Creation UX (bus → port)

2.1 Primary interaction: click input “binding dot”

Input port UI has a Binding Dot (empty or filled).

Empty state
	•	Dot is hollow
	•	Tooltip: “Bind to bus”

On click

Opens Bus Picker popover anchored to the dot.

Bus Picker contents
	1.	Search field (filter by name/type)
	2.	“Compatible” section (direct match)
	3.	“Convertible” section (requires adapters)
	4.	“Incompatible” section (disabled, shows why)
	5.	“New Bus…” button (if allowed from input side)

When user selects a bus

System attempts:
	•	If direct match → creates Listener with empty chain
	•	If convertible → creates Listener with suggested chain, but shows a confirmation mini-panel:
	•	“Using lens: Phase → Number → Field (Broadcast)”
	•	[Accept] [Edit chain]

If user accepts: listener is created and active immediately.

⸻

3) The Binding Editor (the core UI)

Every binding has a single place to edit it: Binding Editor Panel.

3.1 How it opens
	•	Click the filled binding dot
	•	Or click the small lens-chip next to the port label
	•	Or click the bus row “listeners” count and choose the listener

3.2 Layout (exact)

Header
	•	Title: Binding
	•	Subtitle: phaseA → DotsRenderer.radius

Row A: Bus
	•	Left: Bus name + type badge
	•	Right: [Go to Bus] (highlights bus in Bus Board)
	•	Below: live preview scope

Row B: Port
	•	Left: Block name + port name + expected type badge
	•	Right: [Go to Block] (highlights block)

Row C: Adapter Chain
	•	A horizontal chain lane:
	•	[BusValue] → [Step 1] → [Step 2] → [PortValue]
	•	Each step is a chip with:
	•	adapter name
	•	compact param summary
	•	warning icon if heavy (rare; reduce)
	•	drag handle (for reorder when allowed)

Row D: Add Step
	•	Button: + Add Lens
	•	Opens adapter menu filtered to valid next steps

Row E: Actions
	•	[Remove Binding]
	•	[Reset Chain] (remove steps)
	•	[Advanced] (shows raw TypeDesc)

⸻

4) Step chip interactions (precise)

4.1 Click a step chip → expands inline params

Expanded view shows:
	•	adapter description (1 line)
	•	param controls (sliders, dropdowns)
	•	“Result type” readout (TypeDesc)
	•	“Cost” badge (free/normal/heavy)

4.2 Reordering rules

Reordering is allowed only if it preserves type continuity.
	•	Drag step chip
	•	As you drag, invalid insertion points are visibly blocked
	•	Dropping in invalid position snaps back

4.3 Deleting
	•	Step chip has ×
	•	Deleting recomputes type continuity:
	•	if chain becomes invalid, show “Broken chain” state and disable Apply until fixed

⸻

5) Type continuity and validation in the editor

Binding Editor always shows a type pipeline:

BusType → (Step1) → (Step2) → PortType

If any step causes mismatch:
	•	Chain lane turns red at the break point
	•	A message appears:
	•	“Step 2 outputs Signal but next expects Field”
	•	“Fix suggestions” appear:
	•	Add Broadcast
	•	Replace Step 2 with Field variant (if exists)

No fallback.

⸻

6) Unary adapter catalog (how it appears in UI)

Adapter menu is grouped by category:

Cast
	•	Unit conversion
	•	Color format conversion

Lens
	•	Phase: wrap, triangle, sin, quantize
	•	Number: scale/offset, clamp, curve
	•	Color: hue rotate, lighten, saturate

Lift
	•	Broadcast Signal→Field
	•	Scalar→Signal
	•	Scalar→Field

Reduce (explicit only)
	•	Field→Signal mean/max/sum
This group is hidden behind a disclosure: “Destructive / Heavy”

⸻

7) Making adapters feel musical, not technical

The key to making this not feel like math is naming + defaults + visual affordances.

7.1 Default suggested chains use “musical names”

Instead of showing:
	•	“PhaseToSin”
show:
	•	“Breath”
	•	“Pulse”
	•	“Swing”
	•	“Ease”

Technically these are still adapters; they’re presets of parameterized adapters.

Example:
	•	“Breath” = PhaseToSin + Curve(smoothstep)
	•	“Pulse 8” = PhaseQuantize(div=8) + PulseEdge

7.2 Each step shows a tiny sparkline preview

Even if the signal is phase, the adapter preview shows its mapping shape (like a transfer function).

This is huge for usability:
	•	artists can see what “Curve” means instantly

⸻

8) Performance rules (UI-enforced)

Because adapters can be abused, the editor must enforce guardrails:
	1.	Chain length max 3
	2.	Only one world-change step allowed (lift/reduce)
	3.	Reduce steps require explicit confirmation:
	•	“This collapses per-element detail and may be expensive.”
	4.	When a binding includes reduce:
	•	show a ⚠ badge on the port and on the bus row

⸻

9) Interaction with composites (important)

Bindings target the composite’s exposed input port, not internal ports.
	•	The adapter chain is always stored on the listener targeting that exposed port.
	•	Composite compilation must route the adapted value into internal graph as if it was a normal input.

This preserves:
	•	composite opacity
	•	binding stability across composite edits
	•	no broken listener references

⸻

10) Required unary adapters to support Golden Patch ergonomics

To make “Breathing Constellation” feel good without extra blocks, you need these unary adapters (at minimum):

Phase lenses (Signal)
	•	WrapPhase
	•	TrianglePhase
	•	PhaseToBreath (a preset = cos remap)
	•	PhaseQuantize(divisions) (still unary)
	•	PhaseToPulse (event output)

Number lenses (Signal + Field)
	•	ScaleOffset
	•	Clamp
	•	Curve (smoothstep/tanh/pow)

Lift
	•	Broadcast (Signal→Field)
	•	ConstSignal (Scalar→Signal)

That’s enough for the radius mapping flow to be extremely ergonomic:
	•	bind phaseA to radius → suggest chain: Breath → Scale(…) → Broadcast

Everything else (like jitter requiring idRand + phaseB) remains a visible multi-input block, which is correct.

