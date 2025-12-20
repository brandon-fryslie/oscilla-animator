This is a grounded, end-state technical specification for looping / infinite animation in Loom, written directly against:
	•	your actual player.ts runtime
	•	your actual compiler model
	•	your actual Signal / Field / Program architecture
	•	the PhaseClock collision you described
	•	the TimelineHint type that already exists but is unused
	•	and your explicit directive that the current UI must be replaced, not evolved

This spec assumes:
	•	You are willing to rewrite player, compiler interfaces, and UI
	•	There is exactly one correct long-term model
	•	There are no fallback paths
	•	Everything is designed for infinite, cyclic, live systems

⸻

Loom Looping & Infinite Playback

Canonical Technical Specification (Authoritative)

⸻

1. Problem Statement (Grounded in Current Code)

1.1 What Exists Today (Factually)

There are two independent time systems:

System	Location	Behavior
Player Time	player.ts	Linear t with maxTime, wraps or clamps
Patch Time	PhaseClock signal	Internally loops or ping-pongs phase

They are not coordinated.

This creates:
	•	Mid-cycle resets
	•	Arbitrary truncation
	•	UI lies (finite timeline for infinite patches)
	•	Undefined behavior when multiple phase systems exist

⸻

2. Fundamental Architectural Decision

There is exactly ONE time system

The patch defines time topology.
The player does not.

This is non-negotiable.

The player never decides:
	•	duration
	•	looping
	•	ping-pong
	•	infinity

The player:
	•	hosts
	•	observes
	•	controls rate
	•	controls freeze/run

But never defines temporal structure.

⸻

3. Time Is a First-Class Compilation Artifact

3.1 New Compiler Output Contract

Compiled patches must return:

interface CompiledProgram {
  program: Program<RenderTree>
  timeModel: TimeModel
}

Where TimeModel is:

type TimeModel =
  | FiniteTimeModel
  | CyclicTimeModel
  | InfiniteTimeModel


⸻

3.2 TimeModel Definitions

Finite

interface FiniteTimeModel {
  kind: 'finite'
  durationMs: number
}

Used only when:
	•	Patch explicitly contains a finite PhaseMachine
	•	No cyclic or infinite time sources exist

⸻

Cyclic (Looping)

interface CyclicTimeModel {
  kind: 'cyclic'
  periodMs: number
  phaseDomain: '0..1'
}

Produced when:
	•	Any PhaseClock exists in loop or ping-pong mode
	•	Or any bus declares cyclic phase semantics

Important
There may be multiple cycles internally, but the compiler must resolve a primary cycle for UI anchoring.

⸻

Infinite (Ambient)

interface InfiniteTimeModel {
  kind: 'infinite'
  windowMs: number
}

Used when:
	•	Patch contains stateful feedback
	•	No dominant cycle exists
	•	Time never meaningfully repeats

The windowMs is a view window, not a duration.

⸻

4. Compiler Responsibilities (Explicit)

4.1 Time Model Inference (Required)

The compiler must analyze the patch graph and infer the time model.

Rules (deterministic):
	1.	If any PhaseClock(mode ≠ once) exists → cyclic
	2.	If any feedback loop crosses memory blocks without full cycle closure → infinite
	3.	If only finite PhaseMachines exist → finite
	4.	If conflicting models exist → error (patch invalid)

There is no fallback.

⸻

4.2 Phase Ownership
	•	Phase is not derived from player time
	•	Phase is computed inside the patch
	•	Player time is merely an input scalar

Phase signals own looping, not the transport.

⸻

5. Player Runtime Redesign

5.1 Player Time Is Unbounded

The player never wraps t.

Current code:

time = time % maxTime

This is deleted permanently.

New model:

time += dt * speed

No clamp
No wrap
No reset

Ever.

⸻

5.2 Player Uses TimeModel

The player receives TimeModel from compiler and configures itself:

player.applyTimeModel(timeModel)

Behavior:

