Working View Lookup Spec

This is the technical heart of the gesture system (and frankly also of fast compilation, history navigation, and future server-authoritative replay). The goal is:
	•	No full patch cloning
	•	Fast reads from “base + overlay”
	•	Deterministic results
	•	Efficient cascade helpers (removeBlockCascade, bindListener, etc.)
	•	Easy to materialize a full patch snapshot when needed (compile, save, checkpoint)

I’ll give you:
	1.	Canonical data structures
	2.	Read-resolution rules
	3.	Write-resolution rules (how overlay is built)
	4.	Index strategy (the part that matters)
	5.	Materialization strategy (producing a concrete patch)
	6.	Performance + correctness pitfalls and how to avoid them

⸻

1) Canonical state representation

Assume your committed patch document is normalized into tables:
	•	blocks: Map<BlockId, Block>
	•	wires: Map<WireId, Wire>
	•	buses: Map<BusId, Bus>
	•	publishers: Map<PublisherId, Publisher>
	•	listeners: Map<ListenerId, Listener>
	•	composites: Map<CompositeDefId, CompositeDef>
	•	layout: Map<BlockId, {x,y,...}>
	•	time: { timeRootBlockId?: BlockId; timelineHint?: TimelineHint; ... }

Call this:

PatchState

A history node references:
	•	parent revision id
	•	ops + inverse ops
	•	optionally a snapshotRef

The “HEAD” revision resolves to a PatchState.

⸻

2) Working View concept

A working view is:

WorkingView = { base: PatchState, overlay: Overlay }

Where Overlay holds:
	•	a linear op list (for commit)
	•	plus structured per-table changes for fast lookup

Overlay structure (required)

For each table T, overlay maintains three disjoint sets:
	•	added[T]: Map<Id, Entity>
	•	updated[T]: Map<Id, Entity> (stores the full “next” entity, not a patch)
	•	removed[T]: Set<Id>

And for singleton-ish fields:
	•	timeOverride?: { timeRootBlockId?: BlockId; timelineHint?: TimelineHint; ... }
	•	or store them as Update ops on a synthetic time entity, but explicit override is fine.

Invariant: an id cannot be both in added and updated, or removed and anything else. The builder enforces this.

⸻

3) Read-resolution rules (the “truth table”)

To read an entity by id from table T:
	1.	If id ∈ removed[T] → missing
	2.	Else if id ∈ updated[T] → return updated[T][id]
	3.	Else if id ∈ added[T] → return added[T][id]
	4.	Else → return base[T].get(id) (committed)

This gives O(1) reads.

Existence check

has(T, id) follows the same logic.

⸻

4) Write-resolution rules (how ops update overlay)

Your TxBuilder methods mutate overlay and append to ops[]:

add(T, entity)
	•	assert not present in base or overlay
	•	set added[T][id] = entity
	•	append Add(T, entity) to ops

remove(T, id)

Case analysis:
	•	if id ∈ added[T]:
	•	removing something you just added in this gesture cancels it out:
	•	delete added[T][id]
	•	also remove the corresponding Add op or record both ops but consolidate later
	•	(recommended: consolidate immediately so overlay stays minimal)
	•	else if id ∈ updated[T]:
	•	mark removed:
	•	delete updated[T][id]
	•	add removed[T].add(id)
	•	else:
	•	mark removed:
	•	removed[T].add(id)
	•	append Remove(T, id) to ops (unless you’re canceling out an added entity)

update/replace(T, id, next)

Case analysis:
	•	if id ∈ removed[T] → error (can’t update removed)
	•	if id ∈ added[T]:
	•	update the added entity in-place:
	•	added[T][id] = next
	•	append Update(...) or just treat as part of Add (either works, but simplest: allow Update op)
	•	else:
	•	store full next in updated[T][id] = next
	•	append Update op (unless you’re consolidating)

Consolidation during gesture (strongly recommended)

Instead of appending every Update op, for certain patterns you should “overwrite the latest Update” rather than adding a new op. That’s the same consolidation rules from the gesture spec; the overlay makes it easy.

⸻

5) Index strategy (this is the “technically tricky” part)

Your cascade helpers and UI need efficient queries like:
	•	“all wires touching block X”
	•	“all publishers from block X”
	•	“all listeners into port (block X, port Y)”
	•	“all publishers on bus B”
	•	“all listeners on bus B”

You must have indices for both base state and overlay state, and a way to query “combined”.

5.1 Base indices (committed PatchState)

