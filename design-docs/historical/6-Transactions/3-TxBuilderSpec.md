Below is the exact transaction builder contract I recommend for Oscilla, designed for:
	•	history tree (no truncation, ever)
	•	ops-only patch mutation (applyOp)
	•	invertible commands (undo/redo via inverse ops)
	•	high performance (no deep diffing)
	•	no hidden cascades (builder is responsible)
	•	determinism (IDs explicit, ordering stable)
	•	clean integration with compile + events + checkpoints

This is the spec your engineers can implement directly.

⸻

1) Vocabulary and invariants

Transaction (Tx)

A Tx is a single user intent, producing:
	•	ops[] applied to patch state
	•	inverseOps[] precomputed at commit time
	•	events[] emitted at commit time (optional; or events can be derived from ops)
	•	a history node added to the project’s revision tree

Builder

A Builder is the only place where “high-level operations” exist:
	•	insert macro
	•	bind to bus
	•	expand composite
	•	change time root
	•	delete selection

It produces primitive ops only.

applyOp

applyOp(op) is dumb, total, and fast. No graph traversal, no global side effects.

⸻

2) The primitive op set (assumed)

As established:
	•	Add(table, entity)
	•	Remove(table, id, removed?)
	•	Update(table, id, prev, next) (full replace recommended)
	•	SetBlockPosition(blockId, prev, next) (or via Update(block))
	•	SetTimeRoot(prev,next)
	•	SetTimelineHint(prev,next)
	•	Many(ops[])

Transaction builder produces ops[] that are a linear sequence.

⸻

3) Transaction Builder API

3.1 runTx — the only way to mutate patch state

This is the “command wrapper,” but it creates a history node (branching, not truncating).

Signature (conceptual)

runTx(spec: TxSpec, build: (tx: TxBuilder) => void): TxResult

TxSpec
	•	label: string (user-facing, appears in history)
	•	origin: ‘ui’ | ‘import’ | ‘migration’ | ‘system’ | ‘remote’
	•	mergeKey?: string (for coalescing continuous edits—see section 8)
	•	intent?: structured info ({kind:'param-drag', blockId, paramKey} etc.)
	•	branchPolicy: ALWAYS 'fork' (because history is never truncated)

TxResult
	•	revId created
	•	headRevId after commit
	•	opsCount
	•	eventsEmitted count
	•	compileScheduled: boolean (if you trigger compile automatically)

⸻

3.2 TxBuilder — what feature code receives

The builder must provide:

A) Read-only access to current state (at head revision)
	•	tx.state: Readonly view of patch document at current head

B) A stable “lookup API” (important)
	•	tx.getBlock(blockId)
	•	tx.getBus(busId)
	•	tx.getPublishersForBus(busId)
	•	tx.getListenersForPort(blockId, portId)
	•	etc.

These lookups are used to compute cascades and inverses.

C) Primitive op emitters (low-level)
	•	tx.add(table, entity)
	•	tx.remove(table, id)
	•	tx.update(table, id, nextEntity) OR tx.replace(table,id,next,prev?)
	•	tx.setBlockPosition(blockId, nextPos)
	•	tx.setTimeRoot(nextBlockId)
	•	tx.setTimelineHint(nextHint)
	•	tx.many(fn) (scoped grouping)

D) High-level safe helpers (optional but strongly recommended)

These are helpers that still only emit primitive ops:
	•	tx.removeBlockCascade(blockId, opts?)
	•	tx.bindListener(toPort, busId, chain) (handles replacing existing binding)
	•	tx.unbindListener(toPort) (removes any listener(s) to that port)
	•	tx.removeBusCascade(busId) (removes bus + pubs + listeners)
	•	tx.insertMacro(macroId, atPos, options) (expands macro then emits ops)

If you’re strict, you can keep helpers in separate modules that take TxBuilder—but they’re still part of the contract.

E) Event intent recording (optional)

Two patterns exist:
	1.	derive events from ops after commit (pure)
	2.	allow builder to “declare” domain events (still emitted after commit)

I recommend derive from ops, except for high-level semantic events like MacroInserted which are helpful.

So builder has:
	•	tx.note(eventPrototype) — notes an event to emit at commit with correct meta injected.

This keeps “event spamming” down.

F) Validation / failure
	•	tx.assert(condition, diag) to abort with a typed diagnostic
	•	tx.fail(diag) to abort immediately

No partial commits.

⸻

4) The contract for “removed payload” and inverse ops

Golden rule

All inverses are computed at commit time, not at undo time.

That means:
	•	tx.remove(table,id) must capture the removed entity payload in the Tx’s inverse ops.
	•	tx.update(...) must capture prev and next.

Therefore: the builder must run against a known “before state” snapshot and compute inverses immediately.

Result

Undo is just:
	•	apply inverseOps in reverse order
	•	move head pointer to parent node (or record head movement separately; see section 7)

⸻

5) Cascading delete policy (no hidden cascades)

This is one of the most important “nails in the coffin” to keep behavior predictable.

Principle

applyOp never does cascades.
A transaction builder helper must explicitly emit all deletions needed to preserve integrity.

Required helpers

You should standardize these:

removeBlockCascade(blockId)
Emits:
	•	Remove all wires whose endpoints include the block
	•	Remove all publishers whose from.blockId === blockId
	•	Remove all listeners whose to.blockId === blockId
	•	Remove the block itself
	•	Remove layout entries for the block (position, grouping)
	•	Clear time root if it references the block (or set to null) — explicit op

