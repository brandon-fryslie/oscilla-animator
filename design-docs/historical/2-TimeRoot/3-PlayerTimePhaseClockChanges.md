Spec 2: PhaseClock changes (secondary clock, not topology)

This spec replaces the current PhaseClock behavior where it implicitly “creates looping” by wrapping t internally. After this change, PhaseClock never defines patch topology. It is a time-derived modulator that references the TimeRoot and produces phase-like signals in a controlled, composable way.

This resolves the current collision:
	•	player wrapping time
	•	PhaseClock wrapping time
by making PhaseClock purely a mapping from TimeRoot outputs to derived phase, not a competing time system.

⸻

1) Core Definition

PhaseClock is a Derived Clock

It computes a phase signal from an upstream time reference.

It may:
	•	loop
	•	pingpong
	•	quantize
	•	drift

But it does so by transforming an input time or phase, never by implying “this patch loops.”

Rule: A patch loops only if it has a CycleTimeRoot.

⸻

2) PhaseClock’s Role in the System

PhaseClock is one of:
	•	Secondary cycle generator in a patch that already has a CycleRoot
	•	Local LFO in an InfiniteRoot patch
	•	A progress mapper in a FiniteRoot patch (e.g. for periodic motion inside a finite clip)

It is never the primary time source.

⸻

3) Exact Port Types

Inputs (ports)

Required input (one of these, exactly)

PhaseClock takes exactly one upstream time reference:

Option A (recommended as canonical):
	•	tIn: Signal<time>
	•	TypeDesc: { world: 'signal', domain: 'time' }

Option B (allowed but secondary):
	•	phaseIn: Signal<phase>
	•	TypeDesc: { world: 'signal', domain: 'phase' }
	•	Used to derive sub-cycles or warped phase from an existing phase

Constraint
	•	Exactly one of tIn or phaseIn must be connected (or selected via a mode param).
	•	If neither or both: compile error.

⸻

Configuration inputs (scalar / signal)

These are intentionally split by what should be scrub-safe vs performative.

period: Scalar<duration>
	•	TypeDesc: { world: 'scalar', domain: 'duration' }
	•	Must be > 0

mode: Scalar<string> enum
	•	'loop' | 'pingpong' | 'once'
	•	This mode is local. It does not change TimeModel.

rate: Signal<number> (optional)
	•	TypeDesc: { world: 'signal', domain: 'number', semantics: 'rate' }
	•	Default 1.0
	•	Multiplies effective speed of the clock.

phaseOffset: Signal<phase> (optional)
	•	TypeDesc: { world: 'signal', domain: 'phase', semantics: 'offset' }
	•	Default 0
	•	Offset applied after base phase computation. This is how you “play” it.

reset: Signal<event> (optional)
	•	TypeDesc: { world: 'special', domain: 'event', semantics: 'reset' }
	•	When fired, phase resets to 0 for this clock only.
	•	Must be deterministic. If events are deterministic, reset is deterministic.

Scrub constraint
	•	If the patch is in scrub-safe evaluation, reset is ignored unless event evaluation is defined as scrub-safe. Prefer: reset is transport-only.

⸻

Outputs (ports)

phase: Signal<phase>
	•	TypeDesc: { world: 'signal', domain: 'phase' }
	•	Range:
	•	loop: [0,1)
	•	pingpong: [0,1] triangle
	•	once: [0,1] clamped

u: Signal<unit>
	•	TypeDesc: { world: 'signal', domain: 'unit', semantics: 'progress' }
	•	Always clamped [0,1] (useful for envelopes, fades)

wrap: Signal<event>
	•	TypeDesc: { world: 'special', domain: 'event', semantics: 'wrap' }
	•	Fires on wrap (loop) or endpoints (pingpong), never in once mode unless you define endpoint events.

cycleIndex: Signal<number>
	•	TypeDesc: { world: 'signal', domain: 'number', semantics: 'cycleIndex' }
	•	Monotonic integer count of wraps/endpoints

⸻

4) Semantics (How it Computes Phase)

If using tIn

Let:
	•	t = tIn (unbounded, from TimeRoot)
	•	P = period
	•	r = rate (default 1)

Compute:
	•	raw = (t * r) / P

Then:
	•	loop: phase = frac(raw + offset)
	•	once: phase = clamp(raw + offset, 0, 1)
	•	pingpong:
	•	p = raw + offset
	•	q = frac(p / 2) * 2 (or equivalent)
	•	phase = q < 1 ? q : 2 - q

Important
	•	The calculation uses unbounded t.
	•	No dependence on player maxTime.
	•	No truncation.

⸻

If using phaseIn

PhaseClock becomes a phase transformer:
	•	interprets phaseIn as base phase
	•	applies ratio, quantization, offset, pingpong mapping, etc.

This is how you create:
	•	phase subdivisions (e.g. 4× faster)
	•	phase layering
	•	polyrhythms

⸻

5) Relationship to TimeRoot (Hard Rules)

5.1 CycleTimeRoot requirement for “primary looping”

Only CycleTimeRoot can define patch looping.

Therefore:
	•	If a patch uses FiniteTimeRoot or InfiniteTimeRoot, PhaseClock may still be in loop mode, but the patch is not considered cyclic. It is:
	•	finite with internal periodic motion, or
	•	infinite with local oscillators

5.2 Primary Phase is owned by CycleTimeRoot

CycleTimeRoot outputs:
	•	phase with semantics primary

PhaseClock outputs:
	•	phase with semantics secondary (optional semantics tag)

If you have buses phaseA, phaseB, the canonical binding is:
	•	phaseA comes from CycleTimeRoot phase
	•	phaseB often comes from a PhaseClock

But the system does not infer this. The UI encourages it.

⸻

6) Bus + PhaseClock Integration (Required UX/Compiler Support)

PhaseClock is one of the main bus publishers.

Common patterns:
	•	publish phase to phaseB
	•	publish wrap to pulse
	•	publish u to energy (after shaping)

Critical requirement
The player must not display “looping” just because PhaseClock loops.
Looping UI is based only on TimeRoot’s TimeModel.

⸻

7) Scrub Safety Classification

PhaseClock must declare its scrub safety:
	•	If driven by tIn from a scrub-safe TimeRoot mapping, it is scrub-safe.
	•	If it uses transport-only inputs (reset events, live MIDI), it becomes transport-only.

Mechanism:
	•	A block-level capability flag:
	•	scrubSafe: boolean
	•	OR richer: scrubBehavior: 'reintegrate' | 'hold' | 'transportOnly'

PhaseClock should generally be scrub-safe unless reset events are connected.

⸻

8) Eliminate the Old Mode Parameter Conflict

Currently PhaseClock has:
	•	mode: loop | pingpong | once

That stays, but is now explicitly local.

And the player’s loopMode toggle is removed entirely (player does not loop time).

So there is no longer:
	•	PhaseClock loop mode vs player loop mode conflict.

⸻

9) Validation & Errors (No Fallbacks)

Hard compile errors:
	•	PhaseClock has no time input connected
	•	Both tIn and phaseIn connected
	•	period ≤ 0
	•	mode invalid

Warnings (optional but useful):
	•	PhaseClock in loop mode under FiniteTimeRoot (it will loop locally but patch ends)

⸻

That’s the complete PhaseClock redesign: it becomes a secondary cycle generator / phase transformer, not a topology declaration.
