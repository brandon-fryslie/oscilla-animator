####### This document provides context and info about the state of the repo, in the form of a "prompt" and a reponse to that prompt.  You should NOT attempt to answer the below prompt, it is provided purely as context for the response which is below.

Prompt for Repo-Access LLM

You are an engineering assistant with full read access to this repo:
	•	https://github.com/loom99-public/loom99-animations
Focus on: gallery/src/editor/** (ignore everything else unless needed for types or runtime).

Your job is to extract specific architectural facts (with file paths + code excerpts) so another architect can design a robust “multi-UI projection” foundation where multiple UIs (List view, Influence view, Time-sliced view, later performance view) operate over the same underlying patch data, with shared mutation ops and shared selection/navigation.

Do NOT propose new designs. Only report current reality + constraints.

Return your answer in the following sections, each containing:
	•	bullet list of findings
	•	file path(s)
	•	relevant code excerpts (short, but enough context)
	•	any important invariants you can infer (explicitly label “inferred” vs “stated”)

1) Canonical data model: Patch and all entity types

Find the single source(s) of truth for:
	•	Patch shape(s) and versioning
	•	Block / BlockInstance / Slot / Port / Connection
	•	Bus / Publisher / Listener
	•	Lens / Adapter chain / TypeDesc / SlotType / ValueKind mappings
	•	Selection model types (if any)

For each, answer:
	•	where is it defined
	•	how is it serialized/deserialized
	•	whether IDs are stable (how generated)
	•	whether there are multiple competing definitions (editor vs compiler types)

2) Store architecture and mutation surfaces

Identify all stores and their responsibilities:
	•	EditorStore, PatchStore, LogStore, SelectionStore, etc
	•	what is observable, what is derived/computed
	•	what are the current mutation entry points (actions) used by UI

Produce:
	•	a list of all store action methods that mutate patch state
	•	for each: what it changes (blocks, buses, listeners, etc) and whether it uses transactions already

Also: identify whether there is already any event/hook system or transaction system in use.

3) Compiler pipeline boundaries

Document the full compile path from editor patch → compiled program:
	•	what function is called from UI/runtime
	•	where “integration” happens (macro expansion? composite expansion?)
	•	where typechecking happens
	•	where buses are resolved/combined
	•	where Field / FieldExpr / Signal representations are defined

Specifically answer:
	•	Do we compile incrementally or always full compile?
	•	What compilation products exist (Program, RenderTreeProgram, TimelineHint/TimeModel, diagnostics)
	•	Where do diagnostics originate and how are they surfaced to UI?

4) Runtime/player integration points

Find:
	•	player/runtime time model (LoopMode, maxTime, applyTimelineHints, etc)
	•	how compiled program is evaluated per frame
	•	where any “live bus values” or previews could be sampled for UI

Answer:
	•	what call signature is used to render (program(time, ctx)?)
	•	what context exists (seed, dt, frame, element count, etc)
	•	whether there is an existing “debug/inspection” channel

5) Current UI dependency on stores and patch structure

Map the current UI components to the store APIs they consume:
	•	PatchBay / lanes UI
	•	Inspector
	•	Library
	•	PreviewPanel
	•	Console/diagnostics

For each component:
	•	what store fields it reads
	•	what actions it calls
	•	what assumptions it makes about layout (lanes, x/y positions, etc)
	•	whether it expects wires to exist or can tolerate buses-only

This is important to understand what must be decoupled to support multiple UIs.

6) Existing layout/positioning data

Determine whether blocks currently store:
	•	lane index
	•	x/y coordinates
	•	ordering keys
	•	graph grouping information

Show the exact fields and where used.

7) Undo/redo and persistence reality

Confirm:
	•	does undo/redo exist today?
	•	is there any “op log” or transaction abstraction?
	•	how is patch saved/loaded (localStorage? URL hash? file? server?)
	•	what persistence format is used (JSON schema, migrations)

8) Constraints and “do not break” invariants (as implemented)

From reading the code, list any invariants that are enforced today, such as:
	•	one writer per input
	•	type compatibility rules
	•	deterministic ordering rules (sortKey)
	•	restrictions on cycles / state blocks
	•	any restrictions on composite/macro expansion

Cite where enforced.

Output format requirements
	•	Use headings exactly as numbered above.
	•	Include file paths in every bullet.
	•	Include short code excerpts in fenced code blocks.
	•	If you cannot find something, say “NOT FOUND” and list what you searched for.

⸻

That’s the prompt.

######## Response:

  ---
  Architectural Facts Report: oscilla-animator Editor

  1) Canonical data model: Patch and all entity types

  Patch Shape and Versioning

  File: src/editor/types.ts:639-683

  export interface Patch {
    /** Format version for migration */
    readonly version: number;

    /** Feature flags for compatibility detection */
    readonly features?: { buses?: boolean };

    blocks: Block[];
    connections: Connection[];
    lanes: Lane[];
    buses?: Bus[];
    publishers?: Publisher[];
    listeners?: Listener[];
    settings: {
      seed: number;
      speed: number;
      finiteLoopMode?: boolean;
      // ...more settings
    };
    composites?: import('./composites').CompositeDefinition[];
  }

  - Version: Integer version number for migration
  - Serialization: JSON-serializable, no custom serializers found
  - IDs: Generated via randomUUID() or prefix-based (block-1, conn-1) - see RootStore.generateId()

  Block / BlockInstance / Slot

  File: src/editor/types.ts:419-443

  export interface Block {
    readonly id: BlockId;          // string, unique
    readonly type: BlockType;      // e.g., 'GridDomain', 'Oscillator'
    label: string;                 // user-editable label
    readonly inputs: readonly Slot[];
    readonly outputs: readonly Slot[];
    params: BlockParams;           // Record<string, unknown>
    readonly category: BlockCategory;
    readonly description?: string;
  }

  export interface Slot {
    readonly id: string;
    readonly label: string;
    readonly type: SlotType;       // e.g., 'Signal<phase>', 'Field<vec2>'
    readonly direction: 'input' | 'output';
  }

  - ID stability: Generated at add time via generateBlockId(), stable thereafter
  - Competing definitions: Yes, compiler has separate types in src/editor/compiler/types.ts:
    - BlockInstance (compiler version)
    - CompilerConnection (has from/to with port instead of slotId)

  Connection

  File: src/editor/types.ts:449-467

  export interface Connection {
    readonly id: string;
    readonly from: { readonly blockId: BlockId; readonly slotId: string };
    readonly to: { readonly blockId: BlockId; readonly slotId: string };
  }

  - IDs: Generated via generateConnectionId() (prefix conn-)
  - Invariant (inferred): One writer per input slot enforced at compile time

  Bus / Publisher / Listener

  File: src/editor/types.ts:127-250

  export interface Bus {
    readonly id: string;
    name: string;
    readonly type: TypeDesc;
    combineMode: BusCombineMode;    // 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer'
    defaultValue: unknown;
    sortKey: number;                 // For deterministic ordering
    readonly origin?: 'built-in' | 'user';
  }

  export interface Publisher {
    readonly id: string;
    readonly busId: string;
    readonly from: BindingEndpoint;  // { blockId, port }
    readonly adapterChain?: AdapterStep[];
    enabled: boolean;
    sortKey: number;
  }

  export interface Listener {
    readonly id: string;
    readonly busId: string;
    readonly to: BindingEndpoint;
    readonly adapterChain?: AdapterStep[];
    enabled: boolean;
    readonly lens?: LensDefinition;
    readonly lensStack?: LensDefinition[];
  }

  TypeDesc / SlotType / ValueKind

  File: src/editor/types.ts:70-88, 260-296

  export interface TypeDesc {
    readonly world: TypeWorld;       // 'signal' | 'field'
    readonly domain: Domain;         // 'number', 'vec2', 'color', 'phase', etc.
    readonly category: TypeCategory; // 'core' | 'internal'
    readonly busEligible: boolean;
    readonly semantics?: string;
    readonly unit?: string;
  }

  // SLOT_TYPE_TO_TYPE_DESC: Record<SlotType, TypeDesc> provides mapping

  File: src/editor/compiler/types.ts (ValueKind)
  - Compiler has its own ValueKind enum: 'Scalar:number', 'Field:vec2', 'Signal:Unit', etc.

  Selection model

  File: src/editor/types.ts:717-764

  export interface PortRef {
    readonly blockId: BlockId;
    readonly slotId: string;
    readonly direction: 'input' | 'output';
  }

  export interface EditorUIState {
    selectedBlockId: BlockId | null;
    draggingBlockType: BlockType | null;
    draggingLaneKind: LaneKind | null;
    activeLaneId: LaneId | null;
    hoveredPort: PortRef | null;
    selectedPort: PortRef | null;
    contextMenu: ContextMenuState;
    isPlaying: boolean;
  }

  ---
  2) Store architecture and mutation surfaces

  Store Hierarchy

  File: src/editor/stores/RootStore.ts

  export class RootStore {
    patchStore: PatchStore;
    busStore: BusStore;
    uiStore: UIStateStore;
    logStore: LogStore;
    events: EventDispatcher;

    // ID generation
    private idCounter = 0;
    generateId(prefix: string): string {
      return `${prefix}-${++this.idCounter}`;
    }
  }

  PatchStore Observables and Actions

  File: src/editor/stores/PatchStore.ts

  Observables:
  blocks: Block[] = [];
  connections: Connection[] = [];
  lanes: Lane[] = [];
  currentLayoutId: string;
  patchId: string = randomUUID();
  patchRevision: number = 0;

  Computed:
  get currentLayout(): LaneLayout
  get availableLayouts(): readonly LaneLayout[]

  Actions (mutation entry points):

  | Action                                        | Mutates                                              | Transactions                     |
  |-----------------------------------------------|------------------------------------------------------|----------------------------------|
  | addBlock(type, laneId, params?)               | blocks, lanes, bus routing                           | Emits BlockAdded, GraphCommitted |
  | addBlockAtIndex(type, laneId, index, params?) | blocks, lanes                                        | Emits events                     |
  | expandMacro(expansion)                        | Clears patch, creates blocks/connections/bus routing | Emits MacroExpanded              |
  | removeBlock(id)                               | blocks, connections, lanes, publishers, listeners    | Cascades connection removal      |
  | replaceBlock(oldId, newType)                  | blocks, connections, bus routing                     | Preserves compatible connections |
  | updateBlockParams(blockId, params)            | block.params                                         | No events                        |
  | connect(fromId, fromSlot, toId, toSlot)       | connections                                          | Emits WireAdded                  |
  | disconnect(connectionId)                      | connections                                          | Emits WireRemoved                |
  | toggleLaneCollapsed/Pinned                    | lane UI state                                        | No events                        |
  | moveBlockToLane(blockId, laneId)              | lanes                                                | No events                        |
  | switchLayout(layoutId)                        | lanes (migrations)                                   | No events                        |

  BusStore Actions

  File: src/editor/stores/BusStore.ts

  | Action                                                | Mutates                         |
  |-------------------------------------------------------|---------------------------------|
  | createDefaultBuses()                                  | buses (creates 5 default buses) |
  | createBus(typeDesc, name, combineMode, defaultValue?) | buses                           |
  | deleteBus(busId)                                      | buses, publishers, listeners    |
  | addPublisher(busId, blockId, port)                    | publishers                      |
  | removePublisher(publisherId)                          | publishers                      |
  | addListener(busId, blockId, port, adapters?, lens?)   | listeners                       |
  | removeListener(listenerId)                            | listeners                       |
  | reorderPublisher(publisherId, newSortKey)             | publishers                      |

  UIStateStore Actions

  File: src/editor/stores/UIStateStore.ts

  | Action                | Mutates                       |
  |-----------------------|-------------------------------|
  | selectBlock(blockId)  | selectedBlockId, selectedPort |
  | setHoveredPort(port)  | hoveredPort                   |
  | setSelectedPort(port) | selectedPort, selectedBlockId |
  | setActiveLane(laneId) | activeLaneId                  |
  | setPlaying(isPlaying) | isPlaying                     |

  Event System

  File: src/editor/events/EventDispatcher.ts

  export class EventDispatcher {
    emit<T extends EditorEvent>(event: T): void;
    on<T extends EditorEvent['type']>(type: T, handler: EventHandler): () => void;
    subscribe(handler: EventHandler<EditorEvent>): () => void;
  }

  File: src/editor/events/types.ts - Event types:
  - BlockAdded, BlockRemoved, BlockReplaced
  - WireAdded, WireRemoved
  - BusCreated, BusDeleted
  - BindingAdded, BindingRemoved
  - MacroExpanded
  - GraphCommitted (with patchRevision, diffSummary)
  - RuntimeHealthSnapshot

  ---
  3) Compiler pipeline boundaries

  Entry Point

  File: src/editor/compiler/compile.ts:43-56

  export function compilePatch(
    patch: CompilerPatch,
    registry: BlockRegistry,
    seed: Seed,
    ctx: CompileCtx
  ): CompileResult {
    // Route to bus-aware compiler if patch has buses
    if (isBusAwarePatch(patch)) {
      return compileBusAwarePatch(patch, registry, seed, ctx);
    }
    return compilePatchWireOnly(patch, registry, seed, ctx);
  }

  Compilation Pipeline

  1. Empty patch check (line 71-75)
  2. TimeRoot validation - validateTimeRootConstraint() (line 79-82)
  3. Block type validation - All blocks have registered compilers (line 85-93)
  4. Connection indexing - indexIncoming(), detect multiple writers (line 96-108)
  5. Type checking - Port type compatibility for all connections (line 110-162)
  6. Topological sort - topoSortBlocks() (line 166-167)
  7. Block compilation - In topo order, produce Artifacts (line 170-272)
  8. Output resolution - Find/infer RenderTree output (line 275-316)
  9. TimeModel inference - inferTimeModel() (line 294)

  Bus-Aware Compilation

  File: src/editor/compiler/compileBusAware.ts

  Builds a DependencyGraph with:
  - BlockOut nodes
  - BusValue nodes
  - Wire/Publisher/Listener edges

  Macro/Composite Expansion

  Macros: src/editor/macros.ts - Expand at addBlock time, clear patch and create multiple blocks/connections
  Composites: src/editor/composites.ts - Registered definitions, compiled as single blocks

  Compilation Products

  interface CompileResult {
    ok: boolean;
    program?: Program<RenderTree>;
    timeModel?: TimeModel;
    errors: readonly CompileError[];
    compiledPortMap?: Map<string, Artifact>;
  }

  type TimeModel =
    | { kind: 'finite'; durationMs: number; cuePoints?: CuePoint[] }
    | { kind: 'cyclic'; periodMs: number; mode?: 'loop' | 'pingpong' }
    | { kind: 'infinite'; windowMs: number };

  Diagnostics

  File: src/editor/compiler/types.ts

  interface CompileError {
    code: string;  // 'MultipleWriters', 'PortTypeMismatch', 'CycleDetected', etc.
    message: string;
    where?: { blockId?: string; port?: string; connection?: CompilerConnection };
  }

  - Surfaced via CompileResult.errors
  - Incremental: NOT FOUND - Always full compile

  ---
  4) Runtime/player integration points

  Player Time Model

  File: src/editor/runtime/player.ts

  export class Player {
    private tMs = 0;              // Current time (never wraps in player)
    private timeModel: TimeModel | null = null;
    private speed = 1.0;
    private loopMode: LoopMode = 'loop';  // @deprecated

    applyTimeModel(model: TimeModel): void;
    setFactory(factory: ProgramFactory<RenderTree>): void;
  }

  Key invariant (stated at line 9-13):
  "Time is an input, not integrated state. Programs can be swapped without resetting time."

  Program Evaluation

  File: src/editor/runtime/player.ts:578-587

  private renderOnce(): void {
    if (!this.program) return;
    const tree = this.program.signal(this.tMs, this.runtimeCtx);
    this.onFrame(tree, this.tMs);
  }

  RuntimeCtx shape:
  interface RuntimeCtx {
    viewport: { w: number; h: number; dpr: number };
  }

  Debug/Inspection Channel

  File: src/editor/runtime/player.ts:619-652

  private emitHealthSnapshot(nowMs: number): void {
    this.events.emit({
      type: 'RuntimeHealthSnapshot',
      patchId: 'patch',
      activePatchRevision: this.activePatchRevision,
      tMs: this.tMs,
      frameBudget: { fpsEstimate, avgFrameMs, worstFrameMs },
      evalStats: { nanCount, infCount, fieldMaterializations: 0 },
    });
  }

  ---
  5) Current UI dependency on stores and patch structure

  PatchBay

  File: src/editor/PatchBay.tsx

  Reads:
  - store.patchStore.lanes (line 602)
  - store.patchStore.blocks (line 548)
  - store.patchStore.connections (line 273, 587)
  - store.uiStore.uiState.selectedBlockId
  - store.uiStore.uiState.hoveredPort
  - store.uiStore.uiState.selectedPort
  - store.uiStore.uiState.activeLaneId
  - store.uiStore.uiState.draggingLaneKind

  Calls:
  - store.uiStore.selectBlock(blockId)
  - store.uiStore.setHoveredPort(port)
  - store.uiStore.setSelectedPort(port)
  - store.uiStore.setActiveLane(laneId)
  - store.patchStore.toggleLaneCollapsed(laneId)

  Layout assumptions: Lanes are horizontal rows, blocks arranged left-to-right within lanes

  Inspector

  File: src/editor/Inspector.tsx

  Reads:
  - store.selectedBlock (computed from patchStore.blocks + uiStore.selectedBlockId)
  - store.selectedPortInfo (computed)
  - store.uiStore.previewedDefinition
  - store.patchStore.connections
  - store.patchStore.blocks
  - store.busStore.publishers
  - store.busStore.listeners

  Calls:
  - store.patchStore.connect()
  - store.patchStore.disconnect()
  - store.patchStore.addBlock()
  - store.patchStore.removeBlock()
  - store.patchStore.updateBlockParams()
  - store.uiStore.selectBlock()
  - store.uiStore.setSelectedPort()
  - store.uiStore.setHoveredPort()

  PreviewPanel

  File: src/editor/PreviewPanel.tsx

  Reads:
  - store.uiStore.settings.speed
  - store.uiStore.settings.seed
  - store.uiStore.settings.finiteLoopMode
  - store.patchStore.patchRevision

  Calls:
  - store.uiStore.setPlaying()
  - store.uiStore.setSpeed()
  - store.uiStore.setSeed()
  - store.uiStore.setFiniteLoopMode()

  ---
  6) Existing layout/positioning data

  Lane-based layout

  File: src/editor/types.ts:565-596

  export interface Lane {
    readonly id: LaneId;
    readonly kind: LaneKind;        // 'Scene' | 'Phase' | 'Fields' | 'Scalars' | 'Spec' | 'Program' | 'Output'
    label: string;
    description: string;
    flavor?: LaneFlavor;            // 'Timing' | 'Style' | 'Motion' | 'General'
    flowStyle: LaneFlowStyle;       // 'chain' | 'patchbay'
    blockIds: BlockId[];            // ORDER MATTERS - left-to-right position
    collapsed: boolean;
    pinned: boolean;
  }

  Block position is lane index + order in blockIds array.

  - x/y coordinates: NOT FOUND - Blocks don't store explicit coordinates
  - Ordering keys: Implicit in lane.blockIds array order
  - Graph grouping: NOT FOUND - No grouping information

  ---
  7) Undo/redo and persistence reality

  Undo/Redo

  NOT FOUND - No undo/redo implementation exists. Searched for:
  - undo, redo, history, command, transaction
  - No command pattern or op log

  Persistence

  Path Library only: src/editor/pathLibrary/storage.ts

  const STORAGE_KEY = 'loom99-path-library';

  export function saveLibrary(state): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  export function loadLibrary(): PathLibraryState | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return JSON.parse(raw);
  }

  Patch persistence: NOT FOUND
  - No savePatch() or loadPatch() found
  - No URL hash serialization
  - No file save/load
  - Patches appear to be ephemeral

  Patch Format

  - JSON-serializable Patch interface
  - Version field for migrations: version: number
  - Feature flags: features?: { buses?: boolean }

  ---
  8) Constraints and "do not break" invariants (as implemented)

  One writer per input

  File: src/editor/compiler/compile.ts:99-107

  for (const [toKey, conns] of incoming.entries()) {
    if (conns.length > 1) {
      errors.push({
        code: 'MultipleWriters',
        message: `Input port has multiple incoming connections: ${toKey}`,
      });
    }
  }

  Enforced at: Compile time only (UI allows creating multiple connections)

  Type compatibility

  File: src/editor/compiler/compile.ts:480-503

  export function isPortTypeAssignable(from: PortType, to: PortType): boolean {
    if (from.kind === to.kind) return true;

    const compatibleSets: string[][] = [
      ['Field:Point', 'Field:vec2'],
      ['Render', 'RenderTree', 'RenderTreeProgram'],
      // ...
    ];
    // ...
  }

  Enforced at: Compile time (not at wire creation)

  Cycle detection

  File: src/editor/compiler/compile.ts:555-606

  export function topoSortBlocks(patch, errors): readonly BlockId[] {
    // Kahn's algorithm
    if (out.length !== ids.length) {
      errors.push({ code: 'CycleDetected', message: 'Cycle detected in patch graph.' });
    }
  }

  Enforced at: Compile time

  TimeRoot constraint (optional)

  File: src/editor/compiler/compile.ts:345-370

  export function validateTimeRootConstraint(patch): CompileError[] {
    const flags = getFeatureFlags();
    if (!flags.requireTimeRoot) return []; // Skip validation in legacy mode

    if (timeRootBlocks.length === 0) {
      errors.push({ code: 'MissingTimeRoot', message: '...' });
    }
    if (timeRootBlocks.length > 1) {
      errors.push({ code: 'MultipleTimeRoots', message: '...' });
    }
  }

  Enforced at: Compile time, only when feature flag enabled

  Deterministic publisher ordering

  File: src/editor/types.ts:144 (Bus), src/editor/stores/BusStore.ts:499-503

  getPublishersByBus(busId: string): Publisher[] {
    return this.publishers
      .filter(p => p.busId === busId)
      .sort((a, b) => a.sortKey - b.sortKey);
  }

  Enforced at: Query time via sortKey

  Macro expansion constraint

  File: src/editor/stores/PatchStore.ts:273-274

  if (type.startsWith('macro:')) {
    throw new Error(`Cannot add macro block "${type}" directly. Macros must have an expansion in MACRO_REGISTRY.`);
  }

  Enforced at: Block add time - macros MUST expand

  ---
  Summary of Key Findings for Multi-UI Architecture

  1. Single source of truth: PatchStore holds blocks, connections, lanes. BusStore holds buses, publishers, listeners.
  2. Layout is lane-based: Blocks have no x/y coordinates - position is derived from lane membership and array order.
  3. No undo/redo: Would need to be added for multi-UI system.
  4. No patch persistence: Currently ephemeral - would need serialization for multi-UI state sync.
  5. Event system exists: EventDispatcher with typed events - can be extended for UI coordination.
  6. Invariants enforced at compile time: One-writer, type compatibility, cycles - UI doesn't prevent invalid states.
  7. ID stability: UUIDs/prefix-incrementing IDs, stable after creation.
  8. Competing type definitions: Editor types vs Compiler types need mapping during compilation.
