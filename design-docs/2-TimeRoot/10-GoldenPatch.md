Below is a single “golden patch” that can serve as your canonical reference for:
	•	TimeRoot / TimeModel correctness
	•	Bus-first authoring (no wires required)
	•	Lazy Field evaluation (fields combine without materializing early)
	•	No-jank live edits (safe swap boundaries via pulse)
	•	A musically-legible ambient loop (rhyming at multiple scales)
	•	Export sanity (cycle-accurate, phase-driven sampling)

It’s deliberately small enough to implement now, but rich enough to stay relevant as the system grows.

⸻

Golden Patch: “Breathing Constellation”

A loopable ambient system: a grid of dots that “breathes” (radius), slowly drifts (position jitter), color-cycles on a long phrase, and has occasional “spark” accents synced to pulse subdivisions. It should look good even before compositors/advanced effects.

0) Patch contract

Time topology
	•	TimeRoot: CycleTimeRoot(period = 8.0s, mode = loop)
	•	Compiled TimeModel: { kind: 'cyclic', periodMs: 8000 }
	•	Required UI buses present: phaseA, pulse (plus energy, palette)

Canonical buses (must exist)
	•	phaseA: Signal<phase> (primary) — published by TimeRoot
	•	pulse: Event — published by TimeRoot wrap event (or endpoint)
	•	energy: Signal<number> — summed contributions
	•	palette: Signal<color> or Signal<palette> (whatever you chose)
	•	optional: phaseB: Signal<phase> (secondary)

⸻

1) Bus Board setup

Create buses (names are reserved/system-pinned where applicable):
	1.	phaseA
	•	type: Signal
	•	combine: last
	•	silent: 0
	2.	pulse
	•	type: Event
	•	combine: or
	•	silent: never fires
	3.	energy
	•	type: Signal
	•	combine: sum
	•	silent: 0
	4.	palette
	•	type: Signal (or palette struct)
	•	combine: last (or mix if you support mixing)
	•	silent: baseColor (e.g. #0b1020)
	5.	(optional) phaseB
	•	type: Signal
	•	combine: last
	•	silent: 0

⸻

2) Block registry-level graph (what blocks exist)

I’m writing this in “graph spec” form (blocks + what they publish/subscribe). You can translate to your patch JSON easily.

A) Time topology block

CycleTimeRoot
	•	Params:
	•	period = 8s
	•	mode = loop
	•	Publishes:
	•	phaseA ← phase (primary)
	•	pulse ← wrap

⸻

B) Domain + arrangement (Field world)

GridDomain
	•	Params:
	•	rows = 20
	•	cols = 20
	•	spacing = 22
	•	center = viewport center
	•	Outputs:
	•	domain (element identity + count)
	•	pos0: Field<vec2> (base positions)

This is the “stuff to animate.” No SVG source required to look good.

⸻

C) Global rhythmic structure (Signal world)

PhaseClock (secondary phrase)
	•	Inputs:
	•	tIn ← TimeRoot.t (or derive from phaseA with ratio)
	•	Params:
	•	period = 32s (4× longer than cycle root)
	•	mode = loop
	•	Publishes:
	•	phaseB ← its phase (optional)

This gives “multi-scale looping” (8s loop + 32s phrase).

⸻

D) Energy generation (Signal)

WaveShaper (or “Sin”)
	•	Subscribes:
	•	phaseA (phase)
	•	Computes:
	•	breath = 0.5 - 0.5*cos(2π*phaseA) (nice inhale/exhale)
	•	Publishes:
	•	energy += breath * 0.35

PulseDivider (or “Phase→Trigger”)
	•	Subscribes:
	•	phaseA
	•	Params:
	•	divisions = 8 (8 pulses per cycle)
	•	Publishes:
	•	pulse OR= subPulse (optional—if you don’t want to merge into pulse, publish to a separate tick bus)

AccentEnvelope
	•	Subscribes:
	•	pulse (or the subdivided tick)
	•	Params:
	•	attack = 0
	•	decay = 0.18s
	•	Publishes:
	•	energy += accent * 0.65

Now energy is a meaningful “intensity” signal with both smooth breathing and rhythmic accents.

⸻

E) Palette (Signal)

