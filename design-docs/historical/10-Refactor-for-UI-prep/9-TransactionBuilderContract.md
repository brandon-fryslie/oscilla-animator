Below is the exact Transaction Builder contract (API + invariants + storage format) that makes your ops system:
	•	atomic
	•	invertible
	•	branching (history tree, no truncation)
	•	kernel-validated
	•	UI-agnostic
	•	and safe for “big edits” (macro expand, composite swap, time-root changes) without jank.

I’m going to write this as if it’s the spec you hand to an engineer and say “build exactly this.”

⸻

1) Core concepts

1.1 PatchDocument is the only semantic state

Transactions mutate PatchDocument only.

UI layout, selection, viewport, inspector expansion, etc are not part of this system.

1.2 Transactions are the only way to mutate PatchDocument

There is no store.addBlock() that mutates directly.

Everything becomes:

kernel.transaction('Add Block', tx => {
  tx.addBlock(...)
  tx.bindListener(...)
  tx.commit()
})

1.3 Transactions compile down to Ops

The transaction builder is not another mutation system. It’s a structured way to produce a list of canonical Ops, plus their inverses, validated as a unit.

⸻

2) TypeScript API (contract)

2.1 Kernel surface

export interface PatchKernel {
  /** Current committed semantic state */
  readonly doc: PatchDocument;

  /** Canonical semantic graph + indices derived from doc */
  readonly graph: SemanticGraph;

  /** Current validation state for the committed doc */
  readonly report: ValidationReport;

  /**
   * Create and (optionally) commit a transaction.
   * No async. The callback cannot be async and cannot return a Promise.
   */
  transaction<R>(
    meta: TxMeta,
    build: (tx: TxBuilder) => R
  ): TxResult<R>;

  /**
   * Apply an already-built transaction (used for remote sync, replay, import).
   * Must either commit fully or fail without mutation.
   */
  applyTx(tx: CommittedTx): ApplyTxResult;

  /** History navigation */
  undo(): ApplyTxResult;
  redo(branchId?: BranchId): ApplyTxResult;
  checkout(nodeId: TxId): ApplyTxResult;

  /** Persistence hooks */
  exportHistory(): PersistedHistory;
  importHistory(data: PersistedHistory): void;
}

No-async enforcement

The callback signature build: (tx) => R ensures a Promise return is a type error in strict TS if you add a helper type:

type NotPromise<T> = T extends Promise<any> ? never : T;

transaction<R>(
  meta: TxMeta,
  build: (tx: TxBuilder) => NotPromise<R>
): TxResult<R>;

Now async (tx) => { ... } fails because it returns Promise<R>.

⸻

2.2 Transaction builder surface

This is the API engineers actually call. It’s high-level convenience that emits low-level Ops.

export interface TxBuilder {
  /** Read-only snapshot of state as of transaction start + staged edits */
  readonly view: TxView;

  /** Add an op directly (escape hatch). Still validated and invertible. */
  op(op: Op): void;

  /** Strongly-typed helpers (preferred) */
  addBlock(spec: { type: BlockType; label?: string; params?: Record<string, unknown>; id?: BlockId }): BlockId;
  removeBlock(blockId: BlockId): void;
  retypeBlock(blockId: BlockId, nextType: BlockType, remap?: RetypeRemap): void;
  setBlockLabel(blockId: BlockId, label: string): void;
  patchBlockParams(blockId: BlockId, patch: Record<string, unknown>): void;

  addWire(from: PortRef, to: PortRef, id?: ConnectionId): ConnectionId;
  removeWire(connectionId: ConnectionId): void;
  retargetWire(connectionId: ConnectionId, next: { from?: PortRef; to?: PortRef }): void;

  addBus(spec: { name: string; type: TypeDesc; combineMode: BusCombineMode; defaultValue: unknown; sortKey?: number; id?: BusId; origin?: 'user'|'built-in' }): BusId;
  removeBus(busId: BusId): void;
  updateBus(busId: BusId, patch: Partial<Pick<Bus,'name'|'combineMode'|'defaultValue'|'sortKey'>>): void;

