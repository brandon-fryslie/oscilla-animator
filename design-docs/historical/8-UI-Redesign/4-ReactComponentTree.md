1 of 3: React UI component hierarchy and contracts

Structured Graph Board + Enforced Proximity + Short Connectors
(Complete, rigorous, long-term practical)

This is a component-level architecture and prop/state contract suitable for implementation. It assumes React + MobX (your current stack), HTML for blocks, SVG overlay for connectors, and a deterministic layout engine.

⸻

A. Top-level tree and navigation

A1. <EditorApp />

Responsibility: app shell; routes between Root View and Graph View; hosts global stores.

Props: none (reads stores).

Uses stores:
	•	editorStore (patch, graphs, blocks, bindings)
	•	uiStore (viewport, focus, hover, density, navigation)
	•	runtimeStore (player state; optional)

Renders:
	•	<RootView /> when uiStore.nav.level === 'root'
	•	<GraphView graphId=... /> when uiStore.nav.level === 'graph'

⸻

A2. uiStore.nav

Navigation state is explicit; no implicit route derived from selection.

type NavState =
  | { level: 'root' }
  | { level: 'graph'; graphId: string; breadcrumb: string[] };

Actions:
	•	enterGraph(graphId)
	•	exitToRoot()
	•	renameGraph(graphId, name)
	•	createGraphFromTemplate(templateId)

⸻

B. Root View (graph overview)

B1. <RootView />

Responsibility: show all graphs as cards; create/duplicate/delete; enter graph.

Renders:
	•	<GraphCardGrid graphs=[...] />
	•	<CreateGraphButton /> + <GraphTemplateChooserModal />

RootView data dependencies
	•	editorStore.patch.graphs
	•	derived status per graph:
	•	graphDiagnostics summary
	•	timeModel summary (finite duration or infinite)
	•	bus interaction summary (top N touched buses)

⸻

B2. <GraphCardGrid />

Props:

{
  graphs: GraphSummary[];
  onEnter(graphId): void;
  onContextMenu(graphId, anchorEl): void;
}

B3. <GraphCard />

Shows:
	•	Name
	•	Status badges
	•	Bus interaction chips
	•	Optional preview thumbnail

Interactions:
	•	click: onEnter
	•	context menu: rename/duplicate/delete/mute

⸻

C. Graph View (single graph editing)

C1. <GraphView graphId />

Responsibility: the main 3-pane editor:
	1.	Breadcrumb bar
	2.	Board (structured graph)
	3.	Inspector + Bus Board

Renders:
	•	<BreadcrumbBar />
	•	<GraphWorkspace />
	•	<InspectorPanel />
	•	<BusBoard />

GraphView owns no local state; reads and writes via stores.

⸻

C2. <BreadcrumbBar />

Props:

{
  path: string[]; // ["Patch", graphName]
  onBack(): void; // exitToRoot
}

Also includes:
	•	Graph-level diagnostics icon (opens diagnostics drawer)
	•	Optional “Overview density” toggle (forces density mode)

⸻

D. GraphWorkspace: viewport + board + overlay

D1. <GraphWorkspace graphId />

Responsibility:
	•	owns viewport (pan/zoom)
	•	computes derived layout
	•	renders blocks layer + connectors overlay
	•	provides event delegation for hover/focus/selection

Subcomponents:
	•	<ViewportSurface /> (handles pan/zoom)
	•	<BoardScene /> (blocks)
	•	<ConnectorOverlay /> (SVG)
	•	<BoardHUD /> (zoom-to-fit, minimap, mode chips)
	•	<ContextMenus /> (port menus etc.)

D1.1 Derived layout computation

GraphWorkspace calls a pure layout function:

const layout = useMemo(
  () => layoutEngine.compute(graph, uiStore.boardViewState),
  [graph.versionToken, uiStore.boardViewState.key]
);

Important: graph.versionToken increments for any structural change.
Layout should not recompute due to unrelated UI changes.

⸻

D2. <ViewportSurface />

Responsibility: apply pan/zoom transforms; coordinate conversion utilities.

Props:

{
  viewport: ViewportState;
  onViewportChange(next: ViewportState): void;
  onZoomToFit(bounds: Rect): void;
  children: ReactNode;
}

Implementation details:
	•	Wraps a div with transform: translate(panX, panY) scale(zoom)
	•	Provides screenToWorld, worldToScreen helpers via context.

