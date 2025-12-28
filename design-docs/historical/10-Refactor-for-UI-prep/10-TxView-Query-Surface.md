Spec: TxView query surface

This is the read-only API that every UI (table UI, bus board UI, any future view) uses to understand the patch as it will be after staged ops, and to ask “what actions are valid here?” without re-implementing compiler logic.

The goal: all suggestion menus, compatibility pickers, hover-previews, and “one click fix” buttons come from TxView.

⸻

1) Core principles
	1.	TxView is deterministic: same doc + same staged ops → same answers.
	2.	TxView is complete: every UI question about structure, types, and compatibility is answered here.
	3.	TxView is semantic: no coordinates, no layout, no UI state.
	4.	TxView is “compiled structure,” not codegen: it can build indices and do resolution (adapters, defaults, ordering) but does not produce runtime functions.

⸻

2) TypeScript interface

export interface TxView {
  /** The base committed doc at tx start */
  readonly baseDoc: PatchDocument;

  /** The projected doc after staged ops (virtual; not necessarily materialized) */
  readonly doc: PatchDocument;

  /** Semantic graph + indices for the projected doc */
  readonly graph: SemanticGraph;

  /** Validation state of the projected doc */
  readonly report: ValidationReport;

  /** Canonical time topology */
  readonly time: TimeTopologyView;

  /** Entity lookup helpers */
  getBlock(blockId: BlockId): Block | null;
  getBus(busId: BusId): Bus | null;
  getWire(connectionId: ConnectionId): Connection | null;
  getPublisher(publisherId: PublisherId): Publisher | null;
  getListener(listenerId: ListenerId): Listener | null;

  /** Port lookup and typing */
  getPort(ref: PortRef): PortInfo | null;
  getPortType(ref: PortRef): TypeDesc | null;

  /** Connection/binding neighborhood */
  getIncoming(ref: PortRef): IncomingSummary;
  getOutgoing(ref: PortRef): OutgoingSummary;
  getBusPublishers(busId: BusId): readonly Publisher[];
  getBusListeners(busId: BusId): readonly Listener[];

  /** Discoverability + authoring affordances */
  actions(): ActionsAPI;

  /** Diagnostics + fixes */
  diagnostics(): DiagnosticsAPI;
}


⸻

3) PortInfo and neighborhood summaries

These are designed so UIs never scan raw arrays.

export type PortInfo = {
  ref: PortRef;
  label: string;
  direction: 'input' | 'output';
  type: TypeDesc;

  // computed
  isConnected: boolean;
  isBusBound: boolean;
  isImplicitlyBound: boolean; // eg “phase defaults to phaseA”
  implicitSource?: { kind: 'bus'; busId: BusId } | { kind: 'timeRoot'; port: string };

  // UI-friendly badges
  badges: readonly { kind: 'type'|'world'|'warning'|'error'|'implicit'; text: string }[];
};

Incoming/outgoing summaries:

export type IncomingSummary = {
  wire?: Connection;               // at most one, enforced by kernel if wires enabled
  listener?: Listener;             // at most one, if you enforce single bus listen per port
  implicit?: { kind:'bus'; busId:BusId } | { kind:'timeRoot'; port:string };
};

export type OutgoingSummary = {
  wires: readonly Connection[];    // fan-out allowed
  publishers: readonly Publisher[]; // multiple publishers per output is allowed
};


⸻

4) TimeTopologyView

This makes “looping / infinite” first-class and lets UI show correct transport.

export type TimeTopologyView = {
  timeRoot: { blockId: BlockId; kind: 'finite'|'cyclic'|'infinite' } | null;

  /** Final time model after resolving root + settings */
  model: TimeModel | null;

  /** Canonical buses bound to time (phaseA, pulse, etc) and where they originate */
  bindings: readonly {
    busId: BusId;
    semantic: 'phaseA'|'phaseB'|'pulse'|'energy'|'time';
    source: { kind:'timeRoot'; port:string } | { kind:'bus'; busId:BusId };
  }[];

  /** Any violations (missing root, multiple roots, incompatible model) */
  issues: readonly CompileError[];
};


⸻

5) ActionsAPI

This is the “menu engine.” It tells the UI what can go where.

export interface ActionsAPI {
  /** Can this port accept a wire from that other port? */
  canWire(from: PortRef, to: PortRef): CapabilityCheck;

  /** Can this port listen to that bus? (with adapter suggestions) */
  canListen(to: PortRef, busId: BusId): ListenCapability;

  /** Can this port publish to that bus? */
  canPublish(from: PortRef, busId: BusId): PublishCapability;

  /** For a given input port, list compatible buses (ordered, with adapter costs) */
  listCompatibleBusesForInput(to: PortRef, opts?: CompatOpts): readonly BusCandidate[];

  /** For a given output port, list compatible buses */
  listCompatibleBusesForOutput(from: PortRef, opts?: CompatOpts): readonly BusCandidate[];

  /**
   * For a given port, list block types that could satisfy it if inserted.
   * This powers “click port → menu of compatible blocks” flows.
   */
  suggestBlockInsertions(target: PortRef, opts?: SuggestOpts): readonly BlockInsertionSuggestion[];

