Spec 6: No-jank hot swap rules for time topology changes

This spec defines exactly how the system behaves when the patch changes while running, with particular focus on changes to TimeRoot and other time-topology-relevant structures. It is the authoritative contract for “live editing without visual jank,” and it deliberately avoids fallback behavior: changes are either guaranteed stable or they are explicitly gated with clear UX.

This spec assumes:
	•	player time t is monotonic/unbounded
	•	patch topology is defined solely by TimeRoot
	•	compiled output includes timeModel + UiSignalBindings
	•	buses are first-class and deterministic

⸻

1) Two-Phase Commit for Program Swaps (Mandatory)

Hot swap is never “replace the world immediately.” It is a deterministic two-step process:

1.1 Compile in background while running old program
	•	Old program continues rendering continuously.
	•	New program compiles on the side.

1.2 Swap at a deterministic boundary
	•	Swap occurs only at a Swap Boundary (defined below).
	•	Swap is atomic on a frame boundary.

Invariant: there is always exactly one program driving the preview.

⸻

2) Classify Every Edit into One of Three Change Classes

Every edit to the patch is classified before compilation.

Class A: Param-Only (No structural changes)

Examples:
	•	changing a scalar value
	•	tweaking a lens mapping
	•	modifying a bus combine mode (non-critical)
	•	changing color constants

Guarantee
	•	No state reset
	•	Apply immediately (next frame after compile)
	•	No warning UI

Class B: Structural but State-Preserving

Examples:
	•	adding/removing a stateless block
	•	rewiring stateless parts of the graph
	•	adding a PhaseClock (secondary)
	•	changing bus subscriptions/publishers that don’t affect domain identity or memory loops

Guarantee
	•	Preserve all eligible state (see Section 4)
	•	Swap occurs at a safe boundary (Section 3)
	•	UI shows a small “Scheduled change” indicator if boundary is not “now”

Class C: Topology / Identity / State-Resetting

Examples:
	•	changing TimeRoot kind (Finite ↔ Cycle ↔ Infinite)

	•	changing Domain count or element identity rules
	•	editing memory blocks inside feedback loops (Delay/Integrate topology)
	•	changes that modify SCC structure (feedback legality)
	•	any edit that invalidates stable internal IDs for stateful nodes

Guarantee
	•	Explicit user acknowledgement required
	•	Swap is gated and can be scheduled, but state reset may be unavoidable
	•	UI must present choices and consequences

No silent resets. Ever.

⸻

3) Swap Boundaries (When swaps are allowed)

The system defines three possible swap boundary types. Which ones are available depends on TimeModel.

3.1 Frame Boundary (always available)

Swap at the next rendered frame.
	•	Use for Class A changes.
	•	Also allowed for Class B if safe.

3.2 Pulse Boundary (preferred for cyclic patches)

Swap when the pulse bus fires (wrap/endpoints).
	•	Available only if UiSignalBindings.buses.pulse exists.
	•	Used for changes that would otherwise cause phase discontinuity.

3.3 User Boundary (freeze-required)

Swap only when the user freezes.
	•	Used when change is Class C and cannot be made continuous.

⸻

4) State Preservation Rules (Hard contract)

To avoid jank, the compiler/runtime must be able to migrate state from old program to new program.

4.1 Stateful nodes are those with persistent internal memory

Examples:
	•	DelayLine
	•	Integrate
	•	SampleHold
	•	any explicit State block
	•	renderers that keep per-instance buffers/caches that matter visually

Each stateful node must expose a stable StateKey:

StateKey = { blockId: string, internalKey?: string }

For composites:
	•	internal nodes derive stable IDs from composite instance + internalStableKey

4.2 State migration happens by key match

At swap time:
	•	new program requests state entries by StateKey
	•	runtime copies old state if keys match and types match
	•	if a key is missing or type differs, that node initializes to default state (but see Class C rules)

4.3 Preserve what you can, but don’t lie

