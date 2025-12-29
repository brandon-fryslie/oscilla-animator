
Spec 7: Error taxonomy & diagnostics for time violations

This spec defines exactly how time-related errors are detected, categorized, reported to users, and reported to engineers. The goal is: no silent failure, no fallback behavior, and no vague “compile failed” messages. Every time-system failure is a typed error with deterministic repro and actionable detail.

This is grounded in your compiler architecture (graph build → validation → topo/SCC → compile artifacts) and in the new TimeRoot/TimeModel contract.

⸻

1) Error System Requirements (Global)

1.1 Errors are structured, not strings

Every compilation failure is a structured object:

interface CompileError {
  code: string
  severity: 'error' | 'warning'   // warnings optional; errors block execution
  title: string
  message: string                // one paragraph max
  details?: string[]             // bullet list of specifics
  locations?: ErrorLocation[]    // references into patch graph
  help?: { label: string, action: FixAction }[]
}

1.2 Locations are first-class graph references

type ErrorLocation =
  | { kind: 'Block', blockId: string }
  | { kind: 'Port', blockId: string, portId: string }
  | { kind: 'Bus', busId: string }
  | { kind: 'Edge', from: PortRef, to: PortRef }
  | { kind: 'SCC', nodes: GraphNodeId[] }

UI must be able to highlight:
	•	the TimeRoot block
	•	relevant ports
	•	relevant bus rows (phaseA/pulse/etc.)

⸻

2) TimeRoot Errors (Topology Declaration)

These are the highest priority. If TimeRoot is invalid, nothing else is meaningful.

TR-001: Missing TimeRoot
	•	Condition: 0 blocks with role='TimeRoot'
	•	Title: No Time Topology
	•	Message: This patch has no TimeRoot. Choose Finite, Cycle, or Infinite.
	•	Locations: none (global)
	•	Help actions:

	•	“Insert FiniteTimeRoot”
	•	“Insert InfiniteTimeRoot”

TR-002: Multiple TimeRoots
	•	Condition: >1 TimeRoot blocks present
	•	Title: Conflicting Time Topology
	•	Message: This patch has multiple TimeRoots. Only one is allowed.
	•	Locations: all TimeRoot blocks
	•	Help actions:
	•	“Keep selected, remove others”

TR-003: TimeRoot has upstream dependencies
	•	Condition: any incoming wire/bus binding into a TimeRoot port
	•	Title: TimeRoot cannot be driven
	•	Message: TimeRoot must be unconditional and cannot depend on signals or buses.
	•	Locations: offending edges/ports
	•	Help: “Disconnect input(s) from TimeRoot”

TR-004: TimeRoot inside composite definition
	•	Condition: composite contains TimeRoot
	•	Title: Invalid Composite Definition
	•	Message: Composites cannot declare time topology.
	•	Locations: composite definition + internal TimeRoot node reference

⸻

3) TimeModel Consistency Errors (Topology vs Signals)

These ensure TimeRoot kind matches required canonical buses / signals.



	•	Title: Missing primary phase


	•	Details: expected port type: Signal



	•	Condition: no wrap/pulse event output (or wrong type)
	•	Title: Missing cycle pulse



TM-103: Reserved bus mismatch (phaseA/pulse/progress)
	•	Condition: a reserved bus exists but has wrong TypeDesc
	•	Title: Reserved bus has wrong type
	•	Message: The reserved bus name is typed and cannot be reassigned.
	•	Locations: busId
	•	Details: show expected vs actual TypeDesc
	•	Help: “Rename bus” or “Fix bus type”

TM-104: Required reserved bus missing (when required)

	•	Title: Missing required system bus
	•	Message: Cycle patches must provide phaseA and pulse buses.
	•	Locations: TimeRoot block + bus board area
	•	Help: “Auto-publish TimeRoot outputs to buses”
	•	(This is not a fallback: it’s an explicit fix action that updates patch data.)

⸻

4) PhaseClock (Secondary Clock) Errors

PhaseClock is a derived block; these errors prevent ambiguous time behavior.

