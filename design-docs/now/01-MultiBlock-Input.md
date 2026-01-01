Canonical spec: Multi-writer resolution with explicit combine modes (blocks + buses)

Core principle

Every input port may have 0..N writers. If N≠1, the value is defined by an explicit CombineMode (either on the input port, or on a bus). There is no “MultipleWriters” error anymore—only missing combine policy or type-incompatible combine policy.

This applies uniformly to:
•	direct wires (connections[])
•	bus bindings (listeners[] / publishers into bus + bus read)
•	default sources (implicit writer when N=0)

⸻

1) Data model changes (authoritative)

1.1 CombineMode

A single unified enum, used by both inputs and buses:

type CombineMode =
// Order-independent (commutative/associative)
| "sum" | "average" | "min" | "max"          // numeric, vectors, colors (componentwise)
| "mul"                                 // numeric/vectors/colors (componentwise), optional

// Order-dependent (non-commutative)
| "last" | "first"                      // any type
| "layer"                               // semantic alias of "last" with stable ordering contract

// Logical
| "or" | "and"                          // boolean only

// Custom (explicitly implemented kernel)
| { kind: "custom"; id: string };       // e.g. "blendOver", "paletteMix", etc.

1.2 Input port combine policy

Every input Slot must declare a combine policy for the “multi-writer case”.

interface Slot {
id: string;
label: string;
type: SlotType;
direction: "input" | "output";

// New:
combine?: CombinePolicy;
}

type CombinePolicy =
| { when: "multi"; mode: CombineMode }      // applies only when 2+ writers
| { when: "always"; mode: CombineMode }     // always reduces (rare)
| { when: "multi"; mode: "error" };         // optional: forbid multiple writers on that port

Default rule (if not specified): combine = { when:"multi", mode:"last" }.
•	This keeps “plumbing” painless.
•	It preserves deterministic behavior by requiring a defined ordering (see §3).

If you want strictness for certain ports, set { mode:"error" } (this is how you recover “single-writer” on a per-port basis).

1.3 Default Sources are writers

Default Sources are not “special.” They’re just a writer injected when N=0.
•	If N=0 → inject exactly 1 default writer.
•	If N≥1 → no default writer.

⸻

2) Resolution model (what the compiler produces)

2.1 InputEndpoint and Writers

For each input endpoint (blockId, slotId) the compiler builds a WriterSet:

type InputEndpoint = { blockId: string; slotId: string };

type Writer =
| { kind:"wire"; from:{ blockId: string; slotId: string }; connId: string }
| { kind:"bus"; listenerId: string; busId: string }
| { kind:"default"; defaultId: string; type: TypeDesc };

2.2 ResolvedInputSpec (normalized)

Pass “resolution” produces:

type ResolvedInputSpec = {
endpoint: InputEndpoint;
portType: TypeDesc;
writers: Writer[];                // length >= 1 after defaults injected
combine: CombinePolicy;           // from Slot.combine (or default)
};

No ValueRefs yet—this is still topology-level.

⸻

3) Determinism and writer ordering (non-negotiable)

3.1 Writer ordering contract

Any order-dependent combine (“last”, “first”, “layer”, many customs) must use a stable writer order that does not depend on insertion order, UI quirks, or JSON array order.

Define canonical writer sort key:
1.	For wires: (toEndpoint, from.blockId, from.slotId, connId)
2.	For bus writers: (toEndpoint, busId, listener.sortKey, listenerId)
3.	For default: always last priority (or always first—pick one and freeze it). I recommend: defaults are injected only when N=0, so ordering with others never occurs.

Concretely:

function writerSortKey(w: Writer): string {
switch (w.kind) {
case "wire": return `0:${w.from.blockId}:${w.from.slotId}:${w.connId}`;
case "bus":  return `1:${w.busId}:${listenerSortKey(w.listenerId)}:${w.listenerId}`;
case "default": return `2:${w.defaultId}`;
}
}

3.2 “layer” mode definition
•	“layer” is not its own math.
•	It is order-dependent and must be deterministic.
•	For inputs: “layer” ≡ “last” over the stable writer ordering.
•	For buses: same.

If you want a semantic difference later (e.g., z-order/alpha composition), do it as { kind:"custom", id:"blendOver" }.

⸻

4) Type rules (compile-time)

4.1 Combine mode must be type-valid

Given portType, validate combine.mode:
•	sum/average/min/max/mul require numeric-ish types:
•	number, vec2/vec3, color (componentwise), possibly bounds.
•	or/and require boolean.
•	last/first/layer accept any type.
•	custom requires a registered reducer implementation compatible with the port type (checked by registry).

