Below is the canonical “exact ops set” that makes your whole editor coherent long-term. This is the smallest set I know that still supports everything you’ve named (macros, buses, composites, time roots, multi-UI, undo/redo with history tree, no-jank edits). I’ll also explain the key invariants and how higher-level features compile down into these ops.

⸻

0) Ground rules for the Op system

R0. Ops mutate PatchDocument only

No UI layout, no transient selection, no runtime state. Those are separate stores.

R1. Every op is:
	•	purely structural
	•	fully serializable
	•	invertible
	•	validated by the kernel (preflight + post-apply delta validation)

R2. No “truncate history”

Undo/redo is a history tree over ops. Branches persist forever (project lifetime).

R3. “Complex user actions” are Transactions

A transaction is an ordered list of ops with:
	•	atomic apply
	•	atomic invert
	•	stable id mapping
	•	single “commit” event + diff summary

⸻

1) Canonical entities and addressing

Ops must refer to objects by stable IDs:
	•	blockId, slotId
	•	connectionId
	•	busId, publisherId, listenerId
	•	compositeDefId
	•	(later) assetId, sceneId, etc.

Never refer by array index. Never refer by “name”.

⸻

2) The exact Op set (core)

A) Blocks

1. BlockAdd

Creates a new block instance.

type BlockAdd = {
  op: 'BlockAdd'
  block: Block // includes id, type, label, params; slots implied by registry
}

Notes
	•	slots are defined by registry; block stores only params/label/type/id
	•	if you currently store slots on the block, keep it for now, but long-term: treat slots as registry-derived and store only slotIds that are stable per block type (or generate them deterministically).

2. BlockRemove

Removes a block and all dependent edges/bindings referencing it (or you do that via explicit cascade ops—see “Cascade policy” below).

type BlockRemove = {
  op: 'BlockRemove'
  blockId: BlockId
}

3. BlockRetype

Change a block’s type (preserving id). Think “swap oscillator shape” or “swap renderer.”

type BlockRetype = {
  op: 'BlockRetype'
  blockId: BlockId
  nextType: BlockType
  // optional: param remap strategy id
  remap?: { kind: 'byKey' | 'schema'; schemaId?: string }
}

4. BlockSetLabel

type BlockSetLabel = { op:'BlockSetLabel'; blockId: BlockId; label: string }

5. BlockPatchParams

Patch-style param update.

type BlockPatchParams = {
  op: 'BlockPatchParams'
  blockId: BlockId
  patch: Record<string, unknown>
}

That’s it for blocks.

⸻

B) Wires (if you keep them at all)

Even if buses dominate, keeping wires as an internal representation can still be useful. If you ultimately remove wires, these ops disappear cleanly.

6. WireAdd

type WireAdd = {
  op: 'WireAdd'
  connection: Connection // includes id, from {blockId, slotId}, to {blockId, slotId}
}

7. WireRemove

type WireRemove = { op:'WireRemove'; connectionId: string }

8. WireRetarget

For “move this input to another source” without churn.

type WireRetarget = {
  op:'WireRetarget'
  connectionId: string
  next: { from?: Endpoint; to?: Endpoint }
}

(You can implement WireRetarget as WireRemove + WireAdd, but having it as an op improves diffs and no-jank semantics.)

⸻

C) Buses

9. BusAdd

type BusAdd = {
  op:'BusAdd'
  bus: Bus // id, name, type, combineMode, defaultValue, sortKey, origin?
}

10. BusRemove

type BusRemove = { op:'BusRemove'; busId: string }

11. BusUpdate

type BusUpdate = {
  op:'BusUpdate'
  busId: string
  patch: Partial<Pick<Bus,'name'|'combineMode'|'defaultValue'|'sortKey'>>
}


⸻

D) Publishers / Listeners (Bindings)

12. PublisherAdd

type PublisherAdd = {
  op:'PublisherAdd'
  publisher: Publisher // id, busId, from{blockId,port/slotId}, enabled, sortKey, adapterChain?
}

13. PublisherRemove

type PublisherRemove = { op:'PublisherRemove'; publisherId: string }

