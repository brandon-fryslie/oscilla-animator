Gesture Buffer Spec

This is the missing piece that makes “history tree forever” feel usable instead of becoming a million-node nightmare. It also becomes your best “no-jank live edits” mechanism, because it formalizes when changes are committed vs merely previewed.

⸻

1) Goals

A gesture buffer must:
	1.	Coalesce continuous edits (slider drags, block moves, typing) into one committed revision node.
	2.	Allow live preview while the gesture is in progress.
	3.	Keep the history graph meaningful (no micro-nodes).
	4.	Preserve determinism: the committed result must be exactly what the user saw at the end.
	5.	Be robust to cancellation (Esc), focus loss, and tool switching.
	6.	Integrate with compilation in a way that avoids jank.

⸻

2) Core Model

You have two “states”:
	•	Committed State: the patch document at headRevId.
	•	Working State: a temporary overlay produced by applying a set of ops on top of committed state.

A gesture buffer is essentially:

(baseRevId, workingOps[], workingInverseOps[])

Where:
	•	baseRevId is the revision we began the gesture from.
	•	workingOps[] are the ops accumulated during the gesture.
	•	workingInverseOps[] are inverses computed as we go (so commit is fast).

Key choice: overlay, not cloning

Don’t clone the whole patch for gestures. Instead:
	•	maintain a lightweight overlay (ops list + minimal lookup indices)
	•	expose “read from working state” via a lookup that consults overlay first, base second

This keeps performance good.

⸻

3) Lifecycle API

You want a small explicit API on your EditorStore (or HistoryController).

3.1 Begin

beginGesture(spec: GestureSpec): void

GestureSpec includes:
	•	kind: 'param-drag' | 'move' | 'text-edit' | 'paint' | 'scrub' | 'other'
	•	mergeKey: string (stable key identifying what’s being edited)
	•	examples:
	•	param:block-123:radius
	•	move:selection
	•	text:block-77:name
	•	label: string (for final history node, e.g. “Change Radius”, “Move Blocks”)
	•	origin: 'ui' (almost always)
	•	previewPolicy: 'compile-live' | 'compile-debounced' | 'no-compile'
	•	commitPolicy: 'onPointerUp' | 'onBlur' | 'onEnter' | 'manual'
	•	cancelPolicy: 'revert' | 'keepPreviewUntilNextCommit' (recommend revert)

Rules:
	•	If a gesture is already active with the same mergeKey → continue (don’t restart).
	•	If a different gesture is active → auto-commit or auto-cancel based on the active gesture’s policy (I recommend auto-commit for moves/params, auto-cancel for text unless blurred).

3.2 Update

updateGesture(build: (tx: TxBuilder) => void): void

This is where you apply incremental changes while dragging.

Important: updateGesture does not create a history node.

Instead:
	•	it applies ops into the gesture’s working overlay
	•	it emits preview events (optional) and triggers preview compilation depending on previewPolicy

3.3 Commit

commitGesture(): { revId: string }

Creates exactly one history node:
	•	parent = baseRevId
	•	ops = consolidated workingOps
	•	inverseOps = consolidated workingInverseOps
	•	label = spec.label (maybe with final value summary)

Moves head to the new node, clears gesture state.

3.4 Cancel

cancelGesture(): void

Reverts UI/preview back to committed head state:
	•	discard workingOps overlay
	•	return to baseRevId state (which is still head unless you navigated)

3.5 Force Commit / Force Cancel

Useful when:
	•	user triggers a new command while dragging
	•	user switches tools
	•	user navigates history

Provide:
	•	finalizeGesture(mode: 'commit' | 'cancel'): void

⸻

4) How TxBuilder works inside a gesture

Inside a gesture, you still want to use the same primitive mutation API—just directed into the overlay rather than committed state.

So you have:
	•	TxBuilder(target: 'gesture' | 'commit')

When updateGesture runs:
	•	tx.add/remove/update append to workingOps
	•	tx lookups read from a “working view” (base + overlay)

When runTx runs normally:
	•	tx writes to committed ops list and produces a history node immediately.