Events:
	•	wheel zoom (zoom-to-cursor)
	•	drag pan
	•	keyboard shortcuts: F zoom-to-fit, Esc clear focus, Cmd+/ trace tool toggle, etc.

⸻

D3. <BoardScene />

Responsibility: render blocks at computed positions. No edges.

Props:

{
  layout: LayoutResult; // nodes with positions, sizes, role, cluster
  graphId: string;
}

Renders:
	•	<BlockLayer /> containing <BlockView /> for each block (virtualized if needed)

⸻

D4. <ConnectorOverlay />

Responsibility: render only short connectors for direct bindings that qualify.

Props:

{
  layout: LayoutResult;
  connectorModel: ConnectorModel; // derived: which edges are short/visible
  emphasis: EmphasisState;        // hover/focus highlight info
}

Uses:
	•	SVG overlay sized to world bounds, same viewport transform
	•	pointer-events: none on paths

Renders:
	•	<DirectArrowPath /> for each visible short edge
	•	<GlowTrace /> when hovering a port/block (transient)

⸻

D5. <BoardHUD />

Responsibility: always-available controls (no toolbars inside blocks).

Contents:
	•	Zoom controls (+, -, fit)
	•	Density indicator (overview/normal/detail)
	•	Optional minimap toggle
	•	Trace tool toggle (optional but recommended)

⸻

E. Block rendering and interaction

E1. <BlockView blockId />

Responsibility: render a single block with collapsed/hover/focus states.

Props:

{
  blockId: BlockId;
  node: LayoutNodeView; // x,y,w,h, role, depth, cluster
  state: {
    isHovered: boolean;
    isFocused: boolean;
    isDimmed: boolean; // due to focus elsewhere
  };
}

Renders:
	•	<BlockChrome /> (title, badges)
	•	<BlockSummaryRow /> (collapsed param summary + bus chips)
	•	<PortRailInputs /> (visible on hover/focus)
	•	<PortRailOutputs /> (visible on hover/focus)

E1.1 Collapsed summary row rules

Collapsed always shows:
	•	Block name
	•	critical params (predefined list per block type)
	•	error badge if any
	•	bus publish/subscribe chips (condensed)

⸻

E2. <PortRailInputs /> and <PortRailOutputs />

Props:

{
  blockId: BlockId;
  ports: PortViewModel[];
  mode: 'collapsed'|'expanded'; // based on hover/focus/density
}

PortViewModel includes:

{
  portId: PortId;
  label: string;
  typeDesc: TypeDesc;
  binding: PortBindingVM; // unbound | direct | bus
  glowState: 'none'|'needsInput'|'hot' // derived
}


⸻

E3. <PortWidget /> (the most important component)

This is the inline control + binding chip UI. It replaces wiring UX.

Props:

{
  portRef: { blockId; portId };
  direction: 'input'|'output';
  typeDesc: TypeDesc;
  binding: PortBindingVM;
  glowState: GlowState;
}

E3.1 Binding VM shapes

type PortBindingVM =
  | { kind: 'unbound'; suggestedActions: SuggestedAction[] }
  | { kind: 'inlineLiteral'; value: JSONValue; editor: LiteralEditorKind }
  | { kind: 'bus'; busId: string; busName: string; lensChain: LensStepVM[]; canEdit: true }
  | { kind: 'direct'; from: { blockId: string; blockName: string; portId: string }; canConvertToBus: true };

E3.2 Interactions (input ports)
	•	Click unbound → opens <TypedChooserPopover />
	•	Click bus chip → opens <BindingEditorPopover />
	•	Click direct chip → opens <DirectSourcePopover /> (jump/convert)
	•	Detach inline literal (if shown) → “Spawn block” action

E3.3 Interactions (output ports)
	•	If publishing → chip opens publisher editor (mute, order, bus selection)
	•	If direct consumers exist → chip opens consumer list + jump to consumers

⸻

F. Typed Chooser and preview simulation

F1. <TypedChooserPopover />

Anchor: an input port.

Props:

{
  portRef: { blockId; portId };
  expectedType: TypeDesc;
  candidates: CandidateGroup[];
  onSelect(candidateId): void;
  onPreview(candidateId | null): void;
}

F1.1 Candidate groups (required)
	•	Inline literal (if possible)
	•	Bind to bus (bus picker)
	•	Operators (pure blocks)
	•	Dynamics/state helpers (if applicable)
	•	Composites (library)

F1.2 Preview behavior