14. PublisherUpdate

type PublisherUpdate = {
  op:'PublisherUpdate'
  publisherId: string
  patch: Partial<Pick<Publisher,'enabled'|'sortKey'|'adapterChain'>>
}

15. ListenerAdd

type ListenerAdd = {
  op:'ListenerAdd'
  listener: Listener // id, busId, to{blockId,slotId}, enabled, adapterChain?, lensStack?
}

16. ListenerRemove

type ListenerRemove = { op:'ListenerRemove'; listenerId: string }

17. ListenerUpdate

type ListenerUpdate = {
  op:'ListenerUpdate'
  listenerId: string
  patch: Partial<Pick<Listener,'enabled'|'adapterChain'|'lensStack'|'lens'>>
}

That’s the complete bus mutation surface.

⸻

E) Composites (definitions)

You want composites to be editable and referenced by instances.

18. CompositeDefAdd

type CompositeDefAdd = {
  op:'CompositeDefAdd'
  def: CompositeDefinition // id, label, graph nodes/edges, exposed ports mapping, metadata
}

19. CompositeDefRemove

type CompositeDefRemove = { op:'CompositeDefRemove'; defId: string }

20. CompositeDefUpdate

Patch update for metadata and/or graph edits (you’ll probably want more granular ops later, but keep the primitive surface minimal).

type CompositeDefUpdate = {
  op:'CompositeDefUpdate'
  defId: string
  patch: Partial<CompositeDefinition>
}

21. CompositeDefReplaceGraph

This is the “big hammer” for inline editor save.

type CompositeDefReplaceGraph = {
  op:'CompositeDefReplaceGraph'
  defId: string
  nextGraph: { nodes: Block[]; edges: Connection[]; publishers?: Publisher[]; listeners?: Listener[] }
  nextExposed: { inputs: ExposedPort[]; outputs: ExposedPort[] }
}

(You can do all composite editing as “replace graph” transactions internally; it’s consistent and invertible.)

⸻

F) Time topology (TimeRoot contract)

TimeRoot must be explicit patch state, not inferred.

22. TimeRootSet

type TimeRootSet = {
  op:'TimeRootSet'
  blockId: BlockId // block that is the time root
}

23. PatchSettingsUpdate

For seed/speed/etc that are semantic.

type PatchSettingsUpdate = {
  op:'PatchSettingsUpdate'
  patch: Partial<Patch['settings']>
}

(If you want time mode to live on TimeRoot params instead of Patch settings, then BlockPatchParams covers it.)

⸻

G) Assets / Sources (optional but inevitable)

Since “what do I animate?” matters, your patch will have source assets.

24. AssetAdd

type AssetAdd = { op:'AssetAdd'; asset: { id:string; kind:'svgPath'|'svgDoc'|'text'|...; data:any; meta:any } }

25. AssetRemove

type AssetRemove = { op:'AssetRemove'; assetId: string }

26. AssetUpdate

type AssetUpdate = { op:'AssetUpdate'; assetId: string; patch: Partial<...> }

If you don’t have assets yet, skip these now, but architecturally they belong in the same op stream because they are patch semantics.

⸻

3) That’s the set. What’s deliberately not an Op?

Not ops:
	•	selection changes
	•	viewport pan/zoom
	•	UI layout state (table view columns, graph focus)
	•	compilation results / errors
	•	runtime performance stats
	•	“auto-arrange”, “zoom to fit”

Those are view state. They can have their own history if you want, but they must not pollute patch history.

⸻

4) Cascade policy: explicit vs implicit removal

You have two approaches:

Approach 1 (recommended): Kernel computes cascades

Example: BlockRemove implies removing:
	•	wires connected to that block
	•	publishers/listeners referencing that block
	•	maybe orphaned buses depending on policy (usually no)

This keeps the op surface small.

To preserve invertibility, the transaction builder records the implied removals as explicit ops internally (or stores a “removed snapshot” inside the op for inversion). I recommend explicit internal expansion:
	•	user issues BlockRemove(blockId)
	•	kernel expands to:
	•	WireRemove(...) for each incident wire
	•	PublisherRemove(...) ListenerRemove(...)
	•	then BlockRemove(...)
	•	transaction becomes fully invertible without hidden state.

