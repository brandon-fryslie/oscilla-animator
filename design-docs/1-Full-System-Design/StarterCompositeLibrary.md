Starter composite library (macros)

Designed to make good-looking ambient systems fast while keeping primitives small.
Each macro lists: purpose, internal graph, recommended bus bindings, exposed controls, and notes about no-jank.

I’m assuming you ship v1 with these default buses (Signal):
	•	phaseA: signal:phase
	•	phaseB: signal:phase
	•	energy: signal:number
	•	pulse: signal:trigger
	•	palette: signal:color (or a palette object if you add one later; for now treat as color bias)

And v1 with listener-side lenses (most variation happens there).

⸻

A. Domain + Arrangement macros

1) Grid Points

Purpose: quick structured population.
	•	Internal: DomainN(n=rows*cols) → PositionMapGrid
	•	Outputs: domain, pos
	•	Exposed controls: rows, cols, spacing, origin, order
	•	Bus suggestions: none by default; allow spacing/origin to subscribe to slow signals
	•	No-jank: changing rows/cols will remap positions but IDs stable (DomainN policy).

⸻

2) Circle Points

Purpose: ring/radial layouts.
	•	Internal: DomainN(n) → PositionMapCircle
	•	Outputs: domain, pos
	•	Exposed: n, radius, center, startAngle, distribution
	•	Bus suggestions: radius listens to energy with Slew lens for breathing.

⸻

3) Line Points

Purpose: band/scanline visuals.
	•	Internal: DomainN(n) → PositionMapLine
	•	Outputs: domain, pos
	•	Exposed: n, a, b, distribution
	•	Bus suggestions: a/b positions can be slowly modulated by phaseB through easing lenses.

⸻

4) SVG Sample Points

Purpose: solve “what do I animate?” with real shapes.
	•	Internal: DomainFromSVGSample(asset, sampleCount) → (optional) position field from sampling
	•	Outputs: domain, pos, bounds
	•	Exposed: asset, sampleCount
	•	Bus suggestions: sampleCount usually static (avoid count jank); use another macro for motion.

⸻

B. Per-element variation macros (identity-based)

5) Per-Element Random (Stable)

Purpose: stable per-element scalar 0..1.
	•	Internal: FieldHash01ById(domain, seed)
	•	Outputs: u: Field<number>
	•	Exposed: seed
	•	Notes: foundational for “not same-y” without true randomness.

⸻

6) Per-Element Phase Offset

Purpose: each element has its own phase shift.
	•	Internal: FieldHash01ById → FieldMapNumber(fn="scale") to range [-amount, +amount]
	•	Outputs: phaseOffset: Field<number> (semantics: phase offset in cycles)
	•	Exposed: seed, amount
	•	Bus suggestions: amount listens to energy (so offsets widen under intensity).

⸻

7) Per-Element Size Scatter

Purpose: stable size variation.
	•	Internal: hash → maprange [min,max]
	•	Outputs: size: Field<number>
	•	Exposed: seed, min, max

⸻

8) Per-Element Rotation Scatter

Purpose: stable orientation variation.
	•	Internal: hash → maprange [0, 2π] then scale by amount
	•	Outputs: rot: Field<number>
	•	Exposed: seed, amount

⸻

C. Motion macros (phase interpreted as movement)

9) Orbit Motion

Purpose: make points orbit around a center.
	•	Internal:
	•	input pos: Field<vec2>
	•	FieldMapVec2(fn="rotate", angle = phaseA * 2π * turns)
(implemented as a composite that takes a phase signal and broadcasts it if needed, or expects a signal->angle lens at consumer)
	•	Inputs: domain, pos, phase: Signal<phase>
	•	Outputs: pos2: Field<vec2>
	•	Exposed: center, turns, radiusScale
	•	Bus suggestions: phase binds to phaseA with optional warp lens.
	•	No-jank: identity preserved; motion is pure function of phase.

If you don’t want FieldFromSignal yet: this macro can output a signal angle and instruct binding via lens at renderer (rotate parameter). But the clean version uses FieldFromSignal.

⸻

10) Wave Displace

