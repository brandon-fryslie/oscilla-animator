# Project Roadmap: UI Redesign

Last updated: 2025-12-27-120000

> **Philosophy:** Graph-Navigation, Bus-First, No-Edges Architecture.
> Users never place blocks manually. Users never draw edges. All layout is deterministic.
> The editor optimizes for exploration, substitution, and understanding — not diagramming.

---

## Document-to-Topic Mapping

Reference: `design-docs/8-UI-Redesign/`

| Doc | Title | Topics |
|-----|-------|--------|
| 0.1-Time | Time Architecture | time-lens, master-time-root |
| 1-ReDesignSpec | Canonical Design Spec | All phases (guiding principles) |
| 2-Corrections | Enforced Proximity | short-connectors, layout-rules |
| 3-Low-Level | (Empty - Placeholder) | - |
| 4-ReactComponentTree | Component Hierarchy (1 of 3) | All React components |
| 5-NewUIRules-2of3 | Layout Engine (2 of 3) | layout-engine, deterministic-layout |
| 6-Making-it-not-suck-3of3 | Binding Policy (3 of 3) | binding-policy, direct-vs-bus |
| 7-InteractionSpec | Event Flow Spec | mutation-controller, event-taxonomy |

---

## Phase 1: Foundation & Stores [PROPOSED]

**Goal:** Build the UI state management layer. MobX stores for navigation, viewport, focus, emphasis, selection.

**Migration Safety:** Pure state definitions - existing rendering unaffected initially.

### Topics

#### nav-store [PROPOSED]
**Description:** Implement `uiStore.nav` with two navigation states: Root View and Graph View. Actions: `enterGraph(graphId)`, `exitToRoot()`, `renameGraph()`, `createGraphFromTemplate()`.
**Spec:** 4-ReactComponentTree (§A2)
**Dependencies:** None
**Labels:** architecture, state, navigation
**Test Strategy:** Navigation state transitions correct, breadcrumb updates
**Acceptance Criteria:**
- [ ] NavState type: `{ level: 'root' }` | `{ level: 'graph'; graphId: string; breadcrumb: string[] }`
- [ ] All navigation actions implemented
- [ ] No implicit routing derived from selection

#### viewport-store [PROPOSED]
**Description:** Implement viewport state: pan (x, y), zoom, density mode (overview/normal/detail). Screen↔World coordinate conversion utilities.
**Spec:** 4-ReactComponentTree (§D2)
**Dependencies:** None
**Labels:** architecture, state, viewport
**Test Strategy:** Pan/zoom operations correct, coordinate conversion roundtrips
**Acceptance Criteria:**
- [ ] ViewportState type with pan, zoom, density
- [ ] screenToWorld, worldToScreen utilities
- [ ] Zoom-to-fit calculation

#### focus-emphasis-store [PROPOSED]
**Description:** Implement `EmphasisState` computed centrally: mode (none/blockFocus/busFocus/hover), focusedBlockId, focusedBusId, highlightedBlockIds, highlightedPortRefs, connectorGlowEdges.
**Spec:** 4-ReactComponentTree (§G3)
**Dependencies:** None
**Labels:** architecture, state, focus
**Test Strategy:** Focus changes propagate to emphasis correctly
**Acceptance Criteria:**
- [ ] EmphasisState type complete
- [ ] Dim unrelated blocks when focused
- [ ] Connector glow traces when hovered
- [ ] Only one block focused at a time

#### selection-store [PROPOSED]
**Description:** Implement `SelectionStore` for multi-select: block selection, bus selection, port selection. Actions: selectBlock, selectBlocks, selectBus, clearSelection.
**Spec:** 4-ReactComponentTree (§I)
**Dependencies:** None
**Labels:** architecture, state, selection
**Test Strategy:** Selection operations work correctly, multi-select works with shift
**Acceptance Criteria:**
- [ ] Selection type: none | block (ids) | bus (id) | port (ref)
- [ ] Multi-selection via shift+click
- [ ] Selection persists across view changes

---

## Phase 2: Root View [PROPOSED]

**Goal:** Implement the graph overview - show all graphs as cards with status, allow navigation.

**Migration Safety:** New view alongside existing - can toggle between old/new.

### Topics

#### root-view-shell [PROPOSED]
**Description:** Implement `<RootView />` component: centered vertical list/grid of Graph Cards, create graph button, template chooser modal.
**Spec:** 4-ReactComponentTree (§B1)
**Dependencies:** nav-store
**Labels:** ui, components, root-view
**Test Strategy:** Root view renders all graphs, navigation works
**Acceptance Criteria:**
- [ ] `<RootView />` renders when nav.level === 'root'
- [ ] `<GraphCardGrid />` displays all graphs
- [ ] `<CreateGraphButton />` + `<GraphTemplateChooserModal />`

#### graph-card [PROPOSED]
**Description:** Implement `<GraphCard />` showing: name, status badges (Infinite/Finite/Error/Muted), bus interaction summary (Publishes/Subscribes), optional preview thumbnail.
**Spec:** 4-ReactComponentTree (§B2-B3)
**Dependencies:** root-view-shell
**Labels:** ui, components, cards
**Test Strategy:** Cards show correct status, click navigates
**Acceptance Criteria:**
- [ ] Status badges: ⟳ Infinite, ⏱ Finite (duration), ⚠ Error, ⏸ Muted
- [ ] Bus summary chips: "Publishes: phaseA, energy", "Subscribes: pulse"
- [ ] Click → enterGraph(graphId)
- [ ] Context menu: rename/duplicate/delete/mute

