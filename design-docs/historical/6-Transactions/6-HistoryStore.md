History Store + Snapshot Policy Spec

This is the long-term design for a persistent revision tree (no truncation ever) that remains:
	•	fast to load
	•	fast to navigate (checkout any revision)
	•	compact enough to persist “forever”
	•	deterministic and replayable
	•	resilient to crashes/corruption
	•	compatible with server-authoritative and multi-client later

I’ll specify:
	1.	Data model (project file format)
	2.	Snapshot policy (when, what, how)
	3.	Load algorithm (fast startup)
	4.	Checkout algorithm (fast time travel)
	5.	Pruning/compaction policy (without deleting history)
	6.	Integrity checks + crash safety
	7.	Scaling considerations

⸻

1) Data model: persistent revision tree

1.1 Project document structure

Persist as a Project that contains:
	•	currentHeadRevId (the checked-out revision)
	•	revisions (nodes of the tree)
	•	snapshots (periodic materialized PatchState blobs)
	•	patchMeta (name, createdAt, etc.)
	•	schemaVersion

Canonical JSON shape

export interface ProjectDocument {
  schemaVersion: string;

  patchMeta: {
    projectId: string;
    name: string;
    createdAtMs: number;
    updatedAtMs: number;
  };

  history: {
    headRevId: string;           // current checkout
    rootRevId: string;           // initial empty patch
    nodes: Record<string, HistoryNode>;
    children: Record<string, string[]>;  // adjacency for fast UI
  };

  snapshots: Record<string, SnapshotRecord>;
  // optional: cached materialization for head to speed open
  cachedHeadState?: PatchStateSnapshot;
}

1.2 HistoryNode (revision node)

Each revision node stores:
	•	revId
	•	parentRevId
	•	txId
	•	label
	•	timestampMs
	•	origin
	•	ops (primitive ops)
	•	inverseOps (primitive ops)
	•	snapshotRef? (if this revision has/uses a snapshot)
	•	stats (optional; counts for quick UI)
	•	hash (optional integrity hash)

export interface HistoryNode {
  revId: string;
  parentRevId?: string;

  txId: string;
  label: string;
  timestampMs: number;
  origin: 'ui' | 'import' | 'migration' | 'system' | 'remote';

  ops: Op[];
  inverseOps: Op[];

  snapshotRef?: string; // snapshotId
  stats?: { blocks: number; buses: number; publishers: number; listeners: number };
  hash?: string; // optional integrity
}

Why store inverseOps?

Because you want:
	•	O(ops) undo
	•	and you also want “checkout parent fast” without recomputing diffs

Even if you don’t use inverse ops for checkout, they’re gold for correctness and speed.

⸻

2) Snapshot Policy

Without snapshots, a long-lived project could require replaying tens of thousands of ops on load. Snapshots are your “index points”.

2.1 What a snapshot contains

A snapshot is a materialized PatchState at a specific revision.

It should include:
	•	normalized tables (blocks, buses, publishers, listeners, wires, composites, layout, time)
	•	precomputed indices (optional; can be recomputed on load)
	•	schemaVersion for patch/doc
	•	optional compression

export interface PatchStateSnapshot {
  snapshotId: string;
  revId: string;
  createdAtMs: number;

  // tables (plain JSON)
  state: {
    blocks: Record<string, Block>;
    buses: Record<string, Bus>;
    publishers: Record<string, Publisher>;
    listeners: Record<string, Listener>;
    wires?: Record<string, Wire>;
    composites?: Record<string, CompositeDefinition>;
    layout?: Record<string, any>;
    time?: any;
  };
}

Indices in snapshot?

Two options:
	•	Store indices: faster load, larger file.
	•	Recompute indices: slightly slower load, smaller file.

Recommendation: don’t persist indices; recompute on snapshot load. Indices are derived data.

2.2 Snapshot frequency (the policy)

You want a hybrid policy:

Always snapshot on:
	•	first revision (root)
	•	major structural changes (macro insertion, composite expansion)
	•	user-defined “milestone” or “bookmark” actions

Periodic snapshot on:
	•	every N revisions along the currently active branch
	•	plus time-based threshold

A good long-term policy is:
	•	snapshot every 50 committed revisions on a branch
	•	and also every 5 minutes if the user is actively editing (to cap replay on crash recovery)

But since you said “performance testing less priority” and want maximal speed:
	•	go more aggressive: every 25 revisions.

Branch-aware snapshots

Because you never truncate and you keep branches forever, you must store snapshots per branch usage:
	•	When a branch becomes active (head moves onto it and new commits happen), schedule periodic snapshots on that branch.
	•	You do not need snapshots for dead branches unless user checks them out.

So you snapshot based on “recently active branches”.

2.3 Snapshot storage format

Because JSON will bloat, but you’re in-browser:
	•	Store ProjectDocument in IndexedDB.
	•	Store snapshots as separate records keyed by snapshotId.
	•	Optionally compress snapshot payload (lz4/lz-string) later, but don’t design against it.

