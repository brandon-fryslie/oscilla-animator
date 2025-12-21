
Spec: DiffSummary and Affected Region Computation

This spec defines (1) the diff object every committed transaction produces, and (2) the affected region algorithm that converts raw ops into meaningful “what changed” for UI + runtime no-jank policies.

The goal: after any transaction, you can answer precisely:
	•	What entities were created/removed/modified?
	•	What ports changed their effective input value?
	•	What buses changed their publisher set / combine semantics?
	•	Did time topology change?
	•	Which render sinks were affected?
	•	Which parts can preserve state vs must reset?

⸻

1) DiffSummary: canonical structure

export type DiffSummary = {
  /** Unique transaction id (committed) or temporary id (preview) */
  txId?: TxId;

  /** High-level category for UI grouping */
  kind:
    | 'structural'   // add/remove blocks, wires, buses, bindings
    | 'param'        // parameter edits
    | 'time'         // time root / time model change
    | 'composite'    // composite def edits or instance structure change
    | 'asset'        // svg/text asset edits
    | 'mixed';

  /** Exact entity changes */
  entities: EntityDiff;

  /** Semantic effects derived from entity changes */
  semantics: SemanticDiff;

  /** Runtime relevance */
  runtime: RuntimeImpact;

  /** Human-readable one-liners for history browser */
  summaryLines: readonly string[];

  /** Stable ordering key for deterministic history presentation */
  stableKey: string; // e.g. `${meta.timeMs}:${txId}`
};


⸻

2) EntityDiff: raw “CRUD” changes

export type EntityDiff = {
  created: readonly EntityRef[];
  removed: readonly EntityRef[];
  updated: readonly UpdatedEntity[];

  /** Optional: moves/reorders if you later add UI layout ops */
  moved?: readonly MovedEntity[];
};

export type EntityRef =
  | { kind: 'block'; id: BlockId }
  | { kind: 'wire'; id: ConnectionId }
  | { kind: 'bus'; id: BusId }
  | { kind: 'publisher'; id: PublisherId }
  | { kind: 'listener'; id: ListenerId }
  | { kind: 'compositeDef'; id: CompositeDefId }
  | { kind: 'asset'; id: AssetId };

export type UpdatedEntity = {
  ref: EntityRef;

  /** Field-level patch keys that changed */
  keys: readonly string[];

  /** Optional small before/after for UI (never huge objects) */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

Rule: EntityDiff is derived purely from ops, without graph reasoning.

⸻

3) SemanticDiff: what meaning changed

This is computed from the projected graph before vs after.

export type SemanticDiff = {
  /** Ports whose effective input changed (wire/bus/default) */
  ports: PortChangeSet;

  /** Buses whose effective value definition changed */
  buses: BusChangeSet;

  /** Time model changes (finite/cyclic/infinite, duration/period/mode) */
  time: TimeChange | null;

  /** Render outputs affected */
  renders: RenderChangeSet;

  /** Type compatibility shifts (important for UI diagnostics) */
  typing: TypingChangeSet;

  /** Composite boundary changes if you support inline edits */
  composites: CompositeChangeSet;
};


⸻

3.1 PortChangeSet (the most important one)

A “port change” means: the downstream consumer should expect a different upstream value definition.

export type PortChangeSet = {
  changedInputs: readonly PortChange[];

  /** Ports that became disconnected or implicitly bound */
  disconnected: readonly PortRef[];
  newlyConnected: readonly PortRef[];

  /** Output ports whose downstream fan-out changed (wires/publishers) */
  changedOutputs: readonly PortRef[];
};

export type PortChange = {
  port: PortRef;

  before: EffectiveInput;
  after: EffectiveInput;

  /** Best explanation for UI */
  why: string;

  /** If adapters/lenses changed */
  adapterDelta?: AdapterDelta;

  /** Whether this is likely to cause visible jank if hot-swapped */
  jankRisk: 'low'|'medium'|'high';
};

export type EffectiveInput =
  | { kind: 'none' }
  | { kind: 'wire'; from: PortRef; connectionId: ConnectionId }
  | { kind: 'bus'; busId: BusId; listenerId: ListenerId; adapterChain?: readonly AdapterStep[]; lensStack?: readonly LensDefinition[] }
  | { kind: 'implicitBus'; busId: BusId }     // e.g. phaseA default
  | { kind: 'implicitTime'; port: string }    // e.g. TimeRoot.timeMs
  | { kind: 'default'; value: unknown };