#### graph-derived-status [PROPOSED]
**Description:** Compute derived status for each graph: diagnostics summary, timeModel summary (finite duration or infinite), top N touched buses.
**Spec:** 4-ReactComponentTree (§B1 data dependencies)
**Dependencies:** graph-card
**Labels:** computation, derived-data
**Test Strategy:** Status updates when graph changes
**Acceptance Criteria:**
- [ ] Diagnostics count (error/warning)
- [ ] TimeModel type and duration
- [ ] Bus interaction list

---

## Phase 3: Graph View Shell [PROPOSED]

**Goal:** Implement the main editing surface layout - 3 pane structure with breadcrumb.

**Migration Safety:** Replaces existing editor layout - feature flag to switch.

### Topics

#### graph-view-layout [PROPOSED]
**Description:** Implement `<GraphView graphId />` with 3-pane layout: Breadcrumb bar, GraphWorkspace (main area), Inspector + BusBoard (panels).
**Spec:** 4-ReactComponentTree (§C1)
**Dependencies:** nav-store, viewport-store
**Labels:** ui, components, layout
**Test Strategy:** Layout renders correctly, panels resize properly
**Acceptance Criteria:**
- [ ] `<BreadcrumbBar />` with path and back button
- [ ] `<GraphWorkspace />` fills main area
- [ ] `<InspectorPanel />` and `<BusBoard />` on sides
- [ ] GraphView reads/writes via stores only (no local state)

#### breadcrumb-bar [PROPOSED]
**Description:** Implement `<BreadcrumbBar />` showing path ["Patch", graphName], back button, graph-level diagnostics icon, density toggle.
**Spec:** 4-ReactComponentTree (§C2)
**Dependencies:** nav-store
**Labels:** ui, components, navigation
**Test Strategy:** Breadcrumb reflects current location
**Acceptance Criteria:**
- [ ] Path display with clickable segments
- [ ] Back button (exitToRoot)
- [ ] Diagnostics icon opens drawer
- [ ] Density toggle (overview/normal/detail)

---

## Phase 4: Layout Engine [PROPOSED]

**Goal:** Build the deterministic layout engine - blocks positioned by system, not users.

**Migration Safety:** Pure computation - can validate against expected layouts before using.

### Topics

#### layout-types [PROPOSED]
**Description:** Define layout types: `LayoutResult`, `LayoutNodeView` (x, y, w, h, column, rowKey, role, depth, clusterKey, sccId), `LayoutConnector`, `OverflowLink`.
**Spec:** 5-NewUIRules-2of3 (§0)
**Dependencies:** None
**Labels:** architecture, types, layout
**Test Strategy:** Types compile correctly
**Acceptance Criteria:**
- [ ] LayoutResult with nodes, connectors, overflowLinks, boundsWorld, columns, debug
- [ ] LayoutNodeView with all positioning metadata
- [ ] LayoutConnector for drawable short edges
- [ ] OverflowLink for too-long direct bindings

#### block-sizing [PROPOSED]
**Description:** Implement `measureBlock(block, density, focusState)` returning {w, h, portsVisible}. Fixed sizes per density mode.
**Spec:** 5-NewUIRules-2of3 (§1)
**Dependencies:** layout-types
**Labels:** layout, sizing
**Test Strategy:** Block sizes consistent per density
**Acceptance Criteria:**
- [ ] Overview: compact (w=260, h=36)
- [ ] Normal: medium (w=300, h=56 collapsed)
- [ ] Detail: larger (w=340, h=96)
- [ ] Layout uses collapsed sizes only (hover expansion is overlay)

#### role-column-assignment [PROPOSED]
**Description:** Assign roles and columns: Role from block capability (time/identity/state/render/io) or registry category. Map role→column deterministically.
**Spec:** 5-NewUIRules-2of3 (§2)
**Dependencies:** layout-types
**Labels:** layout, columns
**Test Strategy:** Blocks assigned to correct columns
**Acceptance Criteria:**
- [ ] Column 0: time, identity, io
- [ ] Column 1: state, operator
- [ ] Column 2: render
- [ ] Column 3+: reserved (compositors, debug)

#### dependency-graph-scc [PROPOSED]
**Description:** Build direct dependency graph, run Tarjan SCC, collapse cycles into meta-nodes, compute depth from roots.
**Spec:** 5-NewUIRules-2of3 (§3-4)
**Dependencies:** role-column-assignment
**Labels:** layout, graph-algorithms
**Test Strategy:** SCCs detected correctly, depth computed
**Acceptance Criteria:**
- [ ] sccIdByBlock mapping
- [ ] Meta-node DAG
- [ ] Depth = longest path from root
- [ ] Stable ordering with blockId tie-breaker

#### cluster-key-calculation [PROPOSED]
**Description:** Compute clusterKey per block from bus signature (sorted list of bus references with direction P:/S:). Focus modifier when bus is focused.
**Spec:** 5-NewUIRules-2of3 (§5)
**Dependencies:** dependency-graph-scc
**Labels:** layout, clustering
**Test Strategy:** Cluster keys stable across reloads
**Acceptance Criteria:**
- [ ] Bus signature: "P:phaseA", "S:energy"
- [ ] ClusterKey = role + "|" + hash(busSig)
- [ ] Focus mode: clusterKey = "focusBus:<busId>" or "other"