removeBusCascade(busId)
Emits:
	•	Remove all publishers on that bus
	•	Remove all listeners on that bus
	•	Remove the bus

unbindPort(blockId, portId)
Emits:
	•	Remove all listeners targeting that input port (often 0/1, but allow many if you ever support layering)

These helpers ensure undo restores the world perfectly.

⸻

6) Branching behavior (history tree semantics)

Because you don’t truncate history:

On commit

Let:
	•	H = current head revision
	•	P = patch state at H
	•	Apply ops to produce P'
	•	Create new revision node N with parent = H

If the user had undone to a prior node, you simply create a new child. Redo options remain as other children.

Head movement is not a revision

Undo/redo is navigation, not mutation. You should treat head movement as:
	•	either an in-memory pointer (persisted as project.headRevId)
	•	or a lightweight event HeadMoved { fromRev, toRev } (optional)

But do not create new revision nodes for undo/redo navigation.

⸻

7) How compilation fits in (no-jank + determinism)

Rule

Compilation triggers from committed revision changes, not from individual ops.

So:
	•	after a tx commit creates revision N, emit CompileStarted and compile P'.
	•	if compile succeeds: swap program according to your no-jank strategy.
	•	undo/redo is just head move → compile that revision’s patch state → swap.

This works perfectly with a history tree: selecting any past revision is just “checkout + compile”.

⸻

8) Coalescing continuous edits without rewriting history

Since you want a persistent history tree “for life,” you must decide what coalescing means.

Two correct models:

Model A (recommended): “Squash during active gesture only”

While the user is dragging:
	•	you create one revision node at the end of the gesture
	•	during the gesture you keep edits as ephemeral working state (not committed history)

This is ideal for sliders, drags, typing.

Implementation:
	•	beginGesture(mergeKey) → start an ephemeral buffer
	•	updateGesture(...) → mutate a working copy (or apply ops but not committed)
	•	commitGesture() → produce ONE tx node with the net ops

This avoids polluting history while still preserving “everything” meaningful.

Model B: “Micro-commits + label grouping”

Every small change is its own node, but UI groups them.
This satisfies “persist everything,” but history becomes enormous.

I strongly recommend Model A because it keeps “for life” history meaningful.

Transaction spec support

TxSpec.mergeKey is still useful, but the correct use is:
	•	“this is a gesture; do not commit per-tick”
	•	not “merge by overwriting a previous node” (because you said: never truncate)

So: mergeKey identifies a gesture buffer, not a history rewrite.

⸻

9) Exact semantics of TxBuilder operations

Here are the exact rules each primitive builder method must obey.

tx.add(table, entity)
	•	Preconditions:
	•	entity.id must not exist in that table in the current pre-state (or current working state)
	•	Emits:
	•	Add(table, entity)
	•	Records inverse:
	•	Remove(table, entity.id, removed=entity)

tx.remove(table, id)
	•	Preconditions:
	•	id must exist
	•	Looks up the entity in the working state
	•	Emits:
	•	Remove(table, id)
	•	Records inverse:
	•	Add(table, removedEntity)

tx.replace(table, id, nextEntity)

(Full entity replace; recommended)
	•	Preconditions:
	•	id exists
	•	nextEntity.id === id
	•	Captures prevEntity
	•	Emits:
	•	Update(table, id, prev=prevEntity, next=nextEntity)
	•	Records inverse:
	•	Update(table, id, prev=nextEntity, next=prevEntity)

tx.setTimeRoot(nextBlockId | undefined)
	•	Captures prev
	•	Emits:
	•	SetTimeRoot(prev, next)
	•	Inverse:
	•	SetTimeRoot(next, prev)

tx.many(fn)
	•	Runs nested ops collection
	•	Flattens them into parent ops list (you can keep nesting as Many, but flatten is faster)
	•	Inverses are recorded in correct reverse order automatically

⸻

10) A canonical “feature helper” contract

Feature helpers should be pure builders:

function insertMacro(tx: TxBuilder, spec: InsertMacroSpec): void
function bindBus(tx: TxBuilder, spec: BindBusSpec): void
function expandComposite(tx: TxBuilder, spec: ExpandCompositeSpec): void
function setTimeTopology(tx: TxBuilder, spec: SetTimeSpec): void

They:
	•	only call tx primitive methods
	•	may call tx.assert / tx.fail
	•	may call tx.note(…) for semantic events

They do not directly touch stores.

⸻

11) What you persist

Persist all of:
	•	history.nodes (revId → { parentRevId, ops[], inverseOps[], label, timestamp, meta })
	•	history.headRevId
	•	snapshots occasionally (optional but recommended)
	•	reservedIds / UUID generator seed if you want deterministic ids offline (usually unnecessary if you just use UUIDv4)

This supports:
	•	infinite exploration
	•	branching
	•	“time travel”
	•	future collaboration
	•	server-authoritative replay

⸻

The final deliverable summary

You will implement:
	1.	applyOp(op) on normalized patch tables
	2.	runTx(spec, build) that:
	•	produces ops + inverse ops
	•	commits a new revision node as a child of current head
	•	moves head to the new node
	•	emits events (derived and/or noted)
	•	triggers compilation
	3.	a gesture buffer system for coalescing continuous edits without rewriting history
	4.	cascade helpers (removeBlockCascade, removeBusCascade, bindListener…)

⸻

If you want, next I can give you the exact “gesture buffer” spec (begin/update/commit/cancel) and how it integrates with MobX so the UI stays responsive while you’re dragging, but history remains clean and meaningful.