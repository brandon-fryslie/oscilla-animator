Lens Catalog Spec, by Domain and Endpoint (Publisher vs Listener)

This message covers the exact allowed lens set per domain, separately for publishers and listeners.
Hard rule: every lens is type-preserving (same TypeDesc.world + domain). Anything that changes type is an adapter, not a lens.

Common lens primitives and conventions

All lenses share:
	•	id: string
	•	label: string
	•	domain: Domain (and optionally world constraints)
	•	params: Record<string, LensParamSpec>
	•	costHint: 'cheap'|'medium'|'heavy' (for UI + perf warnings)
	•	stabilityHint: 'scrubSafe'|'transportOnly'|'either'

Parameter types:
	•	number, boolean, enum, vec2, color
	•	every param has default, min/max (when applicable), and UI hint.

Composition order:
	•	Publisher lens stack applies pre-combine.
	•	Listener lens stack applies post-combine.
	•	Within a stack: top-to-bottom in UI = left-to-right in evaluation.

⸻

0) Domain: number

TypeDesc: signal:number and field:number

Publisher-allowed number lenses (pre-combine)

These are “how much and in what shape does this publisher contribute”.
	1.	Gain

	•	params: gain (default 1), bias (default 0)
	•	effect: y = x * gain + bias

	2.	Polarity

	•	params: invert (bool)
	•	effect: y = invert ? -x : x

	3.	Clamp

	•	params: min, max
	•	effect: clamp

	4.	Softclip

	•	params: amount (0..1), shape (enum: tanh, sigmoid)
	•	effect: gentle limiting (prevents bus blowups)

	5.	Deadzone

	•	params: width (>=0)
	•	effect: values near 0 become 0 (rhythmic gating)

	6.	Slew

	•	params: riseMs, fallMs
	•	transportOnly (stateful)
	•	effect: smooth changes (prevents zippering)

	7.	Quantize

	•	params: step, mode (round/floor/ceil)
	•	effect: stepped contributions (sequencer feel)

	8.	Noise Dither

	•	params: amount
	•	only if seeded determinism exists for noise per evaluation; otherwise omit.
	•	effect: subtle variation without bus combine artifacts

Listener-allowed number lenses (post-combine)

These are “how does this consumer interpret the bus”.

All publisher lenses above are allowed, plus:
	9.	Ease

	•	params: curve (enum: in/out/inOut), amount
	•	effect: remap 0..1 curves (best paired with normalized signals)

	10.	MapRange

	•	params: inMin, inMax, outMin, outMax, clamp bool
	•	effect: classic modulation mapping

	11.	Hysteresis

	•	params: low, high
	•	effect: stabilizes threshold-driven consumers (prevents flicker)

	12.	SampleHold

	•	params: holdMs or triggerBus (if trigger is a bus-domain)
	•	transportOnly (stateful)
	•	effect: turns continuous bus into stepped parameter

⸻

1) Domain: phase

TypeDesc: signal:phase (and optionally field:phase if you ever add it)

Important: A phase lens must preserve phase semantics (wrap 0..1). It cannot become time or number without adapters.

Publisher-allowed phase lenses (pre-combine)

Use these to align or shape phase contributions when multiple phase sources publish.
	1.	PhaseOffset

	•	params: offset (0..1)
	•	effect: (phase + offset) mod 1

	2.	PhaseScale

	•	params: scale (>0)
	•	effect: (phase * scale) mod 1 (creates faster cycles)

	3.	PingPong

	•	params: none (or enabled)
	•	effect: triangle fold: p<0.5? 2p : 2-2p

	4.	WrapMode

	•	params: enum: wrap | clamp | pingpong
	•	effect: defines boundary handling (mostly for derived phases)

	5.	PhaseQuantize

	•	params: steps (int >=1)
	•	effect: round(phase*steps)/steps

Listener-allowed phase lenses (post-combine)