#### row-ordering [PROPOSED]
**Description:** Compute deterministic row ordering tuple: (column, clusterKey, depth, rolePriority, stableLocalKey). Turn into rowKey string.
**Spec:** 5-NewUIRules-2of3 (§6)
**Dependencies:** cluster-key-calculation
**Labels:** layout, ordering
**Test Strategy:** Same graph produces same order
**Acceptance Criteria:**
- [ ] rolePriority: time < identity < io < state < operator < render
- [ ] stableLocalKey: blockId
- [ ] rowKey for debug display

#### grid-placement [PROPOSED]
**Description:** Initial grid layout: fixed column x positions, y placement within column by rowKey order with cluster gaps.
**Spec:** 5-NewUIRules-2of3 (§7)
**Dependencies:** row-ordering
**Labels:** layout, placement
**Test Strategy:** Blocks don't overlap
**Acceptance Criteria:**
- [ ] Column x = x0 + n * (colWidth + colGap)
- [ ] Y placement with vGap between blocks
- [ ] ClusterGap when clusterKey changes

#### proximity-enforcement [PROPOSED]
**Description:** Enforce proximity for direct bindings: reorder within column to bring consumers near producers. Respect constraints (clusterKey, depth ordering).
**Spec:** 5-NewUIRules-2of3 (§8)
**Dependencies:** grid-placement
**Labels:** layout, proximity
**Test Strategy:** Direct dependencies are adjacent
**Acceptance Criteria:**
- [ ] Lmax threshold (220 world units)
- [ ] Edge priority ordering (focused first)
- [ ] Reorder within constraints only
- [ ] SCC cycle mini-structure layout
- [ ] Stop conditions (budget, no improvement)

#### connector-derivation [PROPOSED]
**Description:** Derive short connectors from final positions: draw if d <= Lmax, emit OverflowLink otherwise. Port anchor calculation.
**Spec:** 5-NewUIRules-2of3 (§9-10)
**Dependencies:** proximity-enforcement
**Labels:** layout, connectors
**Test Strategy:** Connectors match expected lengths
**Acceptance Criteria:**
- [ ] Render connector if d <= Lmax and density != overview
- [ ] OverflowLink with reason: tooLong | densityCollapsed | culled
- [ ] Port positions from registry order

#### layout-stability [PROPOSED]
**Description:** Ensure layout stability: stable ordering keys persist, local insertion policy, animated transitions (FLIP).
**Spec:** 5-NewUIRules-2of3 (§12)
**Dependencies:** connector-derivation
**Labels:** layout, stability
**Test Strategy:** Insert block produces local-only changes
**Acceptance Criteria:**
- [ ] rowKeys stable unless role/cluster/depth changes
- [ ] New blocks placed near consumer
- [ ] UI animates 120-200ms transitions

#### layout-determinism [PROPOSED]
**Description:** Enforce full determinism: stable comparators with blockId tie-breaker, no object iteration order, no randomness, stable SCC ids.
**Spec:** 5-NewUIRules-2of3 (§13)
**Dependencies:** layout-stability
**Labels:** layout, determinism
**Test Strategy:** Same inputs → identical layout across sessions
**Acceptance Criteria:**
- [ ] All sorts use stable comparators
- [ ] No Map/Set iteration order dependency
- [ ] SCC ids from sorted member blockIds

#### layout-debug-overlay [PROPOSED]
**Description:** Debug overlay showing: column boundaries, cluster breaks, depth numbers, edge lengths, overflow edge counts.
**Spec:** 5-NewUIRules-2of3 (§14)
**Dependencies:** layout-determinism
**Labels:** layout, debug
**Test Strategy:** Debug overlay displays all info
**Acceptance Criteria:**
- [ ] layout.debug fields populated
- [ ] Optional overlay component
- [ ] Column/cluster visualization

---

## Phase 5: Board Rendering [PROPOSED]

**Goal:** Render the structured graph board with blocks and short connectors.

**Migration Safety:** New rendering system - can compare output with old system.

### Topics

#### graph-workspace [PROPOSED]
**Description:** Implement `<GraphWorkspace graphId />`: owns viewport, computes layout, renders blocks + connectors + HUD + context menus.
**Spec:** 4-ReactComponentTree (§D1)
**Dependencies:** Phase 4 complete
**Labels:** ui, components, workspace
**Test Strategy:** Workspace renders layout correctly
**Acceptance Criteria:**
- [ ] `<ViewportSurface />` for pan/zoom
- [ ] `<BoardScene />` for blocks
- [ ] `<ConnectorOverlay />` for arrows
- [ ] `<BoardHUD />` for controls
- [ ] Layout recomputes on graph.versionToken change

#### viewport-surface [PROPOSED]
**Description:** Implement `<ViewportSurface />`: CSS transform for pan/zoom, wheel zoom (to cursor), drag pan, keyboard shortcuts (F zoom-to-fit, Esc clear focus).
**Spec:** 4-ReactComponentTree (§D2)
**Dependencies:** viewport-store
**Labels:** ui, components, viewport
**Test Strategy:** Pan/zoom operations smooth and correct
**Acceptance Criteria:**
- [ ] transform: translate(panX, panY) scale(zoom)
- [ ] screenToWorld, worldToScreen context
- [ ] Wheel zoom to cursor position
- [ ] Drag to pan
- [ ] Keyboard shortcuts

