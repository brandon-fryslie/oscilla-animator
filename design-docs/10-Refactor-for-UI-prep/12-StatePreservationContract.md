Spec: State Preservation Contract for No-Jank Hot Swaps

This spec defines exactly how the runtime swaps from Program A to Program B after any transaction, while preserving continuity and preventing visible jank. It assumes your architectural direction: buses, lazy Fields (FieldExpr), TimeRoot authority, and a semantic diff (RuntimeImpact) produced by the kernel.

This is the contract between:
	•	Kernel / compiler (what changed? what identities exist? what state blocks exist?)
	•	Runtime / player (how to swap? what state to keep? how to crossfade?)

⸻

0) Definitions

“Jank”

A visible discontinuity caused by:
	•	abrupt changes in time topology / phase
	•	element identity reindexing
	•	stateful blocks resetting unexpectedly
	•	renderer cache invalidation mid-frame
	•	sudden bus combine ordering changes

“Continuity”

Perceived continuity in:
	•	time/phase progression
	•	element motion/appearance trajectories
	•	state accumulators (integrators, histories)
	•	stable per-element identity across frames

⸻

1) Runtime invariants (must be true always)
	1.	Monotonic master time
The runtime maintains a monotonic wall time tNowMs and never “wraps” it.
	2.	TimeRoot defines topology
Programs consume time (and phase) as signals derived from TimeRoot; runtime never imposes loop behavior directly except by selecting/adjusting TimeRoot parameters via patch state.
	3.	Hot swap is atomic
A program swap happens on a frame boundary. You never render a half-swapped graph.
	4.	State lives outside pure programs
All persistent state is owned by the runtime (or an explicit state store), keyed deterministically so it can survive recompiles.

⸻

2) What must be externalized (the non-negotiable part)

To make hot swaps robust, you must move these out of “compiled closures” into a RuntimeStateStore:
	•	integrator accumulators
	•	delay/history buffers
	•	envelope counters
	•	trigger edge detectors
	•	any “memory block” internal mutable state
	•	renderer caches that depend on element identity (path tessellation cache, gradient cache, etc.)

Why

If state lives inside compiled functions, recompiling changes closure identity and you lose continuity. Even if you attempt to preserve closure instances, structural edits invalidate them.

⸻

3) RuntimeStateStore (exact conceptual API)

The runtime owns a store keyed by StateKey:

StateKey = hash(
  patchId,
  stateBlockStableKey,
  scopeKey,
  optionalElementKey
)

Stable key requirements
	•	stateBlockStableKey MUST be stable across recompiles when the “same conceptual block” persists.
	•	For primitives: use blockId + portId (or blockId + stateSlotId).
	•	For composites: use instanceBlockId + internalPath + internalStateSlotId (path must be stable; if you don’t have stable internal paths, you will have jank).

Store operations (conceptual)
	•	getOrCreate(key, initFactory) -> StateCell
	•	cloneSnapshot(keys) -> Snapshot
	•	applySnapshot(snapshot, policy)
	•	evict(keys) (rare; mostly for memory)

⸻

4) The compiler must surface “state handles”

Every stateful block compilation must emit not just a value, but a request for state storage.

Conceptually, instead of:
	•	Integrate.compile → Signal

You compile:
	•	Integrate.compile → Signal that references a StateCell

Meaning the signal evaluation does:
	•	read cell.value
	•	update cell.value deterministically based on dt and input
	•	write back

This keeps the program pure from the outside: evaluation is deterministic given state + inputs.

Required metadata from compiler

For each compiled graph, compiler returns:
	•	stateHandles: StateHandle[]

Where each handle is:
	•	keyParts: { blockId, stateSlotId, compositePath? }
	•	kind: 'integrator' | 'delayLine' | 'counter' | ...
	•	schemaVersion: number (to support upgrades of state representation)
	•	resetPolicyHint: 'preserve' | 'crossfade' | 'reset' (fallback hint; runtime uses diff + identity)

