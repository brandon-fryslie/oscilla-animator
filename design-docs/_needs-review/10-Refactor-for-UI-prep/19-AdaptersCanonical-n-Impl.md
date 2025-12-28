Auto-Adapters Spec: Algorithm, Insertion Rules, and Canonical Adapter Table

This is the full, single-path spec for how adapters are chosen and applied across:
	•	wires (block → block)
	•	bus bindings (publisher → bus, bus → listener)
	•	lens params (source → lens param)

It also defines which adapters are canonical, which are forbidden, and which are explicit-only (heavy).

⸻

1) Definitions

1.1 Adapter

An adapter is a deterministic, type-directed transform that changes TypeDesc (world and/or domain and/or semantics/unit).

Adapters are represented as an ordered list:

type AdapterStep = {
  id: AdapterId
  params?: Record<string, unknown>   // rarely used; mostly empty
}

1.2 Adapter Policy Classes

Every adapter has a policy:
	•	AUTO: may be inserted automatically when connecting/binding.
	•	SUGGEST: never inserted silently; UI offers it as a one-click fix.
	•	EXPLICIT: only inserted by user intent (requires confirmation).
	•	FORBIDDEN: cannot be used at all (hard error).

Policy is part of registry and is immutable.

1.3 Cost Classes

Adapters also have cost hints:
	•	cheap: scalar math, no allocation
	•	medium: per-frame computation but small
	•	heavy: per-element work, allocation, history/state, or reduction

Policy often correlates with cost, but not always.

⸻

2) Where adapters can appear

Adapters can live on any binding edge:
	•	Wire: Connection.adapterChain
	•	Publisher: Publisher.adapterChain
	•	Listener: Listener.adapterChain
	•	Lens param binding: LensParamBinding.adapterChain

Rule: adapters are always attached to the receiving side of a binding, even for publishers.

Concretely:
	•	wire A→B: adapterChain lives on B input
	•	publisher output → bus: adapterChain lives on publisher binding (because bus is “receiver”)
	•	bus → listener input: adapterChain lives on listener
	•	source → lens param: adapterChain lives on param binding

This makes it predictable: “adapters belong to the thing that needs coercion.”

⸻

3) Auto-adapter selection algorithm

3.1 Inputs

Given:
	•	from: TypeDesc
	•	to: TypeDesc
	•	context: { edgeKind: 'wire'|'publisher'|'listener'|'lensParam' }

Return:
	•	either { ok: true, chain: AdapterStep[] }
	•	or { ok: false, reason, suggestions: AdapterStep[][] }

3.2 Pathfinding (deterministic)

You maintain a directed graph of adapter edges fromType → toType.

Selection is:
	1.	Enumerate candidate paths from from to to up to max length 2 (hard limit).
	2.	Filter by policy:
	•	For auto insertion, every step must be AUTO.
	3.	Score remaining paths (lowest wins):
	•	total cost (cheap=1, medium=10, heavy=100)
	•	fewer steps preferred
	•	avoid world-crossing unless target requires it
	•	prefer unit-safe (e.g., duration→number is discouraged; number→duration requires unit)
	4.	Break ties deterministically by:
	•	lexicographic adapter id list

Max chain length is 2. If no auto path exists:
	•	If there exists a path with SUGGEST steps but no EXPLICIT/ FORBIDDEN, return as suggestions.
	•	If only explicit paths exist, return explicit suggestions and require confirmation.
	•	If nothing exists, hard error.

3.3 Cache everything

Cache result by key:
edgeKind + '|' + fromKey + '→' + toKey

This must be used by both compiler validation and UI menus.

⸻

4) Insertion rules (when adapters are auto-added)

4.1 Wires
	•	If from assignable to to: connect with empty chain.
	•	Else if auto path exists: connect and store chain on the input endpoint.
	•	Else if suggest path exists: show “Fix type mismatch” prompt; user chooses.
	•	Else: connection denied.

No silent heavy adapters on wires. Ever.

4.2 Bus publishers

When publishing to a bus:
	•	Publishing endpoint’s TypeDesc must match bus TypeDesc or be convertible.
	•	Auto adapters allowed only if they are AUTO and cheap/medium.
	•	Heavy = suggest or explicit (depending on adapter).

Publishers are “shared impact,” so auto-adapting them silently is dangerous.

4.3 Bus listeners

When listening to a bus:
	•	Auto adapters are allowed more liberally than publishers, because it’s private perception.
	•	Still: no silent heavy adapters. Heavy requires explicit confirmation.

4.4 Lens params

Lens params accept only scalar or signal worlds by spec.
So:
	•	If binding tries to supply a field → lens param:
	•	only allowed via explicit Reduce<Field→Signal> adapter (heavy + explicit).
	•	otherwise denied.

⸻

5) Canonical adapter table