#### board-scene [PROPOSED]
**Description:** Implement `<BoardScene />`: render `<BlockView />` for each block at computed positions. Virtualization via viewport culling.
**Spec:** 4-ReactComponentTree (§D3)
**Dependencies:** graph-workspace
**Labels:** ui, components, rendering
**Test Strategy:** All visible blocks render at correct positions
**Acceptance Criteria:**
- [ ] `<BlockLayer />` containing `<BlockView />`s
- [ ] Blocks positioned at layout coordinates
- [ ] Culling by viewport intersection

#### connector-overlay [PROPOSED]
**Description:** Implement `<ConnectorOverlay />`: SVG layer with short arrows for direct bindings. pointer-events: none. Glow traces on hover.
**Spec:** 4-ReactComponentTree (§D4)
**Dependencies:** graph-workspace
**Labels:** ui, components, connectors
**Test Strategy:** Connectors draw between correct ports
**Acceptance Criteria:**
- [ ] SVG overlay same viewport transform
- [ ] `<DirectArrowPath />` for each visible edge
- [ ] `<GlowTrace />` on hover
- [ ] No hit targets on paths

#### board-hud [PROPOSED]
**Description:** Implement `<BoardHUD />`: zoom controls (+, -, fit), density indicator, minimap toggle, trace tool toggle.
**Spec:** 4-ReactComponentTree (§D5)
**Dependencies:** graph-workspace
**Labels:** ui, components, controls
**Test Strategy:** HUD controls work correctly
**Acceptance Criteria:**
- [ ] Zoom in/out/fit buttons
- [ ] Density mode indicator
- [ ] Minimap toggle (optional)
- [ ] Trace tool toggle

---

## Phase 6: Block Rendering [PROPOSED]

**Goal:** Render individual blocks with collapsed/hover/focus states and port widgets.

**Migration Safety:** New block components - can render alongside old for comparison.

### Topics

#### block-view [PROPOSED]
**Description:** Implement `<BlockView blockId />` with states: collapsed (default), hover (expanded), focused (full detail, others dimmed).
**Spec:** 4-ReactComponentTree (§E1)
**Dependencies:** focus-emphasis-store
**Labels:** ui, components, blocks
**Test Strategy:** Block states render correctly
**Acceptance Criteria:**
- [ ] Props: blockId, node (position), state (hovered, focused, dimmed)
- [ ] `<BlockChrome />` (title, badges)
- [ ] `<BlockSummaryRow />` (collapsed params + bus chips)
- [ ] `<PortRailInputs />` + `<PortRailOutputs />` on hover/focus

#### block-summary-row [PROPOSED]
**Description:** Collapsed summary showing: block name, critical params (per block type), error badge, bus publish/subscribe chips.
**Spec:** 4-ReactComponentTree (§E1.1)
**Dependencies:** block-view
**Labels:** ui, components, blocks
**Test Strategy:** Summary shows key info
**Acceptance Criteria:**
- [ ] Block name always visible
- [ ] Critical params predefined per block type
- [ ] Error badge if diagnostics
- [ ] Condensed bus chips

#### port-rails [PROPOSED]
**Description:** Implement `<PortRailInputs />` and `<PortRailOutputs />`: list ports with labels, types, bindings, glow states. Collapsed/expanded modes.
**Spec:** 4-ReactComponentTree (§E2)
**Dependencies:** block-view
**Labels:** ui, components, ports
**Test Strategy:** Ports show correct bindings
**Acceptance Criteria:**
- [ ] PortViewModel: portId, label, typeDesc, binding, glowState
- [ ] GlowState: none | needsInput | hot
- [ ] Mode: collapsed | expanded

#### port-widget [PROPOSED]
**Description:** Implement `<PortWidget />`: inline control + binding chip. The most important component - replaces wiring UX.
**Spec:** 4-ReactComponentTree (§E3)
**Dependencies:** port-rails
**Labels:** ui, components, ports, critical
**Test Strategy:** Port widget handles all binding types
**Acceptance Criteria:**
- [ ] PortBindingVM: unbound | inlineLiteral | bus | direct
- [ ] Input port clicks: unbound→chooser, bus→editor, direct→popover
- [ ] Output port: publisher editor, consumer list
- [ ] Detach inline literal → spawn block

---

## Phase 7: Bus Board & Inspector [PROPOSED]

**Goal:** Implement the side panels for bus management and block/bus inspection.

**Migration Safety:** New panels - can show alongside existing inspector.

### Topics

#### bus-board [PROPOSED]
**Description:** Implement `<BusBoard />`: vertical list of buses, show name, type, combine mode, silent value, publisher/subscriber counts, live viz.
**Spec:** 4-ReactComponentTree (§G1-G2)
**Dependencies:** focus-emphasis-store
**Labels:** ui, components, buses
**Test Strategy:** Bus board reflects all buses
**Acceptance Criteria:**
- [ ] `<BusRow />` virtualized
- [ ] Name (editable), type badge
- [ ] Combine mode dropdown
- [ ] Silent value control
- [ ] Publisher/subscriber counts
- [ ] Sparkline/swatch live viz