If invalid → CompileError: InvalidCombineModeForType { endpoint, mode, type }.

4.2 Writer type assignability

Each writer must be assignable to the port type:
•	wire: from slot type → port type
•	bus: (bus read type after lens) → port type
•	default: default type must exactly match port type (by construction)

Failures:
•	PortTypeMismatch (wire)
•	BusTypeMismatch / LensTypeMismatch (bus)

⸻

5) Where this happens in the pipeline

Canonical location: Pass 6 (graph resolution + lowering)

Pass 6 should do all of the following:
1.	Enumerate writers per input endpoint:
•	wires (connections)
•	bus listeners (listeners targeting the endpoint)
2.	Inject Default Source writer if writer count is 0
3.	Validate combine policy + types
4.	Lower into IR nodes:
•	ensure each writer becomes a ValueRef (slot)
•	if writers.length === 1 → direct bind
•	if writers.length > 1 → insert a Combine node producing a single slot for the input

Output of Pass 6:
•	resolvedInputs: Map<toKey, ValueRef> where the ValueRef is the combined value slot for that input.
•	plus the schedule/lowering artifacts needed for runtime.

Key point: Combining happens in compilation/lowering, not schedule building. Schedule just executes steps.

⸻

6) IR lowering semantics (how multi-writers are represented)

6.1 Combine nodes

Introduce one canonical IR operation:

type IRNodeCombine = {
op: "combine";
mode: CombineMode;
type: TypeDesc;
inputs: ValueSlotId[];      // already ordered deterministically
out: ValueSlotId;
};

	•	For commutative modes you may skip ordering, but keep it anyway for reproducibility.
	•	For average, the runtime reducer must know n.

6.2 Bus combine vs input combine
•	Bus combine reduces multiple publishers into a single bus value per frame (per bus).
•	Input combine reduces multiple writers targeting an input endpoint.

They use the same reducer implementations and type rules, but they are distinct sites:
•	bus combine happens at bus-value production time
•	input combine happens when binding values to block inputs

Allowed and common: an input can have multiple wires + bus writer(s) simultaneously. That is now first-class; it is reduced by the input’s combine mode.

This implies: you no longer have “wire vs bus ambiguity.” They are just writers.

⸻

7) Default Sources under multi-writer semantics

Defaults are only injected at N=0, so they never interact with combine ordering. This keeps behavior intuitive and avoids “default leaking into mixes.”

If you ever want “default participates even when other writers exist,” that’s a separate feature: Slot.defaultParticipation: "onlyWhenEmpty" | "always"—don’t add it unless you truly need it.

⸻

8) Error taxonomy (canonical)
   •	InvalidCombineModeForType
   •	MissingCombinePolicy (only if you decide not to default to last)
   •	PortTypeMismatch
   •	BusTypeMismatch
   •	LensTypeMismatch
   •	UnknownCustomCombineReducer
   •	NonDeterministicWriterOrder (should never happen; asserted internally)

No MultipleWriters except if a port explicitly says combine.mode:"error".

⸻

9) Implementation plan + long-term unification

9.1 Implement now (minimal disruption)

Do it where the behavior already exists, but share the logic.
1.	Create resolveWriters.ts (shared)
•	inputs: patch (blocks, connections, listeners), slot type lookup, listener sortKey lookup
•	outputs: ResolvedInputSpec[] per endpoint + stable ordered writer lists
2.	Use it in:
•	compileBusAware.ts (legacy) to replace ad-hoc resolution
•	pass6-block-lowering.ts (IR path) to insert IRNodeCombine nodes when writers.length > 1
3.	Add a shared combineRegistry:
•	canCombine(typeDesc, mode) -> boolean
•	emitCombineIR(mode, type, inputSlots, outSlot) (or simply create IRNodeCombine)

9.2 Unify paths long-term (what to schedule and dependencies)

Schedule unification once IR path can run the golden patch end-to-end with:
•	bus lowering + combine
•	input combine nodes
•	default sources
•	state blocks
•	render sinks

At that point:
•	delete separate “bus-aware compile” and make everything go through Pass6 → Schedule
•	keep only one place where combine rules exist (shared combine registry + IRNodeCombine execution)

Dependencies to watch:
•	unified TypeDesc (editor/compiler type duplication must be solved or the combine/type checks will keep diverging)
•	event world (“event”) if you still care about pulse/event semantics—combine rules for events must be defined explicitly (usually “layer/last” only, not sum)

⸻
