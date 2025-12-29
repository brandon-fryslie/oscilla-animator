If you want looping/infinite to be real (not an accident of maxTime), then every patch must have an explicit time topology. That means: the compiled patch must contain (or synthesize) exactly one authoritative “time root”, and everything else derives from it.

Here’s the spec for what time blocks must exist and the constraints.

⸻

Time topology: required blocks and constraints

1) Every patch must contain exactly one TimeRoot

A TimeRoot is the patch’s declaration of “what time means.”

There are three legal TimeRoot types:
	1.	FiniteRoot — “this is a finite performance with a known duration”
	2.	CycleRoot — “this patch has a primary cycle that repeats”
	3.	InfiniteRoot — “this patch runs forever without a privileged cycle”

Constraint
	•	Exactly one TimeRoot per patch (authorable or implicit by a “Time” macro).
	•	If none is present: compile error (no fallbacks).
	•	If more than one: compile error (conflicting topology).

⸻

2) Legal root types and their minimal required nodes

A) FiniteRoot (finite performance)

Required
	•	FiniteTimeRoot(durationMs)

Optional
	•	Phase clocks derived from it (but must not contradict finiteness)

Constraints
	•	Duration is authoritative.
	•	Any block that declares infinity or a repeating primary cycle conflicts → error.

Common use
	•	logo stingers, intro/outro animations, exports.

⸻

B) CycleRoot (looping primary cycle)

Required

	•	mode ∈ { loop, pingpong }

Optional
	•	Secondary cycles (allowed; they are modulators, not topology)
	•	Drift/phase warp blocks (allowed; must remain deterministic)

Constraints
	•	The root period is authoritative.
	•	At least one primary phase signal must be produced:
	•	phaseA: Signal<phase> (0..1, wrap-aware)
	•	Any FiniteRoot or InfiniteRoot in the patch conflicts → error.
	•	“Once” phase generators do not count as the root.

Common use
	•	ambient loops, “super loops,” music-visualizer style systems.

⸻

C) InfiniteRoot (ambient, unbounded)

Required
	•	InfiniteTimeRoot(windowMs)
	•	windowMs is for UI/windowing only, not a duration

Optional
	•	Cycles may exist as local modulators, but none may be marked primary
	•	Memory/feedback systems are typical but not required by definition (you can be infinite without feedback)

Constraints
	•	No primary cycle exists.
	•	Any CycleRoot or FiniteRoot conflicts → error.
	•	UI shows sliding time window, not a cycle scrubber.

Common use
	•	evolving installations, long-running systems, generative “weather.”

⸻

3) What counts as a “time block” vs “time-derived block”

Time blocks (affect topology)

Only these can define TimeRoot:
	•	FiniteTimeRoot

	•	InfiniteTimeRoot

Time-derived blocks (do not define topology)

These consume the TimeRoot and output useful signals:
	•	PhaseClock (secondary phase generator)
	•	TriggerOnWrap
	•	Envelope
	•	Integrate / Delay (stateful; affects behavior, not topology)
	•	“Drift” / “Warp” (must remain deterministic)

Constraint
	•	Time-derived blocks cannot exist “floating.” They must ultimately depend on the TimeRoot (directly or indirectly).

⸻

4) Required exported signals (what the player/UI expects)

Regardless of root type, the compiled patch must expose a TimeModel plus certain standard signals for the UI to hook into.

Always required
	•	timeModel: TimeModel (finite/cyclic/infinite)
	•	systemTime: Signal<time> (monotonic, unbounded t in ms or s)
	•	runState is player-owned (run/freeze), not patch-owned

Required for CycleRoot
	•	phaseA: Signal<phase> (primary)
	•	Optional: phaseB: Signal<phase> (secondary)

Required for FiniteRoot
	•	progress: Signal<number> (0..1 clamped)
	•	Optional: phaseA may exist but is secondary and must not contradict finiteness

Required for InfiniteRoot
	•	window: { startTime, endTime } for UI
	•	Optional: any number of local phases

⸻

5) How to enforce this in the compiler (constraint checks)

At compile time:
	1.	Scan block graph for any TimeRoot blocks.
	2.	If count != 1 → hard error.
	3.	Validate internal consistency:
	•	CycleRoot requires a primary phase output
	•	FiniteRoot must not contain a “primary cycle” declaration
	•	InfiniteRoot must not contain a “primary cycle” declaration
	4.	Ensure all time-derived blocks have a dependency path back to the TimeRoot (or error).

No heuristics, no inference, no defaults.

⸻

6) Practical implication for your patch UX

You will have a dedicated Time section in the patch creation flow:
	•	User chooses Finite / Loop / Infinite
	•	That inserts the appropriate TimeRoot block
	•	The player UI configures itself from the compiled TimeModel

This is how you make looping “real” and not a side effect of arbitrary maxTime.