This table defines the only adapters that exist. Anything else is a lens (type-preserving) or a block (stateful/identity/render).

I’m using your TypeDesc { world, domain } model.

5.1 World adapters

A) Scalar → Signal (AUTO, cheap)
	•	ConstToSignal
	•	from: scalar:X
	•	to: signal:X
	•	semantics: constant over time
	•	policy: AUTO

B) Signal → Scalar (FORBIDDEN)
	•	There is no such thing without choosing a time sample or reduction.
	•	If you need it, it’s a block (“SampleAtTime”) with explicit time input, not an adapter.

C) Scalar → Field (AUTO, medium)
	•	BroadcastScalarToField
	•	from: scalar:X
	•	to: field:X
	•	meaning: uniform per-element value
	•	policy: AUTO
	•	note: implement lazily (no allocations until sink)

D) Signal → Field (AUTO, medium)
	•	BroadcastSignalToField
	•	from: signal:X
	•	to: field:X
	•	meaning: same signal sampled at time t for every element
	•	policy: AUTO
	•	note: lazy as above

E) Field → Signal (EXPLICIT, heavy)
	•	ReduceFieldToSignal
	•	from: field:X
	•	to: signal:X
	•	requires: reduction mode param (mean/sum/min/max/first/last)
	•	policy: EXPLICIT
	•	UI must show warning (“Per-element reduction”)
	•	deterministic ordering uses element ids.

F) Field → Scalar (FORBIDDEN)

Same reason: you’d need time sampling + reduction; that’s a block.

⸻

5.2 Domain adapters (within same world)

number ↔ unit/duration/time/phase

These are semantically dangerous. Most should NOT be AUTO unless meaning is unambiguous.

1) number → phase (SUGGEST, cheap)
	•	NormalizeToPhase
	•	from: signal:number or scalar:number
	•	to: signal:phase or scalar:phase
	•	meaning: wrap modulo 1
	•	policy: SUGGEST (not auto)
	•	rationale: user must consent to wrap semantics

2) phase → number (AUTO, cheap)
	•	PhaseToNumber
	•	from: phase
	•	to: number
	•	meaning: identity representation (0..1)
	•	policy: AUTO

3) number → duration (SUGGEST, cheap)
	•	NumberToDurationMs
	•	requires unit assumption (ms)
	•	policy: SUGGEST

4) duration → number (AUTO, cheap)
	•	DurationToNumberMs
	•	policy: AUTO

5) time ↔ number (FORBIDDEN as adapter)
Time is topology; do not allow time coercions via adapters. Use explicit blocks.

vec2 ↔ number
	•	vec2→number requires a choice (x, y, length). That is not an adapter.
	•	FORBIDDEN. Must be lens or block.

color ↔ vec2/number
	•	FORBIDDEN as adapter. These are artistic transforms.

⸻

5.3 Semantics/unit adapters

Only allowed when semantics are purely representational.
	•	PointVec2Alias
	•	from: field:vec2 (semantics=point) ↔ field:vec2
	•	policy: AUTO
	•	same for signal.
	•	Unit conversions (ms↔s) could exist but only if you standardize units. If you don’t, do not add them.

⸻

6) “Canonical” means: enforceable by compiler + UI

6.1 Compiler enforcement

At compile time:
	•	Every binding must be either directly compatible or have an adapter chain that resolves compatibility.
	•	Every adapter in a chain must exist in registry.
	•	Chain must be <= 2 steps.
	•	If a chain contains an adapter with policy EXPLICIT, the binding must have userConfirmed: true metadata (stored on that binding). Otherwise compile error:
	•	AdapterRequiresConfirmation

6.2 UI behavior

When user makes a binding:
	•	system tries auto path
	•	if none: show a single-line fix suggestion (one click)
	•	if heavy/explicit: show warning + confirm
	•	if forbidden: refuse, explain.

No silent surprises.

⸻

7) Reserved buses and adapters

Reserved buses are where you must be strict:
	•	Publishing to reserved phaseA:
	•	expected type: signal:phase
	•	allowed adapters: only PhaseToNumber is irrelevant; actually you need the correct type.
	•	If publisher is signal:number, suggest NormalizeToPhase (SUGGEST), never auto.
	•	Listening from reserved pulse (trigger domain recommended):
	•	If pulse is signal:trigger, adapters to number are forbidden; use blocks to turn trigger into envelopes.

This prevents patches that “kinda work” but are semantically garbage.

⸻

The one-sentence law

Auto-adapters are only for unambiguous, cheap world lifting (broadcast/const).
Anything semantic (wrap/normalize/units) is suggested, and anything reductive is explicit.

If you want, the next step after this spec is to define the exact UI surfaces where each policy shows up (silent vs “chip” vs modal), but this message is the complete technical contract for adapter behavior and canon.