This reuse is critical—same code paths, fewer bugs.

⸻

5) Consolidation Rules (critical)

You do not want the workingOps list to grow without bound during a long drag. You need consolidation.

5.1 Param drags

For repeated updates to the same (blockId, paramKey):
	•	keep only the first prev and the latest next
	•	represent the final ops list with a single Update (or SetParam) op

This means during updateGesture:
	•	if an Update for that param already exists in the overlay, mutate its next value
	•	do not append a new op

5.2 Block moves

For block moves:
	•	maintain a map of blockId -> {startPos, currentPos}
	•	update currentPos continuously
	•	on commit, emit one SetBlockPosition per block

5.3 Text edits

Text edits are same as param drags:
	•	one “rename” op with first prev and latest next

5.4 Structural edits

Structural changes (add/remove blocks, bindings, etc.) are rarer in gestures, but if you support them (e.g. painting nodes):
	•	allow multiple ops but keep an index to prevent duplicates (don’t add the same entity twice)

⸻

6) Compilation + no-jank integration

This is where preview policy matters.

Preview policies

A) compile-live
	•	recompile on each updateGesture call
	•	only acceptable if compilation is extremely fast or you do incremental compilation

B) compile-debounced (recommended default)
	•	on updates: schedule compile after ~100–200ms of inactivity
	•	during continuous drag: user sees “close enough” preview, not necessarily every tick
	•	always compile immediately on commitGesture

C) no-compile
	•	used for purely editorial changes that shouldn’t touch runtime (e.g. renaming a bus, rearranging layout)
	•	still updates UI, but runtime doesn’t recompile

Program swap strategy during gesture

Even during preview compilation, you should:
	•	keep last good program running until new compile succeeds
	•	then swap immediately (or crossfade, if you have it)

This makes compilation spikes feel graceful.

⸻

7) History tree interactions during gesture

If user navigates history (undo/redo/checkout) during gesture:
	•	you must decide whether to commit or cancel first

Canonical rule:
	•	Cancel gesture on history navigation unless the gesture is explicitly “safe to commit”
	•	moves/params are safe to commit
	•	text edits are usually cancel unless blurred (depends on your UX)

So:
	•	checkoutRev(revId) calls finalizeGesture('cancel') first

This prevents weird baseRevId mismatches.

⸻

8) Persistence

Gestures themselves should not be persisted as history nodes.

But you may want to persist a “dirty draft” for crash recovery. Optional:
	•	Save the working overlay every few seconds while gesture active.
	•	On reload, restore as an uncommitted gesture.

I would only do this if you really want the “never lose anything” promise to include in-progress drags. Most tools don’t.

The “for-life” requirement is satisfied by committed nodes.

⸻

9) Event emissions (clean and minimal)

Inside updateGesture:
	•	no domain events unless you explicitly want them
	•	optional: emit PreviewUpdated or GestureUpdated for UI only (I’d keep these out of the domain event system)

On commitGesture:
	•	emit normal domain events derived from the final ops
	•	emit one TxCommitted meta-event if you want (helpful for analytics/debug)

⸻

10) Recommended default gesture specs
	•	Param slider drag:
	•	previewPolicy: compile-debounced
	•	commitPolicy: onPointerUp
	•	cancelPolicy: revert
	•	Block move drag:
	•	previewPolicy: no-compile (moving blocks shouldn’t recompile)
	•	commitPolicy: onPointerUp
	•	Text edit (rename):
	•	previewPolicy: no-compile
	•	commitPolicy: onBlur + onEnter
	•	cancelPolicy: revert

⸻

11) The “one gesture at a time” rule

Keep it simple:
	•	at most one active gesture globally in the editor
	•	nested gestures are disallowed (they lead to madness)
	•	if a new gesture begins, finalize the old one (commit or cancel per policy)

This is boring but correct.

⸻

If you want the next layer of detail, the natural follow-up is the “Working View” lookup spec (how reads resolve base vs overlay efficiently, including indices for blocks/buses/publishers/listeners), because that’s the only technically tricky part to implement without cloning the full patch.