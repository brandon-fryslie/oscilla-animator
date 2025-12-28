Deep dive 2: Time authority unification (player vs patch time)

You have the same “two truths” pattern here as with types/ports:
	•	The Player currently owns looping behavior (LoopMode, maxTime, wrapping/clamping).
	•	The Patch can generate its own looping behavior (e.g. PhaseClock wraps phase internally).
	•	The compiler can infer a TimeModel, but it’s not the authority everywhere.

This makes time feel “accidentally correct” sometimes and “mysteriously wrong” at other times—especially for ambient/infinite patches.

The fix is to make time a first-class authored topology with one authority.

⸻

1) The end-state principle

Principle A: The patch declares time topology. The player obeys it.

The Player must never “decide” loop structure. It may:
	•	run, pause, scrub
	•	apply a speed multiplier
	•	maintain a transport cursor
But it does not define:
	•	duration
	•	looping mode
	•	wrap points
	•	phase semantics

Principle B: There is exactly one global time basis: tMs is monotonic.

No more “player wraps tMs” (that resets stateful blocks and breaks infinite).
Instead:
	•	tMs increases monotonically forever in runtime
	•	time topology is modeled as derived signals inside the patch time system, not by resetting global time.

This is the single most important mechanical shift.

⸻

2) Canonical model: TimeRoot as a required authority block

You already have validateTimeRootConstraint() behind a flag. Turn that into a permanent invariant:

Every patch has exactly one TimeRoot.

TimeRoot defines:
	•	what “now” means
	•	what the patch considers its “musical structure”
	•	what is scrub-safe vs transport-only

TimeRoot outputs (canonical ports)

At minimum, TimeRoot must output:
	1.	timeMs: Signal<Time> — the patch’s “local time coordinate”
	2.	phase: Signal<phase> — a normalized phase basis (0..1)
	3.	pulse: Event — discrete beat/tick events
	4.	timeModel: TimeModel metadata — for UI only (not a signal)

In your current code, TimeModel is a compile product. That’s fine, but it must be derived from the TimeRoot and always applied by the player.

⸻

3) Redefine the player: transport cursor only

Right now, your player has a loopMode and maxTime (deprecated-ish), and tick wraps time. That must go away.

Player’s job, exactly:
	•	keep transport.tMs (monotonic)
	•	provide transport.playState (playing/paused)
	•	provide transport.scrubTMs when scrubbing (optional)
	•	pass transport into program evaluation context

Program evaluation always sees:
	•	transport.tMs (monotonic)
	•	transport.mode (“play” or “scrub”)
	•	transport.speed

But the program uses the TimeRoot-derived timeMs/phase/pulse to define looping behavior.

In other words: “looping” is no longer a player feature. It’s a patch feature.

This fixes the PhaseClock collision forever, because time topology is no longer split between player and patch.

⸻

4) Replace PhaseClock’s role (very important)

PhaseClock currently “does time math” by mapping t to a phase.

In the unified model, PhaseClock is no longer topology. It becomes a secondary clock / phase generator.

Meaning:
	•	It takes a time basis (often the TimeRoot’s local timeMs or phase)
	•	It produces another derived phase (e.g. faster, slower, offset, pingpong)
	•	It is an operator, not an authority

Why this matters

If PhaseClock stays a quasi-authority, you’ll keep getting:
	•	“this loops internally but UI thinks it’s finite”
	•	multiple incompatible loop narratives

After unification:
	•	UI shows TimeRoot’s topology (finite/cycle/infinite)
	•	PhaseClock is just “phase modulation” inside that world

⸻

5) The UI contract: looping is shown via TimeRoot, not a player toggle

Your current UI has a loop button cycling modes. That communicates: “the player loops the animation.”

That’s the wrong story for this tool long-term.

New contract:
	•	The transport UI shows transport state
	•	The patch UI shows time topology state

So the “Loop / Pingpong / None” toggle becomes:
	•	a property of the TimeRoot block (or TimeRoot panel)
	•	not a player control

The player can still have “repeat window” for preview convenience, but it must not affect patch semantics. It would be a view-only windowing (like a viewport) over monotonic time.