⸻

5) Swap strategies (exact behaviors)

The runtime chooses swap strategy from DiffSummary.RuntimeImpact.

5.1 Strategy: instant

Use when impact is minor.

Steps:
	1.	compile new program
	2.	bind program to existing RuntimeStateStore
	3.	render next frame with program B

State handling:
	•	preserve all state keys that still exist
	•	create new state cells for new keys
	•	orphaned cells remain until evicted

5.2 Strategy: crossfade

Use when “look” or “mapping” changed but continuity is desired.

Steps:
	1.	keep Program A active
	2.	compile Program B
	3.	run both for N frames and blend RenderTrees (or final rendered frames)
	4.	after fade, drop A

State handling:
	•	A and B share the same RuntimeStateStore by default only if state key sets are compatible
	•	otherwise:
	•	A reads/writes its state keys
	•	B reads/writes its state keys
	•	both coexist during fade

Blending:
	•	Prefer blending at render output (framebuffer crossfade) for simplicity
	•	Optionally blend at RenderTree node level later

5.3 Strategy: freezeAndFade

Use when B needs a warm-up (new state blocks, expensive caches) or time topology changed.

Steps:
	1.	capture last rendered frame of A (“freeze frame”)
	2.	compile B, allow it to run for warmup window W without displaying
	3.	crossfade freeze frame → B over N ms

State handling:
	•	B gets fresh or snapshot-applied state depending on policy below
	•	This eliminates visible “spin up” artifacts

5.4 Strategy: reset

Only when continuity is impossible or misleading (rare).

Steps:
	•	clear selected state partitions
	•	render with new program

⸻

6) The big hard part: state mapping and preservation rules

The kernel’s DiffSummary gives you:
	•	which ports changed
	•	which render sinks affected
	•	which time model changed
	•	which identity changed

From that, runtime chooses preservation at three levels:

Level A: Time continuity

Level B: State continuity (memory blocks)

Level C: Element continuity (per-element identity + field evaluation)

We define exact rules for each.

⸻

6.1 Time continuity rules

You never “reset time” globally unless explicitly requested.

Instead, you adjust the TimeRoot input parameters (or the derived time mapping) so the new program’s time signals align.

Time alignment contract

When swapping:
	•	If TimeModel kind unchanged (cyclic→cyclic, infinite→infinite, finite→finite):
	•	preserve tNowMs
	•	recompute timeRoot outputs normally
	•	If kind changed:
	•	runtime chooses one:
	1.	preserve wall time but treat phase/time signals as discontinuous (high jank)
	2.	map old phase to new phase (preferred)
	3.	fade between old and new outputs (preferred)

Canonical mapping rule (preferred)
If both before and after expose phaseA (or canonical phase):
	•	sample old phase at swap time: p0
	•	set new TimeRoot “phase offset” so that new phase equals p0 at swap instant
	•	then let it evolve

This requires: TimeRoot supports a phaseOffset param internally (or an equivalent mechanism).

⸻

6.2 Stateful block continuity rules

Preserve state when:
	•	the state handle key still exists in the new program and
	•	its upstream driving signal is “compatible” (same world/domain or same bus binding with small lens changes) and
	•	identity partition unchanged (see element identity rules)

Reset state when:
	•	time topology changed in a way that breaks integrator assumptions (dt semantics changed)
	•	the driving signal’s world/domain changed (Signal↔Field, number↔vec2)
	•	the state schema version changed incompatibly

Crossfade state when:
	•	state is visible (envelope controlling alpha/size)
	•	mapping changed but continuity is desired

State crossfade mechanism
For scalar-like state cells:
	•	keep old value xOld
	•	set new cell initial value xNew = lerp(xOld, xNewFresh, w)
	•	or maintain two internal values and blend output while writing to new

For buffer-like state (delay lines):
	•	crossfade output samples for N frames while new buffer fills