PatchState should carry precomputed indices:
	•	wiresByBlock: Map<BlockId, Set<WireId>>
	•	publishersByBus: Map<BusId, Set<PublisherId>>
	•	publishersByFromBlock: Map<BlockId, Set<PublisherId>>
	•	listenersByBus: Map<BusId, Set<ListenerId>>
	•	listenersByToPort: Map<string /*blockId:portId*/, Set<ListenerId>>

These are maintained when you build PatchState from ops (or when you load a snapshot). They make committed state queries fast.

5.2 Overlay indices (incremental)

Overlay must also maintain its own indices incrementally as changes are added:

For example, when you add a wire in overlay:
	•	overlay.wiresByBlock.add(from.blockId, wireId)
	•	overlay.wiresByBlock.add(to.blockId, wireId)

When you remove a wire:
	•	remove from those maps if present in overlay-added/updated
	•	also track removals so queries can subtract from base

So overlay indices mirror base indices, but also include removal tracking.

Overlay index structure

For each index I, store:
	•	I_added: Map<Key, Set<Id>>
	•	I_removed: Map<Key, Set<Id>>

Example:
	•	listenersByBus_added[busId] and listenersByBus_removed[busId]

This is essential: you can’t just recompute from overlay tables every time.

5.3 Combined query algorithm

To query, e.g., listenersByBus(busId) in WorkingView:
	1.	Start with base set: S = base.listenersByBus.get(busId) || empty
	2.	Subtract overlay removals: S = S \ overlay.listenersByBus_removed[busId]
	3.	Add overlay additions: S = S ∪ overlay.listenersByBus_added[busId]
	4.	Filter out ids that are removed in overlay (as a safety net)

Return as iterable (don’t allocate arrays unless you need to).

This yields efficient cascades.

⸻

6) Materialization strategy (turn WorkingView into a concrete PatchState)

You need materialization for:
	•	commit (create a new revision)
	•	compile
	•	save/export
	•	snapshot checkpoint

Two ways:

6.1 Fast materialization via table merge

To build materialized tables:

For each table T:
	•	start with base map
	•	create a new map (or structural share if you can)
	•	apply overlay removals
	•	apply overlay updates
	•	apply overlay adds

Then rebuild indices for the new PatchState.

This is O(changed + affected-index-keys) rather than O(total-entities), if you do it right.

6.2 Replay-based materialization (for history navigation)

To compute PatchState for arbitrary revId:
	•	start from nearest snapshot
	•	replay ops to build tables and indices

This is separate from gesture; but the same applyOp machinery works.

⸻

7) Correctness hazards + how to prevent them

Hazard A: inconsistent overlay indices

If overlay indices aren’t updated alongside overlay tables, cascades will silently miss things.

Mitigation: overlay write methods must update:
	•	overlay table change
	•	overlay index added/removed sets
as one atomic step.

Hazard B: “remove then add same id” in one gesture

This is common in refactors. Decide policy:
	•	Either forbid id reuse within a Tx (recommended)
	•	Or allow remove+add but treat it as update/replace in net effect

Given you generate ids (UUID), I recommend forbid reuse within a Tx and within history generally.

Hazard C: dangling references

Because applyOp doesn’t validate, a poorly built Tx could create:
	•	a wire referencing a missing block
	•	a listener referencing a missing bus

Mitigation: builder must validate using working view lookups (tx.assert).

Hazard D: overlay grows large during long gestures

Without consolidation, overlay will balloon.

Mitigation: consolidation rules + overlay “overwrite update” behavior.

⸻

8) What the TxBuilder should expose (lookup API)

Your builder should offer both:
	•	entity lookups (tables)
	•	indexed queries

Examples:
	•	tx.view.getBlock(id)
	•	tx.view.getWiresForBlock(blockId)
	•	tx.view.getPublishersForBus(busId)
	•	tx.view.getListenersForPort(blockId, portId)
	•	tx.view.hasBus(busId)

These must run against WorkingView.

⸻

9) Performance notes (to keep things snappy)
	•	Use Map/Set heavily; avoid arrays for live indices.
	•	For keys like (blockId, portId), precompute a stable string key: ${blockId}:${portId}.
	•	Keep materialization off the hot path during drag; compile can use WorkingView directly if compiler accepts it (ideal), otherwise materialize debounced.
	•	When you do materialize, do incremental index rebuilds:
	•	only update index keys affected by overlay ops, not the entire index.

⸻

If you want, the next spec after this is the History Store + snapshot policy: how to persist the full revision tree, how to choose snapshot spacing, and how to load quickly without replaying thousands of ops every time.