⸻

6) TimeRoot modes: finite / cyclic / infinite (but mechanics are shared)

Finite
	•	timeMs goes 0..duration then clamps
	•	phase goes 0..1 then clamps
	•	pulse emits at configured beat grid until end
	•	timeModel.kind = 'finite'

Cyclic
	•	timeMs is “local cycle time” (0..period) derived from monotonic t
	•	phase wraps or pingpongs (depending on TimeRoot params)
	•	pulse emits on each beat and on cycle wrap
	•	timeModel.kind = 'cyclic'

Infinite
	•	timeMs equals monotonic t (or a smoothed form)
	•	phase still exists, but is derived from one or more cycle layers (more on this below)
	•	pulse still exists (metronome-like), and may have multiple rates
	•	timeModel.kind = 'infinite', with windowMs only for UI view framing

Key: Infinite still has structured periodicity via phase layers, not via resetting time.

⸻

7) Ambient / “infinite but rhyming” is a TimeRoot feature

This is where your unique identity comes from.

In the unified model, the TimeRoot can emit multiple phase bases (or you derive them from one base), but the important thing is:
	•	You never reset global time
	•	You derive layered loops from monotonic time

Example:
	•	phaseA: 7.5s loop
	•	phaseB: 23s loop
	•	pulse: beats at 120 BPM
	•	barPulse: beats every 4 pulses
	•	superPulse: beat every 16 bars

This gives you the “music at multiple time scales” feel without chaos/randomness.

Mechanically: TimeRoot produces or seeds these canonical buses (phaseA, pulse, energy), and downstream blocks publish/consume through buses.

⸻

8) Scrubbing vs performance becomes explicit and correct

Because transport has an explicit mode, you can enforce:
	•	Scrub-safe blocks: can evaluate at arbitrary t deterministically (no hidden integration state)
	•	Transport-only blocks: maintain state over frames (integrators, delays, sample-hold)

TimeRoot participates by:
	•	exposing whether it supports scrub (finite/cyclic are scrub-friendly; infinite may be “windowed scrub”)
	•	defining how scrubbing maps to local time signals (timeMs, phase)

This is where you reconcile “instrument mode” vs timeline.

⸻

9) Compile-time + runtime “truth” about time

Right now TimeModel is inferred and only sometimes used.

End-state:
	•	Compiler always returns timeModel derived from TimeRoot.
	•	Player always calls applyTimeModel(model), but that method now only:
	•	updates UI framing defaults (windowMs)
	•	never changes time wrapping mechanics

All mechanics are inside the patch graph via TimeRoot signals.

⸻

10) Risks and how you “put nails in the coffin”

Risk: Users want quick “preview loop this 2s range”

Solution: UI-only preview windowing
	•	does not alter patch semantics
	•	just changes the displayed window and scrub range

Risk: Stateful blocks break when time is monotonic and you scrub

Solution: runtime mode + explicit state policy
	•	stateful blocks either:
	•	disallow scrub (UI warns / disables scrub)
	•	or re-integrate from initial state (expensive but deterministic)
	•	or use cached checkpoints (best long-term)

Risk: Patches without TimeRoot

Solution: hard invariant, plus auto-insert
	•	creating a patch inserts a default TimeRoot immediately
	•	deleting TimeRoot is forbidden (must replace)

⸻

11) Concrete changes grounded in your current implementation

Based on your report, the practical structural changes are:
	1.	Remove player wrapping logic (loopMode/maxTime as authority)
	2.	Make TimeRoot required (remove feature flag gate)
	3.	Make compiler always produce TimeModel from TimeRoot (no inference from legacy blocks)
	4.	Make PreviewPanel reflect TimeRoot topology (not a loop button cycling player modes)
	5.	Demote PhaseClock into a pure modulator that consumes TimeRoot outputs
	6.	Make “timeline” a view framing (window over monotonic time) rather than a finite truth unless TimeRoot is finite

⸻

If you say “Next”, we’ll deep dive issue 3: Layout as projection, not semantics—how to remove lanes without falling into free-form node editor pain, while enabling multiple UIs over the same patch.