#### bus-focus-mode [PROPOSED]
**Description:** Click bus → focus mode: dim unrelated blocks, highlight publishers/subscribers, expand binding chips.
**Spec:** 4-ReactComponentTree (§G3)
**Dependencies:** bus-board, focus-emphasis-store
**Labels:** ui, interaction, focus
**Test Strategy:** Bus focus shows related blocks only
**Acceptance Criteria:**
- [ ] uiStore.focusBus(busId)
- [ ] highlightedBlockIds computed
- [ ] Connector glow for bus bindings

#### inspector-panel [PROPOSED]
**Description:** Implement `<InspectorPanel />` with three modes: Graph (nothing focused), Block (block focused), Bus (bus focused).
**Spec:** 4-ReactComponentTree (§H1)
**Dependencies:** focus-emphasis-store
**Labels:** ui, components, inspector
**Test Strategy:** Inspector shows correct mode
**Acceptance Criteria:**
- [ ] Mode detection from focus state
- [ ] Smooth transitions between modes

#### inspector-block-mode [PROPOSED]
**Description:** Block inspector: full param editors, swap block implementation section, dependencies section (upstream/downstream), diagnostics.
**Spec:** 4-ReactComponentTree (§H1.1)
**Dependencies:** inspector-panel
**Labels:** ui, components, inspector
**Test Strategy:** Block inspector shows all sections
**Acceptance Criteria:**
- [ ] Full param editors
- [ ] "Swap block..." with compatible alternatives
- [ ] Dependencies: upstream (direct + bus), downstream
- [ ] Jump actions
- [ ] Diagnostics section

#### inspector-bus-mode [PROPOSED]
**Description:** Bus inspector: combine mode, silent value, publisher list (sorted by sortKey), per-publisher mute/solo, subscriber list, "go to" buttons.
**Spec:** 4-ReactComponentTree (§H1.2)
**Dependencies:** inspector-panel
**Labels:** ui, components, inspector
**Test Strategy:** Bus inspector shows all bindings
**Acceptance Criteria:**
- [ ] Combine mode control
- [ ] Silent value control
- [ ] Publisher list with mute/solo
- [ ] Subscriber list
- [ ] "Go to" scrolls board + focuses

---

## Phase 8: Typed Chooser & Binding [PROPOSED]

**Goal:** Implement the type-aware block chooser and binding system - the primary way to build patches.

**Migration Safety:** New interaction system - can coexist with old block palette.

### Topics

#### typed-chooser-popover [PROPOSED]
**Description:** Implement `<TypedChooserPopover />` anchored to input port: shows compatible candidates grouped by intent (inline literal, bind bus, operators, composites).
**Spec:** 4-ReactComponentTree (§F1)
**Dependencies:** port-widget
**Labels:** ui, components, chooser
**Test Strategy:** Chooser shows only compatible blocks
**Acceptance Criteria:**
- [ ] Props: portRef, expectedType, candidates, onSelect, onPreview
- [ ] Groups: Inline literal, Bind to Bus, Operators, Dynamics, Composites
- [ ] Type filtering

#### candidate-preview [PROPOSED]
**Description:** Hover candidate in chooser → simulation preview in isolated patch snapshot. Shows affected blocks, predicted result, swap compatibility.
**Spec:** 4-ReactComponentTree (§F1.2)
**Dependencies:** typed-chooser-popover
**Labels:** ui, preview, simulation
**Test Strategy:** Preview shows expected change
**Acceptance Criteria:**
- [ ] Isolated simulation (no patch mutation)
- [ ] Affected blocks list
- [ ] Result thumbnail or change summary
- [ ] Preview panel in popover

#### binding-editor-popover [PROPOSED]
**Description:** Click bus binding chip → edit lens chain, change bus, mute/bypass, jump to source/consumers.
**Spec:** 1-ReDesignSpec (§7.3)
**Dependencies:** port-widget
**Labels:** ui, components, binding
**Test Strategy:** Binding editor works for all cases
**Acceptance Criteria:**
- [ ] Change bus selection
- [ ] Lens chain editor
- [ ] Mute/bypass toggle
- [ ] Jump to source/consumers

#### lens-editor [PROPOSED]
**Description:** Lens chain editor: ordered steps, reorderable, type evolution display (phase→unit→number), heavy step acknowledgment.
**Spec:** 6-Making-it-not-suck-3of3 (§8.2-8.3)
**Dependencies:** binding-editor-popover
**Labels:** ui, components, lenses
**Test Strategy:** Lens chain edits work correctly
**Acceptance Criteria:**
- [ ] Steps ordered and reorderable
- [ ] fromTypeDesc, toTypeDesc per step
- [ ] Type evolution display
- [ ] Heavy steps require explicit accept
- [ ] Auto-suggest single best path

---

## Phase 9: Binding Policy & Mutation [PROPOSED]

**Goal:** Implement the binding policy engine and mutation controller - the "anti-spaghetti" system.

**Migration Safety:** Policy layer on top of existing model - validates before applying.

### Topics