PaletteLFO
	•	Subscribes:
	•	phaseB (slow phrase) or phaseA with a slow drift
	•	Computes:
	•	Hue rotate slowly across 32s
	•	Publishes:
	•	palette = color (or palette struct)

⸻

3) Field shaping (Lazy FieldExpr world)

These are Field expressions that should remain lazy until the renderer materializes them.

A) Per-element phase offset (Field)

StableIdHash
	•	Input:
	•	domain
	•	Output:
	•	idRand: Field<number> in [0,1) (deterministic per element)

FieldMap (“SpreadPhase”)
	•	Inputs:
	•	phaseA: Signal<phase>
	•	idRand: Field<number>
	•	Output:
	•	phasePer: Field<phase> = frac(phaseA + idRand * 0.35)

This gives coherent motion with per-element phase offsets—huge visual payoff, no randomness.

B) Radius field (Field)

RadiusFromEnergy
	•	Inputs:
	•	energy: Signal<number>
	•	phasePer: Field<phase>
	•	Compute:
	•	base radius = 2.0
	•	breathe radius = 10.0 * smoothstep(phasePer)  (or sin)
	•	accent gain = 6.0 * clamp(energy, 0, 1.5)
	•	Output:
	•	radius: Field<number>

This is the heart of the “breathing dots.”

C) Position drift (Field)

JitterField (deterministic wobble)
	•	Inputs:
	•	idRand: Field<number>
	•	phaseB: Signal<phase> (slow)
	•	Output:
	•	drift: Field<vec2> small (±2 px)

AddFieldVec2
	•	Inputs:
	•	pos0, drift
	•	Output:
	•	pos: Field<vec2>

⸻

4) Renderer block (RenderTree)

RenderInstances2D (or your equivalent)
	•	Inputs:
	•	domain
	•	position: Field<vec2> ← pos
	•	radius: Field<number> ← radius
	•	fill: Field<color> ← derived from palette + idRand (optional)
	•	opacity: Field<number> ← e.g. 0.85 + 0.15 * sin(phasePer)
	•	Output:
	•	RenderTree

No compositors required. This should already look alive.

⸻

5) UI behavior that must be true for this patch

Time Console
	•	Must show CYCLE
	•	Must show Phase Ring bound to phaseA
	•	Must show pulse indicator ticking (wrap + subdivisions if merged)

Bus Board
	•	phaseA row shows phase scope/ring
	•	energy row shows meter oscillating
	•	palette row shows swatch drifting

Live editing (no-jank)

While RUNNING:
	•	Changing GridDomain rows/cols is Class C (identity change) → requires explicit apply boundary (freeze or pulse)
	•	Changing breath amplitude is Class A (param-only) → instant swap next frame
	•	Changing CycleTimeRoot period is Class C but offers apply on next pulse as default

⸻

6) Export expectations (cycle integrity)

If you export as a loopable clip:
	•	Phase-driven sampling must produce exact loop closure
	•	Frame 0 and Frame N should match visually (within tolerances)

This patch is your canary for whether cycle export is truly correct.

⸻

7) Why this is the “golden patch”

It exercises the exact things that have been hard for you:
	•	A single authoritative CycleTimeRoot
	•	PhaseClock used correctly as secondary
	•	Buses as the glue (phaseA, pulse, energy, palette)
	•	Lazy Fields (phasePer, radius, drift) that must not explode performance
	•	Stable element identity (domain + StableIdHash)
	•	A renderer that consumes many fields and one domain
	•	No-jank swap boundaries are testable (pulse boundary is meaningful)

⸻

8) Minimal acceptance tests (engineer checklist)

If any of these fail, something is wrong in core architecture:
	1.	Time correctness
	•	Changing player loop mode should not exist / should do nothing.
	•	t never wraps; only phase does.
	2.	UI correctness
	•	Cycle UI appears only because TimeModel is cyclic.
	•	Infinite UI never appears for this patch.
	3.	No-jank
	•	Param tweak on breath amplitude changes visuals with no flicker.
	•	Period change can be scheduled at next pulse and swaps cleanly.
	4.	Determinism
	•	Same seed → identical motion every reload.
	•	Different seed → different but stable per-element offsets.
	5.	Performance sanity
	•	With ~400 dots, should remain smooth.
	•	With 2500 dots (50×50), should degrade gracefully but not collapse (this is your lazy-field stress test).