So: the public API is small, the stored history is explicit.

⸻

5) How every high-level feature becomes a Transaction

Here are the “big” features you care about, shown as compositions of ops.

Macro insertion
	•	BlockRemove / clear patch (or multiple removes)
	•	BlockAdd*
	•	WireAdd*
	•	BusAdd* (if macro includes buses)
	•	PublisherAdd* / ListenerAdd*
	•	TimeRootSet (if macro defines it)
	•	optional PatchSettingsUpdate

Replace selection with composite
	•	CompositeDefAdd (new definition)
	•	BlockAdd (composite instance block type composite:<id>)
	•	WireAdd / PublisherAdd / ListenerAdd rewired to the composite external ports
	•	remove original internal blocks: BlockRemove* (expanded cascades)

Expand composite instance
	•	add internal blocks: BlockAdd*
	•	add internal relationships: WireAdd* / PublisherAdd* / ListenerAdd*
	•	remove composite instance: BlockRemove
	•	reattach externals

Bus binding from an input port
	•	if bus doesn’t exist: BusAdd
	•	ListenerAdd (to that port)
	•	possibly WireRemove if you disallow simultaneous wire + listener to same input (policy decision, but kernel enforces)

Bus publish from an output port
	•	PublisherAdd
	•	possibly WireRemove if the output was wired and you want “output can publish or wire” rules (policy)

TimeRoot topology change
	•	TimeRootSet
	•	BlockPatchParams on TimeRoot
	•	BusUpdate + binding adjustments if canonical buses are linked to time outputs
	•	plus no-jank runtime swap handled outside ops (but driven by the same commit)

⸻

6) Compile-time enforcement you get “for free” with this Op set

Because every mutation passes through the kernel, you can enforce invariants centrally:
	•	one writer per input (if wires exist)
	•	“input may have wire OR listener OR implicit default, but never multiple” (your choice)
	•	adapter chain validity and normalization
	•	deterministic sort order (sortKey + stable tiebreakers)
	•	timeRoot uniqueness
	•	disallow illegal cycles at the semantic graph layer

And since transactions are atomic, you can allow temporary invalid intermediate states inside the transaction builder, but the final commit must be valid.

That’s how you support “swap block” operations that briefly disconnect then reconnect without flicker or errors.

⸻

7) How this supports your “menu-driven graph without edge dragging”

Because the kernel has canonical queries, you can implement UI affordances like:
	•	kernel.getCompatibleBusTargets(portRef)
	•	kernel.getCompatibleBlockSuggestions(portRef)
	•	kernel.previewTransaction(tx) → returns
	•	diff summary
	•	validation report
	•	affected subgraph highlight

No UI needs to guess compatibility rules.

⸻

8) Extra information: what to store in history for best long-term outcomes

To make your history tree durable and debuggable:

Each committed transaction stores:
	•	txId, parentTxId
	•	ops[] (expanded, explicit)
	•	inverseOps[] (optional to precompute; or compute via op invert)
	•	diffSummary (human readable)
	•	kernelVersion (for future migrations)
	•	affectedIds (for UI to highlight changes)
	•	timestamp

This makes “checkpoints” trivial:
	•	a checkpoint is just a tagged transaction node.

⸻

9) One last critical decision: do composites have “capability”?

No. Capabilities belong to block definitions in the registry; composite instances are still “blocks”, but capability is derived from what they expand/compile to.

In practice:
	•	A composite instance advertises capability 'pure' at the surface unless it is explicitly in the locked authority list.
	•	The kernel should prevent any composite definition from being declared as an authority primitive.

This keeps your “frozen primitive set” enforceable.

⸻

If you want, the next step is to define the Transaction Builder contract precisely in terms of:
	•	temp IDs
	•	op expansion (cascade)
	•	atomic validation
	•	commit hooks/events
	•	history tree persistence format

…but the op set above is the foundation that makes all of it coherent.