PC-201: PhaseClock has no time source
	•	Condition: neither tIn nor phaseIn connected
	•	Title: PhaseClock needs a time input
	•	Message: Connect TimeRoot.t or a phase source.
	•	Locations: PhaseClock block

PC-202: PhaseClock has multiple time sources
	•	Condition: both tIn and phaseIn connected
	•	Title: Ambiguous PhaseClock input
	•	Message: PhaseClock may be driven by time or phase, not both.
	•	Locations: PhaseClock ports

PC-203: Invalid period
	•	Condition: period <= 0
	•	Title: Invalid clock period
	•	Message: Period must be greater than zero.
	•	Locations: PhaseClock block/param

⸻

5) Feedback & SCC Time Violations

These are where time + memory + cycles interact. They must be precise because they’re the hardest bugs to diagnose.

FB-301: Illegal feedback loop (no memory boundary)
	•	Condition: SCC exists that contains a cycle and crosses no memory blocks
	•	Title: Illegal feedback loop
	•	Message: Feedback loops must include a memory block (Delay, Integrate, SampleHold, State).
	•	Locations: SCC node set
	•	Details: list cycle path (blocks/ports)
	•	Help: “Insert Delay in highlighted edge”

FB-302: Memory block in SCC but not on all cycle paths
	•	Condition: SCC includes memory but some cycle paths bypass it
	•	Title: Feedback loop not fully buffered
	•	Message: Every cycle path must cross a memory boundary.
	•	Locations: SCC
	•	Details: show at least one offending bypass path

FB-303: TimeRoot kind conflicts with feedback topology
	•	Condition: FiniteTimeRoot but patch contains unbounded feedback evolution without clamping
	•	Title: Finite topology conflicts with feedback system
	•	Message: This patch behaves infinitely but is declared finite.
	•	Locations: TimeRoot + SCC
	•	Help: “Switch Time Topology to Infinite”

(If you decide finite patches may contain feedback, this error becomes a policy decision; but under your “make decisions” rule, the spec demands consistency.)

⸻

6) UI / Player Contract Violations

These catch cases where compiled outputs don’t satisfy player binding requirements.

UI-401: Missing UiSignalBindings for TimeModel
	•	Condition: compiler output lacks required binding descriptor fields
	•	Title: UI binding incomplete
	•	Message: Compiler must provide UI signal bindings for time.
	•	Locations: none (compiler internal)
	•	Details: missing keys

UI-402: Binding refers to nonexistent bus/port after composite lowering
	•	Condition: UiSignalBindings points to BusId that doesn’t exist post-expansion, or PortRef rewrite fails
	•	Title: Broken UI binding reference
	•	Message: A required signal binding could not be resolved after lowering.
	•	Locations: busId or portRef
	•	Details: show original and rewritten refs

⸻

7) Error Presentation in the Editor (UX contract)

7.1 Error Panel structure
	•	Errors grouped by category:
	•	Time Topology
	•	Clocks
	•	Feedback
	•	Bus Bindings
	•	Each error shows:
	•	Title
	•	one-paragraph message
	•	“Jump to” button (highlights blocks/buses)
	•	optional “Fix” action

7.2 Canvas highlights
	•	Clicking error highlights:
	•	involved blocks with a red outline
	•	involved buses rows with red indicator
	•	involved edges (if you show edges) with red stroke
	•	SCC errors highlight all nodes in SCC plus the minimal path.

7.3 Player behavior on compile error
	•	Player continues running last valid program
	•	Status pill shows Error
	•	Preview keeps last valid visuals (no blank screen)
	•	User can inspect errors without losing output

No fallbacks, but also no destructive failure.

⸻

8) Engineering Diagnostics (for reproducibility)

Every CompileError must include:
	•	patch version
	•	TimeRoot kind and parameters snapshot
	•	deterministic compile hash:
	•	hash of patch graph + bus routing + TimeRoot config
	•	list of discovered TimeRoot blocks
	•	SCC summary (for FB errors)

This allows a developer to reproduce from logs.