If a Class B change results in partial state loss, this must be surfaced:
	•	“Some state will reinitialize (2 nodes).”
	•	Provide inspection list for debugging.

Class A and most Class B should preserve fully.

⸻

5) TimeRoot-specific no-jank behavior

TimeRoot changes are the most dangerous because they change the UI topology and the semantics of scrubbing.

5.1 Changing TimeRoot parameters within same kind

FiniteTimeRoot.duration
	•	If RUNNING: swap at frame boundary is allowed only if you can adjust mapping continuously.
	•	Prefer swap at progress-aligned boundary:
	•	keep current progress constant
	•	recompute localT mapping so the visual moment stays stable



This is highly sensitive. Default rule:
	•	if RUNNING: schedule swap on pulse boundary (wrap/endpoints)
	•	if no pulse bus: require freeze

The reason: changing period mid-cycle causes discontinuity in phase.

InfiniteTimeRoot.window

Window is view-only; changing it is always safe:
	•	frame-boundary swap, no state reset.

5.2 Changing TimeRoot kind (Finite ↔ Cycle ↔ Infinite)

This is Class C always.

UI must require explicit choice:
	•	Apply now (resets topology + view transforms)
	•	Apply on boundary (only if going to Cycle and pulse exists)
	•	Apply on freeze (always available)

State rules:
	•	State may be preserved if StateKeys remain valid and semantics remain meaningful, but do not promise it.
	•	Default: topology change implies a state reinit prompt.

⸻

6) Domain identity (element-level no-jank)

Many visuals will flicker if element identity changes. Therefore:

6.1 Domain changes are Class C unless identity is preserved

Changing:
	•	element count
	•	sampling strategy
	•	ordering

is a topology/identity change.

Allowed state-preserving domain edits must follow:
	•	old elements keep their IDs
	•	new elements get new IDs deterministically
	•	removed elements disappear deterministically

If you cannot guarantee that, the edit must be treated as Class C and explicitly gated.

⸻

7) UI/UX for scheduled swaps (concrete)

When user edits while RUNNING:

7.1 Class A
	•	no UI interruption
	•	subtle “Compiling…” pill
	•	swap on next frame

7.2 Class B
	•	show small banner: “Change scheduled”
	•	include selector:
	•	“Apply now” (if safe)
	•	“On next pulse” (if available)
	•	“On freeze” (always)

Default selection:
	•	“On next pulse” for Cycle patches
	•	“Apply now” for Infinite patches

7.3 Class C

Modal dialog (blocking, explicit):
Title: “Time topology change”
Body lists:
	•	what will change (mode badge will change)
	•	whether state will reset
	•	when it can be applied
Buttons:
	•	Apply now
	•	Apply on next pulse (if available)
	•	Apply when frozen
	•	Cancel

No hidden “don’t show again.”

⸻

8) Player & runtime APIs needed (authoritative)

8.1 Player must accept swap scheduling

player.scheduleProgramSwap(newProgram, {
  boundary: 'frame' | 'pulse' | 'freeze',
  preserveState: boolean,
})

8.2 Runtime must expose pulse boundary detection

Pulse is a bus event. Runtime must be able to detect edges deterministically:
	•	evaluate pulse signal each frame
	•	detect rising edges
	•	trigger swap when edge occurs

If pulse isn’t present, you cannot offer that boundary option.

⸻

9) Determinism of swap timing

Swap boundary timing must be deterministic given:
	•	patch
	•	seed
	•	edit sequence
	•	user choices

Rules:
	•	frame boundary = next rendered frame after compile completion
	•	pulse boundary = next pulse edge after compile completion
	•	freeze boundary = when user freezes after compile completion

No race-y “whichever happens first” without being explicit.

⸻

10) What counts as “jank” (definition)

A swap is considered “no-jank” if:
	•	there is no blank frame
	•	there is no flicker due to renderer clearing
	•	phase continuity is maintained when claimed
	•	state continuity is maintained when claimed
	•	there is no hard reset unless explicitly confirmed