Even in pure JSON, snapshots every 25 revisions are fine for moderate projects if snapshots are stored in IndexedDB rather than one giant JSON file.

⸻

3) Load Algorithm (fast startup)

On load you want:
	•	immediate UI and preview
	•	minimal replay

Step-by-step load
	1.	Load ProjectDocument metadata + history indices (nodes, children, headRevId).
	2.	Try cachedHeadState:
	•	If present and matches headRevId, use it directly (fastest).
	3.	Otherwise:
	•	Find nearest snapshot ancestor of head:
	•	walk parentRevId chain from head until you find snapshotRef
	•	record path of revIds encountered
	4.	Load that snapshot, materialize base PatchState.
	5.	Replay ops from snapshotRev → headRev along the recorded path (reverse it).
	6.	Recompute indices for final state (or maintain indices incrementally during replay).
	7.	Set runtime program by compiling this head state.

Key performance trick

Maintain snapshotDistance metadata per node:
	•	at commit time, record “distance from last snapshot”.
	•	then finding nearest snapshot is fast and does not require full parent walking often.

But you can also just walk parents; it’s usually fine.

⸻

4) Checkout Algorithm (time travel)

Checkout means: set head to some revId, and materialize its PatchState quickly.

4.1 Checkout within same branch near head

If the target is a direct ancestor within, say, 1–10 nodes:
	•	apply inverseOps repeatedly to walk up (fast, no snapshot loads)
	•	OR replay ops down from ancestor (depends on direction)

Given you already have inverseOps, upward navigation is cheap.

4.2 Checkout to a different branch far away

Use snapshot-based materialization:
	•	find nearest snapshot ancestor of target
	•	load snapshot
	•	replay ops down to target

4.3 Cache materializations

Maintain an LRU cache:
	•	revId -> PatchState (materialized)
	•	limited to, e.g., last 5–10 checked-out revisions

This makes history exploration instant.

⸻

5) Compaction without deleting history

You said: persist for life, no truncation. That does not forbid compaction; it forbids deletion.

Here’s what you can safely do:

5.1 Snapshot squashing for old segments

If a segment of a branch has:
	•	many nodes
	•	rarely visited
You can create a new snapshot at a later node and mark earlier snapshots as “cold” (still stored but maybe moved to slower storage).

You never delete nodes, but you reduce replay cost.

5.2 Op normalization within a node (safe)

Inside a single revision node, you can normalize ops:
	•	collapse repeated param updates into one Update
	•	remove add-then-remove within same tx
This does not change history meaning.

This is essentially “compile-time optimization of the command”.

5.3 Optional: packfile concept (later)

If this grows huge, you can pack old snapshots and nodes into a “pack” record. Not needed now, but your structure supports it.

⸻

6) Integrity + crash safety

6.1 Atomic commit protocol

When committing a revision, you must guarantee:
	•	either the revision appears fully
	•	or not at all

IndexedDB strategy

Use a single transaction:
	•	write HistoryNode
	•	update children[parent]
	•	update headRevId
	•	write snapshot if created
	•	update cachedHeadState optionally
Commit the IDB transaction.

If the transaction fails, nothing is written.

If using files/localStorage

Use write-ahead:
	•	write new node under a new key
	•	then update head pointer
	•	then update children
But IndexedDB is the right tool.

6.2 Hashes (optional but recommended)

Store hash on each node:
	•	hash of (parentHash + ops + meta)
This lets you detect corruption quickly.

⸻

7) Scaling and performance considerations

7.1 Maximum size concerns

The biggest growth drivers are:
	•	frequent param drags creating many revisions (gesture buffer prevents this)
	•	macros inserting many blocks repeatedly (ops per node)

Gesture buffer eliminates the worst case.

7.2 Store snapshots as separate blobs

Do not store snapshots inline in history nodes.

7.3 Compiler integration

Compilation should operate on the currently materialized head PatchState.
Avoid compiling via replay each time.

⸻

8) Exact responsibilities by component

HistoryStore

Owns:
	•	ProjectDocument.history
	•	commit, checkout, caching, snapshot creation
	•	persistence (IndexedDB)

PatchStore

Owns:
	•	current in-memory PatchState at head
	•	applyOp(op) to mutate PatchState
	•	indices recomputation/incremental maintenance

TxRunner

Owns:
	•	runTx()
	•	beginGesture/updateGesture/commitGesture/cancelGesture
	•	building ops + inverses
	•	delegating to HistoryStore to commit node
	•	then updating PatchStore’s in-memory state

⸻

This spec gives you a “git-like” version graph that stays fast indefinitely, while keeping your mutation system minimal and purely ops-driven.

If you want the next spec, the natural continuation is the Undo/Redo UI model for a history tree (how redo works when there are multiple child branches, how to present branches, bookmarks, and “milestones” without intimidating people).