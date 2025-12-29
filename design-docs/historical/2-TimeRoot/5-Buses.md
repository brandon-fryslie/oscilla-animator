Spec 5: How buses like phaseA, pulse, energy bind to TimeRoot & UI

This spec defines the canonical signal buses related to time/looping, how they are produced, how they’re consumed, and how the UI uses them—without inference and without special-casing random blocks. It also defines the rules for when these buses are “officially present” and therefore eligible to drive UI affordances.

This integrates with your bus-centric architecture and preserves the “patch owns topology” rule.

⸻

1) Canonical Bus Set (Time & Performance)

These buses are reserved names with reserved semantics. They are not “magic,” but they are standardized so the UI and default macros can rely on them.

1.1 Required buses by TimeRoot kind

FiniteTimeRoot
	•	progress (Signal) required
	•	phaseA optional
	•	pulse optional
	•	energy optional


	•	phaseA (Signal) required
	•	pulse (Signal) required (wrap or endpoints)
	•	energy optional but strongly encouraged

InfiniteTimeRoot
	•	none required
	•	energy strongly encouraged
	•	phaseA optional (local oscillators), but does not imply cyclic UI

Hard rule: Only TimeRoot determines topology. The existence of phaseA in Infinite mode does not promote UI to Cycle mode.

⸻

2) Canonical Bus Type Contracts

Using your TypeDesc system (world/domain).

phaseA
	•	TypeDesc: { world: 'signal', domain: 'phase', semantics: 'primary' }
	•	Meaning: UI-primary phase reference for cyclic time.
	•	Range:
	•	loop: [0,1) (wraps)
	•	pingpong: [0,1] (triangle), semantics should include pingpong

phaseB
	•	TypeDesc: { world: 'signal', domain: 'phase', semantics: 'secondary' }
	•	Optional secondary phase lane in UI.

pulse
	•	TypeDesc: { world: 'special', domain: 'event', semantics: 'pulse' }
	•	Meaning: musically useful trigger stream (wrap ticks, beat divisions, envelope triggers).

energy
	•	TypeDesc: { world: 'signal', domain: 'number', semantics: 'energy' }
	•	Range: recommended [0, +∞) or normalized [0,1] depending on bus config; UI treats it as “intensity.”

progress (Finite)
	•	TypeDesc: { world: 'signal', domain: 'unit', semantics: 'progress' }
	•	Meaning: 0→1 over duration (clamped)

⸻

3) How these buses are produced (authoritative sources)

3.1 TimeRoot must publish the canonical buses (when required)

This is key: the UI should not have to “bind to a port ref” and also “bind to a bus.” That duplicates pathways.

Rule:
	•	TimeRoot outputs are the canonical source of the required buses for that topology.
	•	The compiler (or patch initialization) ensures these are published.


	•	phaseA ← TimeRoot.phase
	•	pulse ← TimeRoot.wrap
Optionally:
	•	energy ← shaped(phaseA) if user selects a preset, but not automatic unless your templates do it

FiniteTimeRoot publishes:
	•	progress ← TimeRoot.progress

InfiniteTimeRoot publishes:
	•	none mandated

Implementation note (architecture):
	•	This is done by inserting publishers at compile time if needed, or by declaring them in the TimeRoot macro definition. But the spec requires that they exist.

⸻

3.2 Secondary clocks publish to secondary buses

PhaseClock (secondary) typically publishes:
	•	phaseB ← PhaseClock.phase
	•	pulse ← PhaseClock.wrap (if used as rhythmic trigger)
	•	energy ← envelope(phaseB) (if used as LFO energy)

But these are optional and authored by the patch or templates.

⸻

4) How UI binds to buses (and only buses)

The Time Console UI binds to the patch via a single export structure:

interface UiSignalBindings {
  timeModel: TimeModel
  buses: {
    phaseA?: BusId
    phaseB?: BusId
    pulse?: BusId
    energy?: BusId
    progress?: BusId
  }
}

Hard rule:
	•	UI never looks at arbitrary block ports.
	•	UI never hunts by name.
	•	UI only uses this binding descriptor.

This keeps UI stable as internal graphs evolve.

⸻

5) Bus presence semantics (“officialness”)

A bus only counts as present for UI if:
	1.	It exists in the bus registry, and
	2.	It has the correct TypeDesc, and
	3.	The compiler declares it in UiSignalBindings

This prevents a user from accidentally creating a bus named phaseA of the wrong type and confusing the UI.

If a patch declares a phaseA bus with wrong type:
	•	compile error: reserved bus has invalid type

⸻

6) How each bus drives UI affordances (precise)

phaseA drives:
	•	the Phase Ring in Cycle mode
	•	phase numeric readout
	•	cycle wrap indicator timing

pulse drives:
	•	subtle flash/tick indicator in UI
	•	metrical overlays in Phase Ring (optional)
	•	sync points for “apply at next wrap” actions (Spec 6)

energy drives:
	•	“intensity meter” widget in header
	•	optional auto-exposure / visual debugging overlays
	•	default mapping suggestions (lens presets)

progress drives:
	•	bounded progress bar in Finite mode
	•	“ended” state detection
	•	export preview alignment

⸻

7) Combine modes and determinism for canonical buses

Because these are shared channels, you need canonical combine defaults:
	•	phaseA: last
	•	Only one authoritative publisher should exist (TimeRoot). If more, it’s an error unless explicitly overridden.
	•	pulse: or (event merge)
	•	energy: sum (many influences accumulate)
	•	progress: last (should be only TimeRoot)

Hard rule:
	•	phaseA and progress must not have multiple publishers unless the user explicitly changes bus policy; otherwise compile error. These are control-plane signals.

⸻

8) What the user sees (concrete)

In the Bus Board:
	•	Reserved buses appear pinned at the top with a subtle “system” badge:
	•	phaseA, pulse, energy, etc.
	•	They show:
	•	type badge
	•	publisher count
	•	listener count
	•	live scope visualization appropriate to type:
	•	phase: ring sweep
	•	pulse: tick flashes
	•	energy: meter/sparkline
	•	progress: bounded meter

In the Time Console:
	•	The presence of these buses determines which widgets appear, but mode still comes from TimeModel.