export type AdapterDelta = {
  before?: readonly AdapterStep[];
  after?: readonly AdapterStep[];
  beforeLens?: readonly LensDefinition[];
  afterLens?: readonly LensDefinition[];
};

How to compute: see section 5.

⸻

3.2 BusChangeSet

export type BusChangeSet = {
  changed: readonly BusChange[];
};

export type BusChange = {
  busId: BusId;

  /** Structural writer set changes */
  publishersAdded: readonly PublisherId[];
  publishersRemoved: readonly PublisherId[];
  publishersReordered: boolean;

  /** Config changes */
  combineModeChanged?: { before: BusCombineMode; after: BusCombineMode };
  defaultChanged?: { before: unknown; after: unknown };
  typeChanged?: { before: TypeDesc; after: TypeDesc }; // ideally rare / disallowed

  /** Whether the bus’ effective value definition changed */
  effectiveChanged: boolean;

  /** UI-friendly “reason” */
  why: string;
};


⸻

3.3 TimeChange

export type TimeChange = {
  before: TimeModel | null;
  after: TimeModel | null;

  /** If root identity changed (block switched) */
  timeRootChanged?: { before?: BlockId; after?: BlockId };

  /** If canonical time buses re-bound (phaseA, pulse, etc) */
  timeBusBindingChanged?: boolean;

  /** Jank risk: time topology edits are high risk */
  jankRisk: 'low'|'medium'|'high';
};


⸻

3.4 RenderChangeSet

Render sinks are special: they bound what can be state-preserved.

export type RenderChangeSet = {
  sinksChanged: readonly RenderSinkChange[];
};

export type RenderSinkChange = {
  sinkBlockId: BlockId;

  /** Did the sink itself change? (type/params) */
  sinkUpdated: boolean;

  /** Upstream identity or fields changed */
  domainChanged: boolean;
  fieldsChanged: readonly string[]; // port labels or slotIds

  /** Whether hot-swap can preserve internal state (if any) */
  preserveHint: 'preserve'|'crossfade'|'reset';
};


⸻

3.5 TypingChangeSet (optional but valuable)

export type TypingChangeSet = {
  newlyInvalid: readonly { port: PortRef; errorCode: string }[];
  newlyValid: readonly { port: PortRef }[];
};


⸻

3.6 CompositeChangeSet

export type CompositeChangeSet = {
  defsChanged: readonly CompositeDefId[];
  instancesAffected: readonly BlockId[]; // composite instance blocks impacted
};


⸻

4) RuntimeImpact: explicit policy inputs for no-jank

This object is designed to be consumed by the runtime/player when swapping programs.

export type RuntimeImpact = {
  /** Whether we can reuse time continuity without discontinuity */
  timeContinuity: 'preserve'|'adjust'|'reset';

  /** Recommended program swap strategy */
  swap: SwapStrategy;

  /** Entities that define stateful boundaries (memory blocks, caches) */
  stateBoundaries: readonly BlockId[];

  /** Optional stats */
  severity: 'minor'|'moderate'|'major';
};

export type SwapStrategy =
  | { kind: 'instant' }
  | { kind: 'crossfade'; durationMs: number }
  | { kind: 'freezeAndFade'; durationMs: number } // hold last frame while new warms up
  | { kind: 'reset' }; // hard cut, acceptable only when topology changes drastically

Rule: RuntimeImpact must be computable without compiling to executable code.

⸻

5) Affected region algorithm (exact)

We compute semantic diff by comparing before graph and after graph in a structured way.

5.1 Inputs
	•	docBefore, graphBefore
	•	docAfter, graphAfter
	•	ops[] (canonical, expanded)

5.2 Step A: seed set of “directly touched entities”

From EntityDiff:
	•	all created/removed/updated refs

Convert to seed ports:
	•	if a block touched → include all its ports
	•	if a wire touched → include both endpoints
	•	if publisher/listener touched → include endpoint port + busId
	•	if bus updated → include all its listeners + all publishers
	•	if timeRootSet → include TimeRoot outputs and canonical time buses