  addPublisher(spec: { busId: BusId; from: BindingEndpoint; enabled?: boolean; sortKey?: number; adapterChain?: AdapterStep[]; id?: PublisherId }): PublisherId;
  removePublisher(publisherId: PublisherId): void;
  updatePublisher(publisherId: PublisherId, patch: Partial<Pick<Publisher,'enabled'|'sortKey'|'adapterChain'>>): void;

  addListener(spec: { busId: BusId; to: BindingEndpoint; enabled?: boolean; adapterChain?: AdapterStep[]; lensStack?: LensDefinition[]; id?: ListenerId }): ListenerId;
  removeListener(listenerId: ListenerId): void;
  updateListener(listenerId: ListenerId, patch: Partial<Pick<Listener,'enabled'|'adapterChain'|'lensStack'>>): void;

  setTimeRoot(blockId: BlockId): void;
  updatePatchSettings(patch: Partial<PatchDocument['settings']>): void;

  /** Composite defs (optional here; may live in a separate CompositeKernel) */
  addCompositeDef(def: CompositeDefinition): CompositeDefId;
  updateCompositeDef(defId: CompositeDefId, patch: Partial<CompositeDefinition>): void;
  replaceCompositeGraph(defId: CompositeDefId, next: CompositeGraphReplacement): void;
  removeCompositeDef(defId: CompositeDefId): void;

  /**
   * Declare that this transaction must be committed.
   * If not called, transaction is "preview-only" and returns staged report/diff.
   */
  commit(): void;

  /** Optional: abort explicitly */
  abort(reason?: string): void;
}

Why commit() is explicit

It allows you to use the same mechanism for:
	•	previews (hovering suggested blocks)
	•	“are you sure?” diff views
	•	optimistic UI that doesn’t mutate state until user confirms

⸻

2.3 Transaction result types

export type TxMeta = {
  label: string;                 // "Insert Macro: Breathing Dots"
  source: 'ui'|'import'|'remote'|'test';
  timeMs: number;                // wall clock for ordering/persistence
  actorId?: string;              // multi-client later
  tags?: string[];               // "macro", "bus", "time"
};

export type TxResult<R> =
  | { ok: true; committed: true; value: R; tx: CommittedTx; report: ValidationReport; diff: DiffSummary }
  | { ok: true; committed: false; value: R; preview: PreviewTx; report: ValidationReport; diff: DiffSummary }
  | { ok: false; error: TxError; report: ValidationReport; diff?: DiffSummary };

export type PreviewTx = {
  meta: TxMeta;
  ops: readonly Op[];            // expanded, canonical ops
  // no nodeId because not committed to history tree
};

export type CommittedTx = {
  id: TxId;
  parentId: TxId | null;         // history tree
  meta: TxMeta;

  ops: readonly Op[];            // canonical ops (expanded)
  inverseOps: readonly Op[];     // canonical inverses, precomputed

  // optional, but recommended:
  affected: readonly EntityRef[]; // for UI highlight/navigation
  diff: DiffSummary;             // human-ish
  report: ValidationReport;       // post-commit structural+warn state
  kernelVersion: number;          // for future migrations of ops meaning
};


⸻

3) The “expansion” rules (cascade, normalization, determinism)

This is where most systems go wrong. Here’s the contract.

3.1 No hidden mutation

If tx.removeBlock(blockId) implies removing wires and bindings, the builder MUST expand that into explicit ops inside the tx:
	•	WireRemove for all incident wires
	•	PublisherRemove / ListenerRemove for all bindings referencing that block
	•	then BlockRemove

Those explicit removals become part of ops[] and inverseOps[].

Reason: invertibility and replayability. No “magic” on undo.

3.2 Deterministic op ordering inside a transaction

To avoid non-deterministic diffs and weird merge behavior:
	•	Removals first, then additions, then updates (generally)
	•	Within each category, sort by stable key (entity id)
	•	The kernel owns this normalization order, not the UI

Example ordering:
	1.	remove bindings
	2.	remove wires
	3.	remove blocks
	4.	add blocks
	5.	add buses
	6.	add bindings/wires
	7.	updates (params, labels, bus configs)

⸻

4) Validation model: preflight, staged, commit

4.1 Staged view

tx.view is a read-only projection of:
	•	base doc + staged ops applied
	•	base graph + staged deltas

So when you do:

tx.addListener(...)
tx.addPublisher(...)

the next call can query tx.view as if those already exist.

4.2 Commit rule

commit() only succeeds if structural validity is clean.

Warnings are allowed; errors are not.

If errors exist at commit time:
	•	the transaction returns {ok:false, ...}
	•	no state is mutated
	•	history is unchanged

⸻

5) Inversion: exact rule for invertible ops

Every op must have a guaranteed inverse.

Inverse strategy
	•	For “add”: inverse is “remove” with the created id
	•	For “update”: inverse requires capturing the previous value at transaction-build time
	•	For “remove”: inverse requires capturing the removed entity snapshot at build time

So TxBuilder must capture “before state” for every destructive op and store it in an internal journal used to emit inverseOps.

This is why we want kernel-managed tx building: it has access to the canonical doc/graph.

⸻

6) History tree semantics (no truncation)

6.1 History is a DAG (tree) of committed transactions
	•	Every committed tx has exactly one parentId (a tree).
	•	Redo is choosing a child of the current node.
	•	Branches persist forever.

6.2 Checkout

checkout(nodeId) sets current head to a past node.
New commits from there create a new branch child.

6.3 Redo UX is a branch chooser

You’ll want:
	•	“redo last” if only one child exists
	•	otherwise show a branch menu (by label/time)

⸻

7) Persistence format (project lifetime)

You persist the entire history DAG plus the current head pointer.

export type PersistedHistory = {
  kernelVersion: number;
  projectId: string;

  /** Node graph */
  nodes: Record<TxId, CommittedTx>;

  /** For fast traversal */
  children: Record<TxId, readonly TxId[]>;

  /** Current checked-out node */
  head: TxId;

  /** Optional: named bookmarks/checkpoints */
  tags?: Record<string, TxId>;

  /** Optional: compaction metadata (NOT truncation) */
  snapshots?: readonly SnapshotEntry[];
};

About compaction without truncation

You said “no truncate.” That’s fine. But you still may want snapshots for fast load:
	•	A snapshot is just: “doc state at node X”
	•	You still keep all ops before/after
	•	On load, you start from nearest snapshot ≤ head and replay forward

This preserves the full tree forever.

⸻

8) Multi-client readiness (without implementing it now)

This contract is already compatible with server-authoritative later because:
	•	each tx has actorId
	•	all ops are deterministic
	•	parentId is explicit (causal ordering)
	•	conflicts are detectable as “two clients committed on same parent” (branching)

A server can:
	•	accept txs
	•	assign canonical ids if needed
	•	broadcast committed txs
Clients just applyTx().

⸻

9) “No-jank” editing: what this contract guarantees

No-jank isn’t just rendering; it’s semantic continuity.

This contract supports “hot swap” because:
	•	Transactions are atomic: you never expose intermediate broken states
	•	Inverse ops exist: user can always revert
	•	The kernel can compute affected ids so runtime can decide whether to:
	•	preserve state
	•	crossfade
	•	reset only some subsystems

(That decision is runtime policy; the transaction tells you what changed.)

⸻

10) The minimum additional enforcement mechanisms (compile-time + runtime)

Compile-time (TypeScript)
	•	transaction callback rejects Promises (NotPromise)
	•	TxBuilder exposes only methods that produce valid canonical ops
	•	op(op) escape hatch is allowed but still validated; you can gate it behind dev flags

Runtime (assertions)
	•	during development: assert every committed tx produces a structurally valid doc
	•	assert inverseOps truly inverts by replaying on a clone in tests (not perf-critical)

⸻

11) Practical note about your current store architecture

You currently have PatchStore + BusStore as separate observable arrays.

Long-term, the semantics kernel wants one PatchDocument that includes buses/publishers/listeners, so ops touch one object graph.

You can still keep BusStore as a view layer that reads from PatchDocument and offers computed helpers, but mutation must flow through the transaction system.

⸻

If you want the next level of precision, I can also specify:
	•	the exact TxView query surface (compatibility menus, “suggest fix” APIs)
	•	the exact DiffSummary structure
	•	the exact EntityRef and “affected region” computation rules

…but the contract above is sufficient for an engineer to implement the transaction builder + history tree correctly with no ambiguity.