TimeModel	Player Behavior
finite	Shows bounded scrub window
cyclic	Shows phase-wrapped view
infinite	Shows sliding window


⸻

6. Phase Scrubbing Semantics

Scrubbing never resets state.

Instead:

Action	Effect
Scrub in cyclic	Sets phase offset
Scrub in infinite	Offsets time origin
Scrub in finite	Sets absolute time

This requires:
	•	Phase offset injection
	•	NOT resetting player time
	•	NOT reinitializing patch state

⸻

7. Signal & Field Implications

7.1 Signals
	•	Signals receive unbounded t
	•	Phase generators map t → phase
	•	Multiple phase generators can coexist

Signals never assume t wraps.

⸻

7.2 Fields
	•	Fields inherit phase indirectly
	•	FieldExpr remains lazy
	•	No bulk re-evaluation on wrap

Looping is topological, not evaluative.

⸻

8. TimelineHint Is Removed

The existing TimelineHint type is deleted.

It is replaced by TimeModel, which is:
	•	mandatory
	•	authoritative
	•	compiler-produced

No optional hints
No UI guesses
No player heuristics

⸻

9. UI: Complete Replacement

9.1 The Timeline Is Gone

There is no linear timeline.

There is no:
	•	start
	•	end
	•	clip length

Ever.

⸻

9.2 New Player UI Structure

┌──────────────────────────────────────────────┐
│ LIVE SYSTEM                                  │
│ ● RUNNING                                   │
├──────────────────────────────────────────────┤
│ Phase A  ◯──────────◯   Period 4.5s   ∞     │
│ Phase B  ◯────◯              (secondary)    │
├──────────────────────────────────────────────┤
│ RUN / FREEZE     Speed 1.0     Seed 42       │
└──────────────────────────────────────────────┘


⸻

9.3 Phase View (Primary Control)
	•	Circular or wrap-aware linear strip
	•	Always visually loops
	•	No endpoints
	•	Scrubbing wraps seamlessly

This is the core control, not transport.

⸻

9.4 Infinite Mode UI

When TimeModel.kind === 'infinite':
	•	Phase view becomes windowed
	•	Label reads: Live Window (10s)
	•	Scrub shifts observation window, not system time

⸻

10. Editing While Running (No-Jank Contract)

10.1 Program Hot-Swap
	•	Compiler produces new program
	•	Old program continues rendering
	•	Swap occurs on frame boundary

State handling rules:
	•	Structural changes → state reset (explicit UI warning)
	•	Param changes → state preserved
	•	Phase changes → offset only

⸻

11. PhaseClock Redesign

11.1 PhaseClock Is a Time Declaration

PhaseClock no longer “loops internally”.

Instead:
	•	Declares a cycle
	•	Contributes to TimeModel inference
	•	Emits phase relative to declared cycle

PhaseClock does not override time.
It describes topology.

⸻

12. Multiple Cycles

Allowed.

Compiler rules:
	•	One primary cycle for UI anchoring
	•	Others are secondary modulators
	•	User can choose which cycle is “Phase A” in UI

⸻

13. Determinism Guarantees
	•	Player time monotonic
	•	Phase deterministic
	•	Scrub reversible
	•	Seed reinitializes only on explicit user action

⸻

14. Failure Is Explicit

Illegal cases:
	•	Conflicting cycles
	•	Finite + infinite topology
	•	Phase reset without state boundary

These are compile errors, not runtime hacks.

⸻

15. Summary: What Changes

Removed Forever
	•	maxTime wrapping
	•	player-defined looping
	•	timeline semantics
	•	TimelineHint

Added Permanently
	•	TimeModel as compiler output
	•	Unbounded player time
	•	Phase-centric UI
	•	Patch-authored time topology

⸻

Final Assertion

If this spec is followed:
	•	Infinite patches behave correctly
	•	Looping is never accidental
	•	UI never lies
	•	PhaseClock stops fighting the player
	•	Live editing becomes safe
	•	The system becomes instrument-grade

There is one time model, one authority, one truth.

This is the architecture that scales.