Call this set Seeds.

5.3 Step B: compute “effective input” for each input port

Define:

function effectiveInput(view: TxView, inputPort: PortRef): EffectiveInput

Rules (priority order, deterministic):
	1.	If there is an explicit wire into this input → wire
	2.	Else if there is an explicit listener bound into this input → bus
	3.	Else if there is a configured implicit binding (time root / canonical bus) → implicit
	4.	Else if there is a default param (port-level default) → default
	5.	Else → none

Compute this for every input port in Seeds, and also for downstream ports discovered below.

5.4 Step C: find impacted downstream region (propagation)

We need to know what changes ripple outward.

Create a graph traversal:
	•	From any changed output port:
	•	follow wires to downstream input ports
	•	follow publishers to bus
	•	from bus follow listeners to input ports

From any changed bus definition:
	•	treat the bus as a node; changes to it affect all listeners

Stop conditions:
	•	optionally stop at render sinks if you only care about “what changes visual output”
	•	but for diagnostics, usually traverse full reachable region

This yields ImpactedInputs and ImpactedOutputs.

5.5 Step D: classify port changes

For each impacted input port:
	•	compute before = effectiveInput(beforeView, port)
	•	compute after = effectiveInput(afterView, port)
	•	if structurally equal → not a port change
	•	else produce PortChange

Structural equality means:
	•	same kind and same referenced ids (wire id, listener id, bus id)
	•	OR for defaults: deep-equal default value if small; otherwise compare by stable hash

5.6 Step E: bus changes

For each bus touched or reached:
	•	compare publisher sets by id
	•	compare ordering by sortKey sequence
	•	compare combineMode/default/type
	•	set effectiveChanged if any of the above changed OR if any publisher’s adapterChain/enabled changed

5.7 Step F: render sink changes

Identify render sinks in both graphs:
	•	by registry capability render
	•	OR by output type RenderTree

For each sink existing in after:
	•	mark fieldsChanged if any of its input ports are in PortChangeSet.changedInputs
	•	mark domainChanged if its Domain/identity input changed
	•	derive preserveHint:
	•	if only style fields changed → preserve
	•	if geometry/position changed → crossfade
	•	if domain changed (element identity count changes) → reset or crossfade depending on identity guarantees

5.8 Step G: time change

Compare before.time.model vs after.time.model
	•	if kind changed (finite→cyclic etc) → jankRisk=high, timeContinuity=adjust|reset (policy)
	•	if only period/duration changed → adjust
	•	if unchanged → preserve

⸻

6) How jankRisk is computed (deterministic heuristic)

PortChange.jankRisk:
	•	low: lens/adapter changes only; combineMode changes that preserve continuity; numeric scale changes
	•	medium: input source changed but within same world/domain; e.g. different bus or different wire
	•	high: world/domain change (field↔signal), time topology changes, domain identity input changed, or renderer changed

RuntimeImpact.severity:
	•	major if any high affecting render sinks or time model
	•	moderate if many medium reaching sinks
	•	minor otherwise

SwapStrategy recommendation:
	•	instant if minor
	•	crossfade ~150–400ms if moderate
	•	freezeAndFade if major but you want continuity perception
	•	reset only when the new patch invalidates continuity assumptions (rare)

⸻

7) Why this matters for your “multi-UI” plan

Because DiffSummary is UI-neutral:
	•	Table UI can highlight changed rows
	•	Bus board can pulse changed buses
	•	Any future “performance UI” can show “phase changed” as a live badge
	•	Runtime can decide state-preservation without guessing from raw ops

No duplication, no drift.

⸻

8) Minimal implementation checklist

To implement this spec cleanly:
	1.	Introduce effectiveInput() in SemanticGraph indices
	2.	Build Seeds from EntityDiff
	3.	Traverse impacted region via a unified adjacency (wire + bus edges)
	4.	Emit PortChangeSet + BusChangeSet
	5.	Identify render sinks via registry capability
	6.	Produce RuntimeImpact recommendation

⸻

If you want to continue, the natural next spec is “State Preservation Contract”: exactly how runtime uses RuntimeImpact + element identity to keep animations stable when swapping programs (including where lazy Field materialization boundaries live).