⸻

6.3 Element identity continuity rules (critical)

This is what prevents “everything jumps because array indices changed.”

Requirements

Every Domain-producing block must expose:
	•	domainId: string (stable per conceptual domain)
	•	elementKey(i): ElementId for each element i (stable)
	•	count: number

Stable identity contract

If a render sink consumes a Domain, then every FieldExpr evaluation for that sink is done in the domain’s element order, but element identity is tracked by ElementId not index.

That means FieldExpr cannot fundamentally be “array at index i” as the identity source long-term; it must be “value for elementId”.

The practical bridge

You can still materialize arrays for performance, but you must preserve a mapping:
	•	index -> elementId
	•	and in some operations, elementId -> index (hash map or sorted key list)

When identity is considered “same”

Two domains are the same across swap if:
	•	domainId matches AND
	•	ElementId set matches (or is a superset with stable subset) AND
	•	ordering may differ, but mapping exists

If element set changed:
	•	if small change: attempt stable matching by ElementId and treat new elements as “born”
	•	if big change: crossfade render output

⸻

7) Lazy FieldExpr + materialization boundary (how it ties in)

Lazy fields are great for compile-time and bus mixing, but runtime must decide where to pay cost.

Golden rule

Materialize at render sinks, not upstream.

Render sinks (RenderInstances2D etc.) will request:
	•	FieldBuffer<T> for each consumed field, evaluated for a specific Domain, at a specific frame time

Field materialization caching

Cache by:
	•	(fieldExprHash, domainId, timeSampleBucket, viewportKey?)

But—careful:
	•	Many FieldExpr depend on time continuously; caching must use a time bucket (e.g. per-frame integer frame index) not raw ms.

No-jank implication

When swapping program:
	•	FieldExpr hashes will change; caches may invalidate
	•	freezeAndFade strategy hides the first-frame cache misses

⸻

8) The “nails in coffin” policy table

Given DiffSummary, runtime makes decisions by this table.

Change detected	Time continuity	State continuity	Render continuity	Swap strategy
only param tweaks (numbers)	preserve	preserve	preserve	instant
lens/adapter tweaks	preserve	preserve/crossfade	preserve	instant or short crossfade
bus publisher reorder on “last”	preserve	preserve	crossfade	crossfade
new state block added	preserve	new init	freeze to hide warmup	freezeAndFade
TimeModel period change	adjust (phase align)	preserve if compatible	crossfade	crossfade
TimeModel kind change	map phase if possible	reset risky state	freeze+fade	freezeAndFade
Domain count/ids change	preserve	reset per-element caches	crossfade output	crossfade
Render sink type changed	preserve	reset sink caches	crossfade output	crossfade or reset


⸻

9) What kernel must guarantee to make this work

The runtime contract depends on kernel/compiler guarantees:
	1.	Stable block ids across edits (you already have this)
	2.	Stable composite internal paths for state handles (or composites must provide stable “state slot ids”)
	3.	DiffSummary correctness (ports/buses/time/domain changes must be accurate)
	4.	TimeRoot supports phase alignment (offset or equivalent)
	5.	Domain producers provide stable ElementIds (not row/col string labels; opaque stable ids are fine)

⸻

10) What runtime must implement (in order)
	1.	RuntimeStateStore keyed by StateKey
	2.	Compiler emits StateHandles
	3.	Program evaluation reads/writes via RuntimeStateStore
	4.	Swap controller:
	•	takes DiffSummary.RuntimeImpact + SemanticDiff
	•	chooses swap strategy
	•	performs instant/crossfade/freezeAndFade
	5.	FieldExpr materialization at render sinks with caching
	6.	Domain identity mapping and element matching

⸻

This spec is the backbone for “edit live forever” without fear.

If you want, the next logical spec would be the exact Domain / ElementId contract (how Domain producers define ids, how render sinks consume them, how identity matching works when domains change).