Yes, I can do that — and the “keep the history tree forever” requirement is a big (but very coherent) design shift. It turns your undo stack into a persistent version graph (think: git-lite for patches). That’s compatible with your deterministic/pure philosophy, and it’s excellent for creative exploration.

I’ll do two things:
	1.	Lock the history-tree model (so the mutation API fits it)
	2.	Give you the exact primitive mutation API: a small applyOp(op) set that can express everything and is inherently invertible, checkpointable, and replayable.

⸻

0) History tree model (non-truncating undo)

Core rule
	•	Undo moves the “HEAD” pointer to the parent revision.
	•	New edits create a new child branch from that revision.
	•	No existing nodes are deleted.
	•	The entire DAG/tree is persisted for the project lifetime.

In practice you likely want a tree (each node has exactly one parent) rather than a general DAG (merges), unless you later want explicit merge operations.

Revision node

Each committed transaction produces a node:
	•	revId (UUID)
	•	parentRevId (or null for root)
	•	txId
	•	label (“Insert Macro: Breathing Dots”)
	•	timestamp
	•	ops[] (the primitive operations)
	•	inverseOps[] (optional to store; can be derived if ops are invertible)
	•	snapshotRef? (optional periodic state snapshot)
	•	meta (origin, user, etc.)

Undo/redo becomes navigation:
	•	undo: head = parent(head)
	•	redo: pick one of children(head) (requires UI choice if multiple)

This is the foundation for “automatic checkpoints” too: every node is a checkpoint.

⸻

1) The primitive mutation API: design constraints

Your applyOp(op) set must be:
	1.	Small (ideally < 20 ops)
	2.	Total (everything is expressible)
	3.	Invertible (every op has a canonical inverse)
	4.	Order-stable (replay yields identical results)
	5.	ID-stable (all entities have persistent ids: blockId, busId, publisherId, listenerId, compositeDefId, etc.)
	6.	Side-effect-free at the domain layer
	•	no compilation inside applyOp
	•	no console clearing
	•	no UI selection changes
Those happen via events reacting to committed transactions.

⸻

2) Canonical state shape these ops target

Assume the patch state includes (simplified):
	•	blocks: Map<BlockId, Block>
	•	wires: Map<WireId, Wire> (optional if you keep wires)
	•	buses: Map<BusId, Bus>
	•	publishers: Map<PublisherId, Publisher>
	•	listeners: Map<ListenerId, Listener>
	•	composites: Map<CompositeDefId, CompositeDefinition>
	•	time: { timeRootBlockId?: BlockId; timelineHint?: TimelineHint; ... }
	•	uiLayout: { blockPositions: Map<BlockId, {x,y}>; groups... } (optional but recommended to keep layout undoable)
	•	plus whatever else you consider part of the patch document

The key is: everything user-visible and project-relevant is inside the document state, not in ephemeral UI state.

⸻

3) The exact Op union (primitive mutation API)

This is the “small set of applyOp operations” you asked for. This is the spec.

3.1 Generic helpers used by many ops
	•	Entities must be referenced by id.
	•	For any op that destroys information, the op must include the data required to restore it or the inverse must be computed at commit time and stored.

I strongly recommend storing inverses at commit time for performance and simplicity.

⸻

A) Core entity CRUD ops (Add/Remove/Update)

A1) AddEntity

Adds a fully-specified entity to its collection.
	•	Used for: blocks, buses, publishers, listeners, composite defs, wires
	•	Inverse: RemoveEntity with same id and same entity payload

Op shape
	•	{ kind: 'Add'; table: Table; entity: Entity }

Where Table ∈ 'blocks'|'wires'|'buses'|'publishers'|'listeners'|'composites'

A2) RemoveEntity

Removes an entity by id and includes the removed payload (or inverse stores it).

Op shape
	•	{ kind: 'Remove'; table: Table; id: string; removed?: Entity }

Inverse: AddEntity with the removed payload.

A3) UpdateEntity

A patch/replace operation on an entity.

Op shape
	•	{ kind: 'Update'; table: Table; id: string; prev: Partial<Entity>; next: Partial<Entity> }

Inverse: swap prev/next.

NOTE: avoid “deep patch merge semantics” ambiguity. Define UpdateEntity as either:
	•	replace these keys only (shallow), or
	•	replace entire entity (full replace).

I recommend full replace for correctness unless entities are huge.

⸻

B) Relationship ops (because implicit deletes are the undo killer)

If you keep everything in normalized tables, relationship integrity becomes a policy:
	•	wires reference port endpoints
	•	publishers reference busId + from port ref
	•	listeners reference busId + to port ref

You can represent these as entities themselves (Publisher/Listener/Wire), which means Add/Remove already covers them.

So: no special relationship ops needed if you do it right.

Instead: implement validation and cascading as part of transaction building, not applyOp.

Example:
	•	Removing a block should also include Remove ops for any wires/publishers/listeners that reference it, all inside the same transaction.