Hover candidate:
	•	triggers a simulation in an isolated “what-if” patch snapshot
	•	returns:
	•	affected blocks list
	•	predicted resulting render thumbnail or “likely change” summary
	•	shows preview panel inline (right side of popover)

Hard rule: preview must never mutate the real patch.

⸻

G. Bus Board and bus focus mode

G1. <BusBoard />

Responsibility: list buses; allow focus; show counts; manage combine/silent values.

Props:

{
  graphId: string; // for highlighting involvement within this graph
}

Renders:
	•	<BusRow busId /> virtualized

⸻

G2. <BusRow />

Shows:
	•	name (editable)
	•	type badge
	•	combine mode dropdown
	•	silent value control (type-specific)
	•	publishers/subscribers counts
	•	small live viz (sparkline for signal, swatch for color, etc.)

Interactions:
	•	click row → uiStore.focusBus(busId)
	•	context menu: rename, duplicate, delete, hide (UI grouping)

⸻

G3. Focus/Emphasis system

H1. EmphasisState computed centrally

type EmphasisState = {
  mode: 'none'|'blockFocus'|'busFocus'|'hover';
  focusedBlockId?: string;
  focusedBusId?: string;
  highlightedBlockIds: Set<string>;
  highlightedPortRefs: Set<string>; // `${blockId}:${portId}`
  connectorGlowEdges: Set<string>;  // edge ids
}

This drives:
	•	dimming unrelated blocks
	•	connector glow traces
	•	expanding chips in focused scope

⸻

H. Inspector Panel (block/bus/graph)

H1. <InspectorPanel />

Three modes:
	•	Graph mode (nothing focused)
	•	Block mode (block focused)
	•	Bus mode (bus focused)

H1.1 Block mode requirements
	•	full param editors
	•	“Swap block implementation” section:
	•	shows compatible alternatives
	•	swap preserves bindings where type-compatible
	•	“Dependencies” section:
	•	upstream blocks list (direct + bus)
	•	downstream list
	•	jump actions
	•	“Diagnostics” section

H1.2 Bus mode requirements
	•	combine mode
	•	silent value
	•	publisher list sorted by sortKey
	•	per-publisher mute/solo
	•	subscriber list
	•	“go to” buttons (scrolls board + focuses target)

⸻

I. Selection model

Even if users can’t move blocks, selection still matters for:
	•	deletion
	•	duplication
	•	grouping/organization
	•	bulk edits (mute, bypass lens, etc.)

I1. SelectionStore

type Selection =
  | { kind: 'none' }
  | { kind: 'block'; ids: string[] }
  | { kind: 'bus'; id: string }
  | { kind: 'port'; ref: {blockId; portId} };

Actions:
	•	selectBlock(id, additive)
	•	selectBlocks(ids)
	•	selectBus(id)
	•	clearSelection()

⸻

J. Rendering and virtualization strategy (practical long-term)

As graphs grow:
	•	blocks list becomes long
	•	DOM size must be controlled

J1. Virtualize by vertical list lanes (but not user-visible lanes)

Even though lanes are removed conceptually, your layout is still columnar. You can virtualize blocks within each column:
	•	Each column is a scrollable area inside the viewport transform OR
	•	More simply: render blocks within visible world bounds (culling)

Preferred: culling by viewport rect:
	•	compute visible world rect from viewport
	•	render only nodes whose bbox intersects that rect
	•	same for connectors

This keeps the board snappy without changing UX.

⸻

K. Event wiring (for engineer clarity)

The board should not do ad-hoc cross-component calling. Use your typed event system.

Examples of events:
	•	port.clicked (payload: portRef)
	•	port.bindingChanged
	•	bus.focused
	•	block.focused
	•	chooser.previewRequested
	•	chooser.selected

Inspector and Board subscribe to events and update stores accordingly.

⸻

L. Implementation ordering (still within this spec)

Even though you didn’t ask for roadmap here, the hierarchy implies a safe build order:
	1.	RootView + navigation
	2.	GraphView skeleton + viewport
	3.	Layout engine + BlockView rendering at positions
	4.	PortWidget + binding chips (no wires)
	5.	BusBoard + focus highlighting
	6.	Direct connectors overlay (short arrows only)
	7.	Typed chooser + preview simulation
	8.	Inspector swap + dependency lists

⸻

If you say Next, I will provide (2 of 3): the exact layout function pseudocode with tie-breakers, thresholds, SCC handling, and proximity enforcement rules—fully deterministic and implementable.