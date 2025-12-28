Prompt for Repo-Access LLM

You are an engineering assistant with full read access to the current repo (on disk).
Focus on: gallery/src/editor/** (ignore everything else unless needed for types or runtime).

Your job is to extract specific architectural facts (with file paths + code excerpts) so another architect can design a robust “multi-UI projection” foundation where multiple UIs (List view, Influence view, Time-sliced view, later performance view) operate over the same underlying patch data, with shared mutation ops and shared selection/navigation.

Do NOT propose new designs. Only report current reality + constraints.

Return your answer in the following sections, each containing:
	•	bullet list of findings
	•	file path(s)
	•	relevant code excerpts (short, but enough context)
	•	any important invariants you can infer (explicitly label “inferred” vs “stated”)

1) Canonical data model: Patch and all entity types

Find the single source(s) of truth for:
	•	Patch shape(s) and versioning
	•	Block / BlockInstance / Slot / Port / Connection
	•	Bus / Publisher / Listener
	•	Lens / Adapter chain / TypeDesc / SlotType / ValueKind mappings
	•	Selection model types (if any)

For each, answer:
	•	where is it defined
	•	how is it serialized/deserialized
	•	whether IDs are stable (how generated)
	•	whether there are multiple competing definitions (editor vs compiler types)

2) Store architecture and mutation surfaces

Identify all stores and their responsibilities:
	•	EditorStore, PatchStore, LogStore, SelectionStore, etc
	•	what is observable, what is derived/computed
	•	what are the current mutation entry points (actions) used by UI

Produce:
	•	a list of all store action methods that mutate patch state
	•	for each: what it changes (blocks, buses, listeners, etc) and whether it uses transactions already

Also: identify whether there is already any event/hook system or transaction system in use.

3) Compiler pipeline boundaries

Document the full compile path from editor patch → compiled program:
	•	what function is called from UI/runtime
	•	where “integration” happens (macro expansion? composite expansion?)
	•	where typechecking happens
	•	where buses are resolved/combined
	•	where Field / FieldExpr / Signal representations are defined

Specifically answer:
	•	Do we compile incrementally or always full compile?
	•	What compilation products exist (Program, RenderTreeProgram, TimelineHint/TimeModel, diagnostics)
	•	Where do diagnostics originate and how are they surfaced to UI?

4) Runtime/player integration points

Find:
	•	player/runtime time model (LoopMode, maxTime, applyTimelineHints, etc)
	•	how compiled program is evaluated per frame
	•	where any “live bus values” or previews could be sampled for UI

Answer:
	•	what call signature is used to render (program(time, ctx)?)
	•	what context exists (seed, dt, frame, element count, etc)
	•	whether there is an existing “debug/inspection” channel

5) Current UI dependency on stores and patch structure

Map the current UI components to the store APIs they consume:
	•	PatchBay / lanes UI
	•	Inspector
	•	Library
	•	PreviewPanel
	•	Console/diagnostics

For each component:
	•	what store fields it reads
	•	what actions it calls
	•	what assumptions it makes about layout (lanes, x/y positions, etc)
	•	whether it expects wires to exist or can tolerate buses-only

This is important to understand what must be decoupled to support multiple UIs.

6) Existing layout/positioning data

Determine whether blocks currently store:
	•	lane index
	•	x/y coordinates
	•	ordering keys
	•	graph grouping information

Show the exact fields and where used.

7) Undo/redo and persistence reality

Confirm:
	•	does undo/redo exist today?
	•	is there any “op log” or transaction abstraction?
	•	how is patch saved/loaded (localStorage? URL hash? file? server?)
	•	what persistence format is used (JSON schema, migrations)

8) Constraints and “do not break” invariants (as implemented)

From reading the code, list any invariants that are enforced today, such as:
	•	one writer per input
	•	type compatibility rules
	•	deterministic ordering rules (sortKey)
	•	restrictions on cycles / state blocks
	•	any restrictions on composite/macro expansion

Cite where enforced.

Output format requirements
	•	Use headings exactly as numbered above.
	•	Include file paths in every bullet.
	•	Include short code excerpts in fenced code blocks.
	•	If you cannot find something, say “NOT FOUND” and list what you searched for.