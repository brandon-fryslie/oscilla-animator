Spec 8: Export implications (SVG / video) under the TimeRoot/TimeModel system

This spec defines how export works correctly under the canonical time architecture. It covers:
	•	what “export” means in a system where time may be cyclic or infinite
	•	how export sampling is defined (no reliance on player wrap)
	•	what guarantees exports must preserve (determinism, loop closure)
	•	how SVG/CSS export differs from video export
	•	what the UI must present for export depending on TimeModel

No “v1/v2”—this is the final export model.

⸻

1) Export is a Lowering Pipeline, Not a Playback Feature

Export does not use the player transport.
Export is a compiler-driven evaluation pipeline:

Patch → CompiledProgram(program, timeModel) → ExportPlan → Artifact(s)

Export is deterministic and reproducible:
	•	given patch JSON + seed + export settings
	•	output bytes are stable

⸻

2) Export Planning is Derived from TimeModel

Export begins by deriving an ExportTimePlan from timeModel.

type ExportTimePlan =
  | { kind: 'finite'; durationMs: number; sample: SamplePlan }
  | { kind: 'cyclic'; periodMs: number; loops: number; sample: SamplePlan }
  | { kind: 'infinite'; windowMs: number; durationMs: number; sample: SamplePlan }

Key decision: Even infinite exports must become finite in exported media. Export chooses a finite capture duration by policy, not by hack.

⸻

3) Sampling: The Only Legitimate Time Input for Export

Export is defined by an explicit sampling plan:

interface SamplePlan {
  fps: number               // for video
  steps?: number            // for SVG keyframe sampling
  shutter?: number          // optional motion blur accumulation
}

Export evaluates the program at a set of times:
	•	For video: t_i = i * (1000/fps) for i = 0..N-1
	•	For SVG: t_i = i * (periodMs/steps) for i = 0..steps

Crucially:
	•	t is monotonic and unbounded as always.


There is no “wrap maxTime”.

⸻

4) Export Semantics by TimeModel

4.1 FiniteTimeRoot export

Video
	•	Export duration is exactly durationMs
	•	Frame count N = ceil(durationMs * fps / 1000)
	•	Last frame evaluated at t = durationMs (or durationMs - dt, choose and document)

SVG/CSS
	•	If SVG supports finite animation:
	•	keyframes sampled across [0, duration]
	•	CSS animation-duration = durationMs
	•	iteration-count = 1
	•	If SVG export is “baked frames” (sprite-like):
	•	same sampling as video, but stored differently

No looping implied.

⸻



Cycle exports are the most important because your tool is about loops.

Core rule: loop closure must be exact

For loop mode (not pingpong):
	•	the exported animation must satisfy:
	•	frame 0 == frame N (modulo floating tolerances)
	•	which means sampling must align exactly to the cycle.

Video export (loopable clip)
Two valid strategies:

Strategy A (preferred): exact-cycle frame count
	•	Choose integer frame count N such that:
	•	N / fps == periodMs/1000 exactly
	•	If period isn’t representable at chosen fps:
	•	export changes the effective fps or period to fit exactly (explicit in settings)

Strategy B: render N frames but enforce closure by phase sampling
	•	Sample phase directly:
	•	phase_i = i / N
	•	evaluate program with time such that CycleRoot.phase = phase_i
	•	This requires the compiler/runtime to support phase-driven evaluation for export.
	•	This is ideal because it decouples loop closure from fps.

This spec requires Strategy B support long-term because it’s the only robust way to guarantee loop closure across arbitrary cycle lengths.

Pingpong cycle export
	•	Export should loop as pingpong (forward then backward) seamlessly.
	•	Sample across [0..1..0] phase shape.

SVG/CSS export

Cycle mode maps naturally to CSS animation loops:
	•	CSS animation-iteration-count: infinite
	•	CSS animation-timing-function: linear (unless you support easing)
	•	Keyframes sampled across phase, not time, for exact closure:
	•	k_i = phase_i
	•	offset = i/N

If you can’t express the whole render in CSS/SVG:
	•	bake and approximate (allowed), but preserve loop closure.

⸻

4.3 InfiniteTimeRoot export (capture window)

Infinite patches cannot be exported as “infinite.” They must be captured.

Video
	•	User chooses capture duration (default policy: 30s, editable)
	•	ExportTimePlan:
	•	durationMs = userSelected
	•	Sampling is standard.

SVG/CSS

Two permissible outputs:

A) “Looping excerpt”
	•	User chooses a cycle lens or a capture-to-cycle process.
	•	Exporter selects a segment and forces it into a loop by:
	•	phase-locking a chosen phase bus, OR
	•	baking a segment and crossfading endpoints (approximation allowed)
This is explicitly labeled as an approximation.

B) “Finite excerpt”
	•	CSS iteration-count = 1
	•	A “recording” of a window, not a loop

The UI must not pretend infinite SVG is the same as cyclic SVG.

⸻

5) Required Export UI (tied to TimeModel)

Export UI is not generic; it changes depending on topology.

5.1 Finite export UI
	•	Duration locked to TimeRoot.duration
	•	Choose:
	•	fps (video)
	•	resolution
	•	format

5.2 Cycle export UI
	•	Period locked to TimeRoot.period
	•	Controls:
	•	“Export loopable clip”
	•	“Frames per cycle” (explicit integer)
	•	“Export by phase (exact closure)” toggle (should be default, but you can hide toggle if always on)
	•	number of loops for video (optional: 1 loop clip vs extended loops)

Also show a “Loop Integrity” indicator:
	•	green when closure exact
	•	amber when approximation

5.3 Infinite export UI
	•	Capture duration slider (required)
	•	“Export as excerpt” (finite)
	•	Optional: “Attempt loopable excerpt” (explicitly marked as approximation)

⸻

6) Technical Requirements on Runtime/Compiler for Export

6.1 Export must run without the interactive player

Export cannot depend on:
	•	player loop mode
	•	player UI
	•	tick logic

It must use:
	•	compiled program + timeModel
	•	deterministic evaluation context

6.2 Phase-driven evaluation must exist for cycle export

To guarantee closure independent of fps, export must support evaluating the program at a requested phase (CycleRoot).

This requires:
	•	a way to supply CycleRoot with phaseOverride / phaseOffset and freeze internal dt


This is not a hack; it is the correct abstraction.

⸻

7) Determinism Guarantees in Export

Exports must:
	•	embed the seed in metadata (or export manifest)
	•	embed the export plan (fps, frames-per-cycle, capture duration)
	•	produce identical output given the same inputs

No hidden randomness, no wall-clock dependence.

⸻

8) Export Failure Modes (explicit)

Export must fail with clear errors if:
	•	TimeRoot missing/invalid

	•	Phase-driven evaluation not possible due to illegal feedback without memory boundary
	•	Any non-exportable renderer feature is used (SVG limitations)

When features can be approximated:
	•	exporter emits warnings and labels artifact as “approximate”

⸻

If you say Next, I’ll deliver Spec 9: scaling to multi-client / server-authoritative runtime—specifically how TimeRoot/timeModel, scrubbing (phaseOffset/timeOffset), run/freeze, and hot swaps are handled when the server owns time and multiple clients attach/detach.