#### binding-policy-engine [PROPOSED]
**Description:** Implement `PolicyEngine.canDirectBind(from, to, prospectiveLayout)` with domain rules: signal→signal, scalar→signal, signal→field (needs lift), field→signal (needs reduce).
**Spec:** 6-Making-it-not-suck-3of3 (§4)
**Dependencies:** Phase 4 complete (layout)
**Labels:** policy, binding, rules
**Test Strategy:** Policy rejects invalid bindings
**Acceptance Criteria:**
- [ ] Direct binding invariants: single-writer, single-hop, short, same-graph, same-cluster
- [ ] Domain-specific rules (§4.2 matrix)
- [ ] signal→field requires explicit lift
- [ ] field→signal requires explicit reduce (flagged heavy)

#### no-long-edges-enforcement [PROPOSED]
**Description:** When direct binding would be too long: propose bus binding instead, auto-suggest bus name, or create new bus.
**Spec:** 6-Making-it-not-suck-3of3 (§6)
**Dependencies:** binding-policy-engine
**Labels:** policy, enforcement
**Test Strategy:** Long edges automatically converted to bus
**Acceptance Criteria:**
- [ ] Compute prospective connector length
- [ ] If d > Lmax: direct not allowed
- [ ] Auto-propose bus binding
- [ ] Suggest existing bus or create new

#### mutation-controller [PROPOSED]
**Description:** Implement `MutationController.dispatch(event)` → single atomic transaction. All mutations through this path only.
**Spec:** 7-InteractionSpec (§0, §13)
**Dependencies:** binding-policy-engine
**Labels:** architecture, mutation, transactions
**Test Strategy:** All mutations are atomic and undoable
**Acceptance Criteria:**
- [ ] Single place for policy enforcement
- [ ] Atomic transactions (no partial states)
- [ ] tx.begin, apply ops, tx.commit pattern
- [ ] Visual feedback within 16ms

#### binding-planner [PROPOSED]
**Description:** Implement `BindingPlanner.planBusBinding(busType, portType)` → lens chain. No implicit conversions.
**Spec:** 7-InteractionSpec (§3, §9)
**Dependencies:** mutation-controller
**Labels:** binding, planning, lenses
**Test Strategy:** Planner produces valid lens chains
**Acceptance Criteria:**
- [ ] Compute best lens chain
- [ ] No implicit conversion
- [ ] Heavy steps flagged
- [ ] User confirmation for heavy

#### convert-direct-to-bus [PROPOSED]
**Description:** User action: click direct chip → "Convert to Bus..." → creates bus, publisher, listener, removes direct binding.
**Spec:** 7-InteractionSpec (§6)
**Dependencies:** mutation-controller
**Labels:** ui, mutation, conversion
**Test Strategy:** Conversion works correctly
**Acceptance Criteria:**
- [ ] Auto-suggest bus name from port semantics
- [ ] Single transaction
- [ ] Direct connector disappears
- [ ] Bus chips appear

#### convert-bus-to-direct [PROPOSED]
**Description:** Rare action: convert bus→direct only if exactly one publisher, one subscriber, passthrough combine, and within Lmax.
**Spec:** 7-InteractionSpec (§7)
**Dependencies:** mutation-controller
**Labels:** ui, mutation, conversion
**Test Strategy:** Preconditions enforced correctly
**Acceptance Criteria:**
- [ ] All preconditions checked
- [ ] Option hidden if preconditions fail
- [ ] Single transaction

#### auto-forced-conversion [PROPOSED]
**Description:** After any direct binding change, auto-convert to bus if would exceed Lmax. Happens inside same transaction (never visible "blink").
**Spec:** 7-InteractionSpec (§10)
**Dependencies:** mutation-controller, no-long-edges-enforcement
**Labels:** policy, auto-conversion
**Test Strategy:** No long edges ever appear
**Acceptance Criteria:**
- [ ] Prospective layout computed
- [ ] If direct invalid: replace with bus ops before commit
- [ ] No visible "blink" of invalid state

---

## Phase 10: Event Flow & Interactions [PROPOSED]

**Goal:** Implement the complete event taxonomy and interaction flows.

**Migration Safety:** New event system - can log and validate before applying.

### Topics

#### event-taxonomy [PROPOSED]
**Description:** Define all typed events: port.clicked, port.bindingChanged, bus.focused, block.focused, chooser.previewRequested, chooser.selected, etc.
**Spec:** 7-InteractionSpec (§K)
**Dependencies:** None
**Labels:** architecture, events, types
**Test Strategy:** All events defined and typed
**Acceptance Criteria:**
- [ ] UI emits events (pure intent)
- [ ] Controller translates to transactions
- [ ] Store applies ops (undoable)

#### bind-unbound-port-flow [PROPOSED]
**Description:** Complete flow: click unbound port → chooser opens → select candidate → controller decides binding style → transaction commits.
**Spec:** 7-InteractionSpec (§1)
**Dependencies:** mutation-controller, typed-chooser-popover
**Labels:** ui, flow, binding
**Test Strategy:** Full bind flow works end-to-end
**Acceptance Criteria:**
- [ ] Port active state on click
- [ ] Chooser opens with candidates
- [ ] Preview on hover
- [ ] Selection triggers transaction

#### inline-literal-binding [PROPOSED]
**Description:** Outcome A: port type supports literal → show inline widget (slider/field/etc).
**Spec:** 7-InteractionSpec (§2)
**Dependencies:** bind-unbound-port-flow
**Labels:** ui, binding, literal
**Test Strategy:** Inline literals work for all types
**Acceptance Criteria:**
- [ ] op.port.setInlineLiteral
- [ ] Appropriate widget per type
- [ ] Undo restores unbound

