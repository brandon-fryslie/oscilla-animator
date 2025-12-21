Yes. Based on what you’ve shared about the repo, there are several other “same-class” issues: places where you currently have two truths, implicit semantics, or UI/runtime responsibilities bleeding into each other. These are the ones most likely to bite you hard as you move to multi-UI + buses + looping.

1) Two independent loop/time systems

You already identified this, but it’s worth naming as a structural divergence like the type split:
	•	Player has LoopMode + maxTime + wrapping behavior.
	•	Patch can contain looping clocks (PhaseClock) that loop internally.
	•	TimelineHint/TimeModel exists but isn’t the single authority.

If you don’t unify this, different UIs will “explain time” differently and patches will behave unpredictably when shared/exported.

Fix shape: single authoritative patch-level time topology (TimeRoot → TimeModel) and player is a dumb transport that obeys it.

2) Layout data is currently semantic (lanes) rather than a projection

Right now:
	•	“Where blocks live” is part of the patch (lanes.blockIds[])
	•	so changing layout is effectively changing patch meaning (or at least patch identity).

That prevents multi-UI cleanly because each UI wants a different layout/representation. Also it complicates undo/redo and diffing: moving a block shouldn’t look like a semantic edit.

Fix shape: patch semantics store blocks + relationships; layouts are stored separately as view projections (or as multiple named layouts).

3) Invariants enforced only at compile time, not at edit time

Examples from your report:
	•	multiple writers per input slot are allowed in UI but rejected in compiler
	•	type mismatch allowed in UI but rejected in compiler
	•	cycles allowed in UI but rejected in compiler

This causes two problems:
	•	UX: users build a patch that “looks connected” but doesn’t run
	•	multi-UI: one UI might prevent invalid states, another might allow them → inconsistent behavior

Fix shape: one shared validation layer (same as type unification), used by:
	•	connection/binding UI (prevent or warn)
	•	compiler (hard error)
	•	diagnostics UI (explain)

4) Macro expansion is destructive and patch-level, but composites are semantic

You currently have:
	•	Macros expand at add time and can “clear patch and create blocks/connections/bus routing.”
	•	Composites are compiled “as single blocks” (opaque) and/or expanded during compilation depending on the path.

This creates the same style of split you hit with bus listeners:
	•	UI-level structure differs from compile-time structure
	•	references drift (IDs/ports)

Fix shape: pick one representation contract:
	•	either composites are always semantic (opaque) and compilation respects boundaries with stable port mapping, or
	•	composites are always expanded into primitives before any reference resolution, and IDs are stable/mapped.

Mixing approaches will repeatedly break buses, adapters, diagnostics, and undo.

5) Bus combine semantics partly in UI/store and partly in compiler

From your report:
	•	Bus ordering is via sortKey and sorting happens in BusStore query.
	•	Combine mode is a bus property.
	•	Compiler combines at compile/eval time.

Risk: if UI/store sorts one way and compiler sorts another (or filters disabled publishers differently), you get non-determinism that is invisible to users.

Fix shape: ordering and enabled/disabled rules must live in one “bus semantics” module that both UI queries and compiler use.

6) Port identity ambiguity (slotId vs port name) and composite/macro remapping

Even beyond types:
	•	anything referencing ports (connections, publishers/listeners, diagnostics) depends on stable identity.
	•	composite expansion creates internal IDs like block-123::render (as you described earlier in the thread).
	•	listeners referencing the old block break.

This is not just a “composites” issue; it affects:
	•	diagnostics “where”
	•	inspector port highlighting
	•	“jump to source” from errors
	•	future multi-client/server authority

Fix shape: canonical PortKey as the only addressing scheme end-to-end, plus explicit port mapping tables when expansion/encapsulation occurs.

7) “Settings” is a grab bag with unclear authority boundaries

Your patch has settings: { seed, speed, finiteLoopMode?, ... }.
But:
	•	seed is both “patch determinism” and a runtime concern
	•	speed is transport
	•	finiteLoopMode sounds like player/time topology

If settings aren’t partitioned, multi-UI becomes messy (“which UI owns speed?”) and server-authoritative design becomes harder.

Fix shape: split:
	•	patch semantic params (determinism, authored defaults)
	•	runtime session params (transport speed, play/pause)
	•	view params (UI toggles)

8) Persistence is missing, which will hide architectural mistakes until later

Right now patches appear ephemeral. That means:
	•	you can accidentally rely on incidental in-memory ordering (array order)
	•	you won’t feel the pain of migrations/versioning yet
	•	UI state may leak into patch state because “it works”

Multi-UI + history tree + server authority all demand robust serialization discipline.

Fix shape: define early what is:
	•	persisted document state
	•	persisted history tree
	•	persisted layouts (maybe)
	•	ephemeral session state

9) Compiler is always full compile; no incremental boundary is defined

Not fatal, but it becomes an architectural issue once you have:
	•	time-sliced inspection
	•	live bus meters
	•	multi-UI views updating frequently

Without a clear “compile vs evaluate vs inspect” boundary, UIs will accidentally trigger expensive work or duplicate evaluation.

Fix shape: explicit layers:
	•	compile doc → program factory + metadata
	•	evaluate program at time t → render tree + optional debug taps
	•	UIs subscribe to debug taps rather than re-evaluating.

⸻

If I had to rank “fix next after type unification”
	1.	Port identity + expansion contract (prevents endless composite/macro/bus bugs)
	2.	Time authority unification (player vs patch time)
	3.	Layout as projection, not semantics (required for multi-UI)
	4.	Shared validation layer (prevents UI/compile drift)
	5.	Bus semantics module (determinism + explainability)

If you want, pick one of these and I’ll turn it into a concrete end-state spec (types, module boundaries, invariants, and migration steps).