Purpose: coherent wave motion across a grid/line.
	•	Internal:
	•	take pos
	•	compute per-element phase = phaseA + hashOffset
	•	displace Y by sin(phase * 2π + pos.x * k) * amp
	•	Inputs: domain, pos, phase: Signal<phase>
	•	Outputs: pos2
	•	Exposed: amp, frequency, seed, axis
	•	Bus suggestions: amp listens to energy with Slew.

⸻

11) Breathing Scale

Purpose: global pulse to size/opacity.
	•	Internal: treat phaseA as oscillator → map to [min,max]
	•	Output: Signal<number> OR Field<number> (broadcast)
	•	Exposed: min, max, curve
	•	Bus suggestions: publish to energy or consume phaseA and drive size lens.

⸻

D. Color macros (cohesion without sameness)

12) Palette Drift (Color Bias)

Purpose: slow, coherent color motion.
	•	Internal: phaseB → map to hue shift or color lerp endpoints
	•	Outputs: Signal<color> (or Signal<number> hue bias if you use HSL)
	•	Exposed: hueRange, saturation, lightness
	•	Bus suggestions: publish to palette.

⸻

13) Per-Element Color Scatter

Purpose: same palette, per-element offsets.
	•	Internal: hash → hue offset; apply to base color
	•	Inputs: domain, base: Field<color> (or scalar color)
	•	Outputs: fill: Field<color>
	•	Exposed: seed, amount

⸻

E. Render macros (single-click visuals)

14) Dots Renderer (Ambient)

Purpose: one macro that makes something pretty immediately.
	•	Internal:
	•	expects domain, pos
	•	generates:
	•	size = Per-Element Size Scatter times Breathing Scale (or energy lens)
	•	fill = Per-Element Color Scatter over palette bias
	•	optional opacity from energy or phase windowing
	•	RenderInstances2D(shape="circle")
	•	Exposed controls: baseSize, sizeVar, colorVar, opacity, shape
	•	Recommended bindings:
	•	size breathes on phaseA (lens: ease + sine)
	•	palette drift uses phaseB
	•	energy can modulate opacity
	•	No-jank: only pure fields + stable domain; editing fields won’t reorder elements.

⸻

15) Glyph/Path Instances Renderer

Purpose: render a chosen SVG glyph/path at each point.
	•	Internal: same as Dots Renderer but shape="path" and uses pathAsset
	•	Exposed: pathAsset, baseSize, rotScatter, color scatter
	•	Bus suggestions: rotation listens to phaseA with quantize lens for “steppy” motion.

⸻

F. Rhythm + events macros (optional early, powerful later)

16) Pulse → Envelope

Purpose: trigger-driven intensity burst.
	•	Internal: EnvelopeAD(trig=pulse, attack, decay)
	•	Outputs: Signal<number> (0..1)
	•	Exposed: attack, decay
	•	Bus suggestions: publish to energy (sum combine) or use directly for opacity.

⸻

17) Phase Wrap Pulse

Purpose: turn a phase clock into periodic triggers.
	•	Internal: TriggerOnWrap(phaseA)
	•	Outputs: Signal<trigger>
	•	Exposed: none (or select which phase bus)
	•	Bus suggestions: publish to pulse.

⸻

Recommended “first demo” assembly (what these enable)

From empty patch, a user can do:
	1.	Drop Grid Points
	2.	Drop Dots Renderer (Ambient) and connect domain/pos
	3.	Bind phaseA/phaseB via bus board defaults
	4.	Add Palette Drift publishing to palette
	5.	Add Pulse → Envelope to thicken energy
	6.	Add Wave Displace between arrangement and renderer

That yields a rich, evolving ambient visual with very few conceptual moves:
	•	population → arrangement → motion → render
	•	buses supply coherence
	•	hashes supply individuality

⸻

Notes on implementation strategy
	•	You can ship with 10 macros (1–5, 9–10, 12, 14–15, 17) and add the rest later.
	•	The “renderer macros” (14/15) are the addiction hook: one click yields quality.
	•	Every macro is decomposable into primitives, so it never becomes a dead end.

If you want, next I can provide:
	•	exact default parameter values for each macro (so they look good out of the box),
	•	and which lens presets should ship alongside them (so binding phase/energy produces pleasing motion immediately).