#### bus-binding-flow [PROPOSED]
**Description:** Outcome B: bind to existing bus with lens chain validation.
**Spec:** 7-InteractionSpec (§3)
**Dependencies:** bind-unbound-port-flow
**Labels:** ui, binding, bus
**Test Strategy:** Bus binding with lenses works
**Acceptance Criteria:**
- [ ] computeBestLensChain
- [ ] Heavy step confirmation
- [ ] Single transaction with all ops

#### create-bus-during-binding [PROPOSED]
**Description:** Outcome C: create new bus when no existing bus selected or direct would be long.
**Spec:** 7-InteractionSpec (§4)
**Dependencies:** bus-binding-flow
**Labels:** ui, binding, bus-creation
**Test Strategy:** New bus created correctly
**Acceptance Criteria:**
- [ ] op.bus.create in same transaction
- [ ] Auto-suggest name
- [ ] Bus appears in BusBoard

#### insert-block-flow [PROPOSED]
**Description:** Outcome D: insert new block to satisfy port → controller decides direct vs bus → single transaction.
**Spec:** 7-InteractionSpec (§5)
**Dependencies:** bind-unbound-port-flow
**Labels:** ui, flow, insertion
**Test Strategy:** Block insertion works correctly
**Acceptance Criteria:**
- [ ] op.block.add with stable ID
- [ ] Placement hint near consumer
- [ ] Auto-wire via direct or bus
- [ ] No partial states

#### swap-block-flow [PROPOSED]
**Description:** Inspector swap: preserve bindings where type-compatible, detach incompatible as "parked bindings", show toast.
**Spec:** 7-InteractionSpec (§8)
**Dependencies:** mutation-controller
**Labels:** ui, flow, swap
**Test Strategy:** Swap preserves valid bindings
**Acceptance Criteria:**
- [ ] op.block.setType
- [ ] op.block.remapPorts
- [ ] Parked bindings for incompatible
- [ ] Toast: "3 bindings parked" with Review

#### parked-bindings [PROPOSED]
**Description:** When binding can't be preserved: store as ParkedBinding, show badge on block, one-click reattach in inspector.
**Spec:** 7-InteractionSpec (§11)
**Dependencies:** swap-block-flow
**Labels:** ux, recovery
**Test Strategy:** Parked bindings can be reattached
**Acceptance Criteria:**
- [ ] ParkedBinding type with all info
- [ ] Badge on block
- [ ] Reattach suggestions in inspector
- [ ] Supports fearless experimentation

#### lens-chain-editing [PROPOSED]
**Description:** Click bus chip → Lens Editor → add/remove/reorder steps → validate type evolution → commit.
**Spec:** 7-InteractionSpec (§9)
**Dependencies:** lens-editor
**Labels:** ui, flow, lenses
**Test Strategy:** Lens chain edits validated
**Acceptance Criteria:**
- [ ] Type evolution validated at edit-time
- [ ] Reject invalid chains immediately
- [ ] Heavy steps require accept flag

#### focus-scrolling-rules [PROPOSED]
**Description:** After mutation: focus originating block/bus, scroll into view (smooth), never jump camera unless requested.
**Spec:** 7-InteractionSpec (§12)
**Dependencies:** focus-emphasis-store
**Labels:** ux, scrolling
**Test Strategy:** Focus follows mutations correctly
**Acceptance Criteria:**
- [ ] Port action → focus consumer block
- [ ] BusBoard action → focus bus + highlight
- [ ] Smooth scroll/pan
- [ ] No unexpected jumps

---

## Phase 11: Time System UI [PROPOSED]

**Goal:** Implement the multi-graph time system with master time and time lenses.

**Spec:** 0.1-Time

### Topics

#### master-time-root [PROPOSED]
**Description:** Patch has exactly one MasterTimeRoot defining: t, transport state, global loop topology, canonical phase buses.
**Spec:** 0.1-Time (§1)
**Dependencies:** Phase 3 complete
**Labels:** architecture, time
**Test Strategy:** Single time root enforced
**Acceptance Criteria:**
- [ ] One MasterTimeRoot per patch
- [ ] t (monotonic), transport (play/pause/rate)
- [ ] Loop topology (finite/cycle/infinite)
- [ ] Canonical buses (phaseA, etc.)

#### time-lens [PROPOSED]
**Description:** Child graphs define TimeLens (not TimeRoot): rate, phaseOffset, pingpong, window, quantize, resetOnPulse.
**Spec:** 0.1-Time (§2)
**Dependencies:** master-time-root
**Labels:** architecture, time
**Test Strategy:** Time lens transforms work correctly
**Acceptance Criteria:**
- [ ] TimeLens: Program<TimeCtx> → Program<TimeCtx>
- [ ] rate (0.5x, 2x)
- [ ] phaseOffset (+0.25ϕ)
- [ ] pingpong, quantize, resetOnPulse

#### time-badge-display [PROPOSED]
**Description:** Root view shows Time Badge per graph: =1x, 0.5x, 2x, ↔ pingpong, +0.25ϕ, reset@pulse.
**Spec:** 0.1-Time (§6)
**Dependencies:** time-lens, graph-card
**Labels:** ui, display, time
**Test Strategy:** Time badges reflect actual lens
**Acceptance Criteria:**
- [ ] Badge in GraphCard
- [ ] All lens types displayed
- [ ] Users understand temporal relationships