  /**
   * For a selected block, list block types it can be retyped into without breaking
   * (or with auto-rewire/adapter fixes).
   */
  listRetypeOptions(blockId: BlockId, opts?: RetypeOpts): readonly RetypeCandidate[];

  /** Quick-fix generation: returns a TransactionPlan (ops) that applies the fix */
  buildFix(fixId: FixId): PlannedTransaction;
}

Core return types

export type CapabilityCheck =
  | { ok: true }
  | { ok: false; reason: string; diagnostics?: readonly CompileError[] };

export type AdapterCost = {
  kind: 'none'|'cast'|'lift'|'reduce'|'materialize';
  score: number;            // monotonic “worse is higher”
  note?: string;            // “Field→Signal reduce is expensive”
};

export type BusCandidate = {
  busId: BusId;
  name: string;
  type: TypeDesc;
  compatible: boolean;
  adapterChain?: readonly AdapterStep[];
  cost: AdapterCost;
  why?: string;
};

export type ListenCapability =
  | { ok: true; adapterChain?: readonly AdapterStep[]; cost: AdapterCost }
  | { ok: false; reason: string; suggestions?: readonly BusCandidate[] };

export type PublishCapability =
  | { ok: true; adapterChain?: readonly AdapterStep[]; cost: AdapterCost }
  | { ok: false; reason: string };

export type BlockInsertionSuggestion = {
  blockType: BlockType;
  label: string;
  category: BlockCategory;

  /**
   * A minimal transaction plan that would insert the block and connect/bind it.
   * UI can preview it without applying.
   */
  plan: PlannedTransaction;

  /**
   * Optional: an estimated “complexity” badge for UI (“1 block”, “3 blocks”)
   */
  complexity: { blocks: number; bindings: number; wires: number };

  /**
   * Optional: what this would output and how it satisfies the target.
   */
  satisfies: { target: PortRef; viaPort: { blockPortLabel: string } };
};

export type RetypeCandidate = {
  nextType: BlockType;
  confidence: 'safe'|'requiresFix'|'unsafe';
  plan?: PlannedTransaction; // if requiresFix
  notes?: readonly string[];
};


⸻

6) PlannedTransaction (previewable, composable)

This is crucial: menus don’t perform mutations; they return plans.

export type PlannedTransaction = {
  meta: { label: string; tags?: readonly string[] };
  ops: readonly Op[];                 // canonical ops (may use temp ids)
  tempIdMap?: Record<string,string>;  // resolved during apply
  expected: {
    affected: readonly EntityRef[];
    creates?: readonly EntityRef[];
    removes?: readonly EntityRef[];
  };
};

TxBuilder can accept a plan:

tx.applyPlan(plan: PlannedTransaction): void;


⸻

7) DiagnosticsAPI

This is how UIs show “why it broke” and offer fixes.

export interface DiagnosticsAPI {
  /** All current diagnostics, sorted by severity then locality */
  list(): readonly Diagnostic;

  /** Diagnostics attached to a specific entity */
  forBlock(blockId: BlockId): readonly Diagnostic;
  forBus(busId: BusId): readonly Diagnostic;
  forPort(ref: PortRef): readonly Diagnostic;

  /** Machine-actionable fixes derived from diagnostics */
  fixes(): readonly Fix;
  fixesFor(ref: EntityRef): readonly Fix[];
}

Where:

export type Diagnostic = {
  id: string;
  severity: 'error'|'warning'|'info';
  code: string;
  message: string;
  why?: string;

  primary: EntityRef;
  related?: readonly EntityRef[];

  /** Suggested fixes, each with a plan */
  fixes?: readonly FixId[];
};

export type Fix = {
  id: FixId;
  label: string;                // “Insert Delay block”
  description?: string;
  plan: PlannedTransaction;
  appliesTo: readonly EntityRef[];
};


⸻

8) How this enables multi-UI (the point)

Because every UI can do:
	•	render from view.doc + view.graph indices
	•	show compatibility menus from view.actions()
	•	show error banners from view.diagnostics()
	•	execute changes via kernel.transaction(... tx.applyPlan(plan) ...)

No UI needs to know:
	•	how type compatibility works
	•	how adapter chains are chosen
	•	how time roots map to loop UI
	•	how “implicit bindings” work
	•	how to generate fixes

That’s the nails-in-coffin part.

⸻

9) Implementation notes that matter

9.1 Performance

TxView must be incremental:
	•	graph indices updated by staged ops
	•	cached compatibility queries (keyed by PortKey + BusId + registryVersion)

9.2 Determinism

All “list” results must be deterministically sorted:
	•	by cost, then by sortKey/name/id stable tie-breaker

9.3 No hidden magic

Implicit defaults (like phaseA) must appear explicitly in PortInfo.isImplicitlyBound and IncomingSummary.implicit so UI can show it.

⸻

If you say Next, I’ll give the next spec: DiffSummary structure + affected-region computation rules (so your UI can highlight changes, and your runtime can decide when to preserve state vs crossfade).