That’s essential for invertibility and deterministic replay.

⸻

C) Layout ops (don’t cheat—make layout part of the doc)

C1) SetBlockPosition

You can model position as part of the Block entity, but I usually keep layout separate.

Op shape
	•	{ kind: 'SetBlockPosition'; blockId: BlockId; prev: {x:number;y:number}; next: {x:number;y:number} }

Inverse: swap.

C2) SetViewport / UI layout (optional)

If you want “return to where I was”, you can also track viewport pan/zoom, bus board layout, etc. Same pattern.

⸻

D) Time system ops (must be explicit)

D1) SetTimeRoot

Op shape
	•	{ kind: 'SetTimeRoot'; prev?: BlockId; next?: BlockId }

Inverse: swap.

D2) SetTimelineHint

(If stored in patch document rather than purely derived)

Op shape
	•	{ kind: 'SetTimelineHint'; prev: TimelineHint; next: TimelineHint }

⸻

E) Batch / structural ops (to keep transactions compact)

These are optional but extremely useful.

E1) ApplyMany

A transaction is already “many ops”, but sometimes you want an op that is itself a bundle (for storage compression or atomicity across subsystems).

Op shape
	•	{ kind: 'Many'; ops: Op[] }

Inverse: Many with inverses in reverse order.

E2) ReplaceSubgraph (optional)

This is a convenience op for macro insertion / composite expansion if you want them stored compactly. But it can be expressed as Many(Add/Remove/Update/SetPos), so it’s not required.

If you include it, define it purely as sugar that expands to primitive ops before apply.

⸻

4) The minimal Op set (final list)

If I’m ruthless about “small set”, this is the final list you need:
	1.	Add(table, entity)
	2.	Remove(table, id, removed?)
	3.	Update(table, id, prev, next)  (or full replace)
	4.	SetBlockPosition(blockId, prev, next) (optional if position is part of block)
	5.	SetTimeRoot(prev, next)
	6.	SetTimelineHint(prev, next) (only if stored)
	7.	Many(ops[])

That’s it.

Everything else—macro insertion, bus binding, composite edits, time topology changes—is a transaction builder that emits a Many([...]) of the above.

⸻

5) How features decompose into ops (the “proof”)

Macro insertion

Transaction builder computes the expansion, then outputs:
	•	Add blocks
	•	Add wires (if still used)
	•	Add publishers/listeners
	•	Set positions
	•	(optional) Update selection state, but I recommend selection is UI-only, not document

Undo is automatic: inverse ops remove everything.

Bus binding UI (subscribe)

To “bind radius to phaseA with an adapter chain”:
	•	AddListener(listener entity with chain)
OR UpdateListenerChain if listener exists

Also, if the UI wants “disconnect from previous bus first”:
	•	Remove old listener(s) referencing that input port

All explicit. No hidden logic.

Composite definition edit

Editing a composite definition is:
	•	Update(composites, defId, prevDef, nextDef)

or if you store composite internals in normalized tables:
	•	Many([…])

But for sanity: store composite defs as whole documents and do full replace.

Time topology change

Switching TimeRoot is:
	•	SetTimeRoot(prev, next)
	•	Possibly Update bus defaults or reserved bus bindings (if your spec requires it)
	•	Possibly Update player timeline hint (if stored) via SetTimelineHint

Everything becomes explicit and undoable.

⸻

6) The “nails in the coffin” rules (to eliminate risk)

To make this system robust and not gnarly:

Rule 1 — applyOp is dumb and total
	•	It does no validation that requires graph traversal.
	•	It just applies to normalized tables.
	•	Validation happens before commit (in the transaction builder) and after commit (diagnostics/compile).

Rule 2 — Every transaction must be self-contained

If you remove a block, you must also remove:
	•	wires pointing to/from it
	•	publishers/listeners referencing its ports
in the same transaction.

No cascades inside applyOp.

Rule 3 — Inverses are stored at commit time

Compute inverse ops while you still have access to “before” state.
Store them in the history node.
Then undo is O(number of ops) with no lookups.

Rule 4 — IDs are never reused

Even across history, across deletes, across branches.

⸻

7) Persistence format for the history tree

Persist as:
	•	project.json includes:
	•	history: { nodes: Record<revId, HistoryNode>, head: revId, roots: revId[] }
	•	snapshots: Record<snapshotId, PatchStateSnapshot> (optional)
	•	currentPatchState may be derived by replay from snapshot+ops, or stored redundantly for fast load

Practical strategy:
	•	store full current patch state for quick open
	•	also store history nodes for replay/branching
	•	periodically store snapshots for fast branch switching

⸻

If you say “next”, I’ll give you the exact transaction builder contract (the API that feature code uses to produce these ops safely), including:
	•	how to auto-cascade deletes (block removal collects related publishers/listeners/wires)
	•	how to do merge/coalescing for slider drags in a history tree world (where “merging” creates a new node vs mutating a node)
	•	how to present redo in a branched history (UI + selection of child branch)