#### bus-time-annotation [PROPOSED]
**Description:** Buses show whether publishing in local time or patch time.
**Spec:** 0.1-Time (§4)
**Dependencies:** time-lens
**Labels:** ui, buses, time
**Test Strategy:** Time annotation visible on buses
**Acceptance Criteria:**
- [ ] Badge: "local time" vs "patch time"
- [ ] Explains modulation speed differences

---

## Phase 12: Polish & Integration [PROPOSED]

**Goal:** Final integration, cleanup, and user experience polish.

### Topics

#### preview-simulator [PROPOSED]
**Description:** Implement `PreviewSimulator.simulate(event)` for candidate previews without mutating real patch.
**Spec:** 7-InteractionSpec (§13)
**Dependencies:** All previous phases
**Labels:** preview, simulation
**Test Strategy:** Preview never mutates patch
**Acceptance Criteria:**
- [ ] Isolated simulation
- [ ] Accurate preview
- [ ] No side effects

#### undo-redo-integration [PROPOSED]
**Description:** Integrate new UI with existing undo/redo system. All transactions are undoable, navigation doesn't mutate.
**Spec:** 1-ReDesignSpec (§13)
**Dependencies:** mutation-controller
**Labels:** ux, undo-redo
**Test Strategy:** All actions undoable
**Acceptance Criteria:**
- [ ] No history truncation
- [ ] Branching history preserved
- [ ] Navigation doesn't mutate state

#### error-display [PROPOSED]
**Description:** Errors as: badges on blocks, summary at graph level, detailed explanation in inspector. Errors never break navigation.
**Spec:** 1-ReDesignSpec (§14)
**Dependencies:** inspector-panel
**Labels:** ux, errors
**Test Strategy:** Errors displayed correctly
**Acceptance Criteria:**
- [ ] Block badges
- [ ] Graph summary
- [ ] Inspector detail
- [ ] UI always navigable

#### zoom-density-behavior [PROPOSED]
**Description:** Zoom affects density, not scale. More info at higher zoom, less at lower. Blocks don't resize text arbitrarily.
**Spec:** 1-ReDesignSpec (§12)
**Dependencies:** viewport-store
**Labels:** ux, zoom
**Test Strategy:** Density changes at thresholds
**Acceptance Criteria:**
- [ ] Three density levels
- [ ] Threshold-based switching
- [ ] Text remains readable

#### keyboard-shortcuts [PROPOSED]
**Description:** Full keyboard navigation: F (zoom-to-fit), Esc (clear focus), Cmd+/ (trace toggle), Delete (remove selected).
**Spec:** 4-ReactComponentTree (§D2)
**Dependencies:** All previous phases
**Labels:** ux, keyboard
**Test Strategy:** All shortcuts work
**Acceptance Criteria:**
- [ ] F: zoom-to-fit
- [ ] Esc: clear focus
- [ ] Delete: remove selected
- [ ] Cmd+Z/Shift+Z: undo/redo

#### context-menus [PROPOSED]
**Description:** Context menus for: blocks (swap, delete, duplicate), buses (rename, delete), ports (bind, detach, jump to).
**Spec:** Various specs
**Dependencies:** All previous phases
**Labels:** ux, context-menus
**Test Strategy:** All context actions work
**Acceptance Criteria:**
- [ ] Block context menu
- [ ] Bus context menu
- [ ] Port context menu
- [ ] Consistent styling

#### final-cleanup [PROPOSED]
**Description:** Remove old UI code paths, clean up feature flags, final polish pass.
**Dependencies:** All previous phases
**Labels:** cleanup, final
**Test Strategy:** Old code removed, all tests pass
**Acceptance Criteria:**
- [ ] Old editor code removed
- [ ] Feature flags removed
- [ ] Documentation updated
- [ ] All tests green

---

## Implementation Order Summary

### Critical Path

1. **Phase 1: Foundation & Stores** - State management must come first
2. **Phase 4: Layout Engine** - Most complex, needed by all rendering
3. **Phase 5: Board Rendering** - Visualize the layout
4. **Phase 6: Block Rendering** - Complete the visual system
5. **Phase 9: Binding Policy** - The "anti-spaghetti" core
6. **Phase 10: Event Flow** - Complete interaction system

### Can Parallelize

- Phase 2 (Root View) and Phase 3 (Graph View Shell) can develop in parallel
- Phase 7 (Bus Board & Inspector) can develop alongside Phase 5-6
- Phase 8 (Typed Chooser) can start once Phase 6 (Port Widget) is done

### Lower Priority (Later)

- Phase 11 (Time System UI) - Refinement of existing
- Phase 12 (Polish) - After core is working

---

## Format Reference

### Topic States
- `PROPOSED` - Idea captured, no planning started
- `PLANNING` - STATUS/PLAN/DOD files exist
- `IN PROGRESS` - Implementation underway
- `COMPLETED` - All acceptance criteria met
- `ARCHIVED` - No longer maintained

### Phase Statuses
- `ACTIVE` - Currently being worked on
- `QUEUED` - Planned but not started
- `COMPLETED` - All topics completed
- `ARCHIVED` - No longer relevant