All publisher lenses above, plus:
	6.	PhaseToPulse

	•	params: threshold (0..1), edge (rising/falling/both)
	•	effect: produces a pulse BUT this would change domain → not a lens unless your “pulse” is still phase (it isn’t).
	•	Therefore: NOT allowed as a lens. This must be an adapter (phase→trigger) or a dedicated block.

	7.	PhaseWindow

	•	params: start, end, softness
	•	effect: returns phase but “emphasizes” a window by warping time inside it (still phase)

	8.	PhaseJitter

	•	params: amount, rate
	•	only if deterministic noise exists; stays within phase

⸻

2) Domain: vec2

TypeDesc: signal:vec2, field:vec2

Publisher-allowed vec2 lenses
	1.	Vec2GainBias

	•	params: gain (vec2 or number), bias (vec2)
	•	effect per component

	2.	Rotate2D

	•	params: radians or turns
	•	effect: rotation around origin

	3.	Translate2D

	•	params: delta (vec2)

	4.	ClampBounds

	•	params: min vec2, max vec2

	5.	Swirl

	•	params: strength, center
	•	medium cost

Listener-allowed vec2 lenses

All publisher lenses above, plus:
	6.	ProjectToAxis

	•	params: axis enum (x/y)
	•	would change vec2→number → adapter, not lens. Disallow as lens.

	7.	Normalize

	•	params: none
	•	effect: unit vector (type preserved)

	8.	SmoothPath

	•	stateful smoothing; transportOnly; useful for camera motion.

⸻

3) Domain: color

TypeDesc: signal:color, field:color

Publisher-allowed color lenses
	1.	ColorGain

	•	params: gain (number), alphaGain optional
	•	effect: scale brightness/alpha

	2.	HueShift

	•	params: turns (0..1)

	3.	Saturate

	•	params: amount

	4.	Contrast

	•	params: amount

	5.	ClampGamut

	•	params: none (keeps values sane)

Listener-allowed color lenses

All publisher lenses above, plus:
	6.	PaletteIndex

	•	would imply color→color via palette lookup but needs palette context; if palette is external bus, this becomes a composite lens that depends on another bus (not allowed in “pure lens”).
	•	Therefore: NOT allowed as a base lens. Do it as a block or as a “multi-input lens” later if you intentionally support cross-bus lenses.

⸻

4) Domain: time and duration

TypeDesc: signal:time, field:duration etc.

Strong recommendation: Do not expose general-purpose time lenses widely. Time is topology and should come from TimeRoot.
So:

signal:time
	•	Publisher lenses: none (TimeRoot owns time)
	•	Listener lenses: only safe reshapers that do not create new topology:
	•	TimeOffset (adds constant)
	•	TimeScale (multiplies)
But both are risky; better to keep time shaping in explicit blocks.

duration

Usually treated as number with unit=ms. Don’t invent special lenses; reuse number lenses, but display with units.

⸻

5) Domain: boolean

TypeDesc: signal:boolean, field:boolean

Publisher lenses
	•	Invert
	•	Debounce (transportOnly; reduces flicker)
	•	Hold (transportOnly; latch for ms)

Listener lenses

Same, plus:
	•	EdgeDetect would become trigger → adapter/block, not lens.

⸻

6) Domain: event/trigger/pulse

If you have a real trigger domain (recommended), treat it specially.

Publisher lenses
	•	GateProbability (deterministic hash-based) — if you support it deterministically
	•	Divide (every Nth pulse) (transportOnly)
	•	Delay (transportOnly)

Listener lenses
	•	Stretch (convert pulse to envelope) would become number over time → adapter/block, not lens.

⸻

Summary rules you can implement as validation
	1.	A lens is valid iff: lens.outputTypeDesc === lens.inputTypeDesc.
	2.	Publisher lens catalog is a subset of listener catalog (publishers are “shared impact”, listeners are “personal perception”).
	3.	Any lens requiring another bus/value is disallowed in this spec (cross-input lenses are a separate feature).
	4.	Any operation that changes domain/world is an adapter or a block, never a lens.
