Spec 3: What the UI shows for each TimeRoot mode (Finite / Cyclic / Infinite)

This is the authoritative UI spec for the looping player. It is grounded in the hard rule we just set:

The UI is driven exclusively by CompiledProgram.timeModel (from the TimeRoot).
No inference from PhaseClock. No heuristics. No player-side looping.

The current timeline player is replaced with a Time Console: a single area that changes structure depending on the TimeModel.

⸻

1) Global Player UI Structure (Always Present)

These elements exist in all modes and never disappear:

1.1 Run State
	•	RUN / FREEZE button pair
	•	Live indicator:
	•	● RUNNING when evaluating
	•	○ FROZEN when frozen
	•	Freeze preserves state exactly.

1.2 Speed
	•	Speed control (multiplier, default 1.0)
	•	Applies to system time advance (dt scaling)
	•	Does not change topology.

1.3 Seed / Re-seed
	•	Seed display + edit
	•	Changing seed triggers an explicit “Reinitialize” action with confirmation.
	•	No implicit resets.

1.4 Compile Status
	•	Small status pill:
	•	OK / Compiling… / Error
	•	On compile, preview continues rendering old program until swap.

1.5 Mode Badge (Time Topology)

A prominent badge that always reflects the TimeRoot:
	•	FINITE
	•	CYCLE
	•	INFINITE

This badge is not decorative. It is the user’s “what kind of thing am I building?” anchor.

⸻

2) FINITE Mode UI (FiniteTimeRoot)

2.1 Visual Form: Bounded Progress Bar

A bounded progress track with explicit start/end.

Displayed:
	•	0.00s on left
	•	duration on right
	•	A playhead that moves from left to right and stops.

Controls:
	•	Scrub (drag playhead): sets localT
	•	Jump to start/end
	•	Optional: “Play once” semantics are implicit (it ends)

2.2 Primary Readouts
	•	Time: 1.23s / 4.50s
	•	Progress: 27%

2.3 Behavior
	•	If RUN and reaches end:
	•	holds at end (does not wrap)
	•	shows status: ENDED
	•	FREEZE freezes at current local time.

2.4 What is not shown
	•	No ∞
	•	No phase ring
	•	No wrap indicators
	•	No “cycle” labeling

2.5 Optional “Loop View” is forbidden



⸻



3.1 Visual Form: Phase Ring + Period

Cycle mode is not a timeline. It is a phase instrument.

Primary visualization: a phase ring (circular scrubber).

Elements:
	•	Circular ring with moving indicator dot
	•	Wrap seam is visible but subtle (tick mark at top)
	•	Displays Period: 4.50s
	•	Shows Mode: Loop or Mode: Pingpong

The circle is not decoration: it prevents the “start/end” mental model.

3.2 Primary Controls
	•	Phase Scrub (dragging around ring)

	•	does not reset state
	•	Period editor:
	•	Period 4.50s (click to edit)
	•	Mode toggle (Loop/Pingpong):


3.3 Secondary Phase Lanes (Optional)

Below the main ring, show optional mini-strips for:
	•	Phase B (if present/published)
	•	Other declared phases

These are not required, but when shown they:
	•	display as smaller rings or wrap-strips
	•	are read-only unless the user explicitly designates them as scrubbable

3.4 Readouts
	•	Phase A: 0.37
	•	Cycle #: 128
	•	Wrap indicator flashes subtly when wrap event fires

3.5 What is not shown
	•	No “end”
	•	No “duration”
	•	No time range slider
	•	No global loop toggle (looping is inherent)

⸻

4) INFINITE Mode UI (InfiniteTimeRoot)

4.1 Visual Form: Sliding Window Scope

Infinite mode is neither clip nor loop. The UI must communicate:

“This runs forever; you are viewing a window into it.”

Primary visualization: a scope window strip.

Elements:
	•	A horizontal strip representing the observation window
	•	Labeled:
	•	Window: 10s
	•	A “now” marker at the right edge
	•	The window scrolls continuously when RUN.

4.2 Primary Controls
	•	Window size editor:
	•	Window 10s (click to edit)
	•	View scrub:
	•	dragging shifts timeOffset (view transform)
	•	does not alter underlying system time
	•	Optional: “Hold View” toggle:
	•	freezes view offset while system continues (advanced)
	•	only if you explicitly want that capability

4.3 Readouts
	•	Now: 12m 34s (time since start, or absolute if you want)
	•	View Offset: -2.3s if user scrubs away from “now”

4.4 What is not shown
	•	No loop icon
	•	No phase ring by default
	•	No suggestion of repetition

4.5 Optional “Cycles Detected” are forbidden

Infinite mode does not infer cycles from PhaseClocks.


However, you may show published phase buses as read-only scopes in a “Signals” panel (separate from Time Console).

⸻

5) Interaction Rules Shared Across Modes

5.1 Scrub never resets state

Scrubbing changes view transforms:
	•	Finite: local time mapping
	•	Cycle: phase offset mapping
	•	Infinite: timeOffset mapping

Not:
	•	system time resets
	•	state reinitialization

5.2 Structural changes require explicit user intent

Any edit that changes TimeRoot kind or key parameters (period, duration, mode) is considered topology-changing.

When such a change occurs while RUNNING:
	•	UI presents a modal choice:

Apply Time Topology Change
	•	Apply now (may reinitialize time mapping)
	•	Apply on next wrap (Cycle only)
	•	Apply when frozen

No silent application.

5.3 Player never loops time

There is no loopMode in the player UI anymore.
The player only:
	•	advances system time
	•	freezes system time
	•	scales dt



⸻

6) The “TimeRoot Picker” UI (Editor Integration)

TimeRoot is not hidden in the graph. It is a first-class object.

There is a dedicated control in the editor header:

Time Topology
	•	Finite
	•	Cycle
	•	Infinite

Selecting changes which TimeRoot block exists in patch (single instance).

This is the only way to change patch topology (besides editing the block directly).

⸻

7) Acceptance Criteria (UI)

A designer/engineer has delivered “Yep, that’s it” when:
	1.	The player never shows a linear timeline in Cycle or Infinite.
	2.	Looping is visually obvious in Cycle mode without words.
	3.	Infinite mode never implies repetition.
	4.	Scrubbing never causes a reset.
	5.	The UI state is derived from timeModel only.
	6.	There is no “loop toggle” anywhere in the player.
	7.	A PhaseClock looping does not change player UI mode.

⸻

That’s the complete spec for “what the UI shows for each TimeRoot mode,” grounded directly in the TimeModel + TimeRoot architecture and the PhaseClock separation you need.
