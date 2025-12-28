2 of 3: Layout engine pseudocode and deterministic rules

Structured Graph Board + Proximity Enforcement + Short Connectors
(Complete, rigorous, implementable)

This spec defines the layout engine as a pure function:

computeLayout(graph, uiState) -> LayoutResult

No side effects. Deterministic. Stable across reloads. Local edits produce local motion.

⸻

0. Definitions

Inputs
	•	graph.blocks[]
	•	graph.directBindings[] (block→block, local)
	•	graph.busBindings[] (port↔bus)
	•	uiState:
	•	density (overview/normal/detail)
	•	focusedBlockId?
	•	focusedBusId?
	•	hoveredBlockId?
	•	viewportRectWorld (optional for culling)

Output

interface LayoutResult {
  nodes: Record<BlockId, LayoutNodeView>;
  connectors: LayoutConnector[]; // only short, drawable ones
  overflowLinks: OverflowLink[]; // for direct bindings too long to draw
  boundsWorld: Rect; // for zoom-to-fit
  columns: ColumnLayoutMeta[]; // debug/telemetry
  debug?: LayoutDebugInfo; // optional
}

interface LayoutNodeView {
  blockId: string;
  x: number; y: number;
  w: number; h: number;
  column: number;
  rowKey: string; // deterministic ordering key
  role: Role;
  depth: number;         // in direct graph (after SCC collapse)
  clusterKey: string;    // grouping key
  sccId?: string;        // if in a cycle group
  isCycleGroupLeader?: boolean;
}

interface LayoutConnector {
  id: string;
  from: { blockId; portId; x; y };
  to:   { blockId; portId; x; y };
  style: 'straight'|'elbow'|'curve';
}

interface OverflowLink {
  id: string;
  to: { blockId; portId };
  from: { blockId; portId; blockName };
  reason: 'tooLong'|'densityCollapsed'|'culled';
}


⸻

1. Block sizing model (density-driven)

You need deterministic block dimensions for layout. Provide a sizing function:

measureBlock(block, density, focusState) -> {w,h, portsVisible:boolean}

Sizing rules (fixed)
	•	overview: compact single-row (e.g. w=260, h=36)
	•	normal: medium (e.g. w=300, h=56 collapsed; expand on hover is not part of layout)
	•	detail: larger (e.g. w=340, h=96)

Important: Layout uses collapsed sizes only. Hover expansion is purely visual overlay (doesn’t push neighbors). This prevents jitter.

⸻

2. Role and column assignment

2.1 Determine role (stable)

Role comes from:
	1.	block capability if non-pure: time|identity|state|render|io
	2.	else registry category mapping
	3.	else operator

2.2 Map role → column (hardcoded)

A stable mapping:
	•	Column 0: time, identity, io
	•	Column 1: state, operator
	•	Column 2: render
	•	Column 3+: reserved (compositors, debug, etc.)

If you don’t have those yet, still reserve the columns so future additions don’t reshuffle everything.

⸻

3. Direct dependency graph preparation

3.1 Build adjacency for direct bindings

We build a graph Gdirect where:
	•	nodes = blocks
	•	edges = directBindings (from output block → input block)

Also store port-level information per edge (portIds).

3.2 Validate and find SCCs (cycles)

Run Tarjan SCC on Gdirect.

Output:
	•	sccIdByBlock: Map<BlockId, SccId>
	•	sccs: Scc[] where each SCC is a set of blocks

3.3 Collapse SCCs for depth ordering

Create meta-nodes:
	•	For SCC size=1: meta-node is the block itself
	•	For SCC size>1: meta-node is CycleGroup(sccId)

Build collapsed DAG Gmeta:
	•	nodes: meta-nodes
	•	edges: if any edge crosses from SCC A to SCC B

⸻

4. Depth calculation (deterministic)

Compute depth for each meta-node in Gmeta:
	•	Roots = meta-nodes with no incoming edges
	•	Depth = longest path length from any root

Tie-breakers for stable ordering in DP:
	•	meta-node key:
	•	if single: blockId
	•	if SCC: sccId (deterministic generation e.g. smallest blockId inside)

Then assign block depth:
	•	blocks in SCC share the SCC depth

⸻

5. Cluster key calculation (bus-aware grouping)

This drives “semantic proximity” even when there are no direct edges.

5.1 Compute bus signature per block

For each block, compute:

busSig = sorted(list of busIds referenced by this block, including publish+subscribe)

(Include direction in signature? Yes, to reduce accidental grouping: e.g. P:phaseA vs S:phaseA.)

So signature items look like: P:phaseA, S:energy.

5.2 Focus modifiers

If uiState.focusedBusId exists:
	•	blocks that touch that bus get clusterKey = "focusBus:<busId>"
	•	blocks that do not touch it get clusterKey = "other"

Else:
	•	clusterKey = role + "|" + hash(busSig) for blocks with any bus usage
	•	if no bus usage: clusterKey = role + "|none"

Hash must be stable (e.g. stable string join; no random).

⸻

6. Deterministic row ordering key

For each block compute a row ordering tuple:

(column, clusterKey, depth, rolePriority, stableLocalKey)

Where:
	•	rolePriority is fixed ordering inside column:
	•	time before identity before io before state before operator before render
	•	stableLocalKey is:
	•	blockId (or registry “sortKey” if you have one; but blockId is fine)

Turn tuple into a string rowKey for debug.

⸻

7. Initial placement (grid layout)

We place blocks per column in order of rowKey.

7.1 Column x positions

Fixed x positions:
	•	x0 = 0
	•	x1 = x0 + colWidth + colGap
	•	etc.

ColWidth can be max block width in column for current density.

7.2 Y placement

Within each column:
	•	start y = 0
	•	for each block in ordering:
	•	y += previous block height + vGap
	•	if clusterKey changes from previous: y += clusterGap

Store initial (x,y).

This yields a clean baseline.

⸻

8. Proximity enforcement pass (the key)

Goal:
	•	for each direct edge B → A, make A near B so connector is short.

We do this without allowing “diagram entropy”.

8.1 Thresholds

Define constants (screen-space normalized via zoom or world-space fixed):
	•	Lmax: maximum allowed connector length to draw (e.g. 220 world units)
	•	Ysnap: desired vertical alignment tolerance (e.g. 48 units)
	•	MoveBudgetPerEdit: max blocks we are willing to shift during one recompute (prevents cascade)

8.2 Edge priority ordering

Process edges in deterministic order:
	1.	edges whose to is focused block (if any)
	2.	edges whose from is focused block
	3.	then sort remaining by:
	•	to.depth ascending
	•	from.blockId then to.blockId lexicographically
	•	fromPortId then toPortId

8.3 Attempt to co-locate consumer near producer

For each edge B → A:

Let positions be pos(B), pos(A).

We attempt to reduce vertical distance:

Case 1: same column

Target y for A is y(B) + h(B) + vGap.
If |y(A) - targetY| > Ysnap:
	•	attempt to reorder within A’s column to move A closer.

Reorder constraints:
	•	cannot move A across a different clusterKey
	•	cannot move A above a block with smaller (clusterKey, depth) tuple
	•	cannot break deterministic ordering of unrelated groups

Mechanism:
	•	treat column blocks as an array
	•	compute candidate insertion index near B’s index
	•	validate constraints
	•	if valid, splice A into that location

Case 2: different columns

We do NOT move A between columns (column is semantic).
Instead:
	•	find A’s nearest y slot that brings it closer to B while preserving constraints
	•	reorder A within its own column toward the y that aligns with B

Target y:
	•	targetY = y(B) (top align) or y(B)+h(B)/2 (center align)
Choose one globally; center align is usually nicer.

Again reorder in column within constraints.

Case 3: SCC cycle group

If B and A are in same SCC:
	•	layout SCC as a “cycle mini-structure”:
	•	compute a local ring/stack arrangement inside a bounding box
	•	Do not apply normal proximity enforcement inside SCC beyond that.

Implementation:
	•	choose SCC leader (min blockId)
	•	allocate a cycle box area in the column (leader sits at box top)
	•	order SCC members deterministically and place in a small circle-ish pattern or stacked loop
	•	connectors inside SCC are short by construction.

8.4 Stop conditions

Stop enforcement when:
	•	you reach move budget
	•	no significant improvements remain (total edge length reduction < epsilon)
	•	max iterations reached (e.g. 3)

This prevents oscillation.

⸻

9. Connector derivation (short arrow selection)

After final positions:

For each direct binding edge:
	•	compute port anchor points (see section 10)
	•	compute distance d

Render as connector if:
	•	density != overview
	•	d <= Lmax
	•	both nodes not culled

Else:
	•	emit OverflowLink for the destination port

OverflowLink is shown as a small chip on the input port:
	•	from: <BlockName> with “jump” action

⸻

10. Port anchor calculation

Port anchors must be deterministic and match the block rendering.

10.1 Port ordering

Port order is the order defined in registry for that block type.
Never derived from runtime state.

10.2 Port positions

For a block at (x,y,w,h):
	•	Input ports at x - portRailOffset
	•	Output ports at x + w + portRailOffset

portRailOffset is fixed (e.g. 8)

Port y:
	•	distribute evenly from top padding to bottom padding
	•	or use fixed row height per port (better for consistent arrow alignment)

Example:
	•	topPadding=12
	•	portRowHeight=16
	•	portY = y + topPadding + index*portRowHeight

These must match CSS.

⸻

11. Viewport culling (optional but recommended)

If you have viewportRectWorld, you can cull nodes:
	•	node visible if bbox intersects viewport rect expanded by margin

Connectors are visible only if both endpoints visible.

Culled direct edges become OverflowLinks with reason culled (but you usually don’t show those unless the destination is visible).

⸻

12. Layout stability and incremental behavior

To avoid “whole graph reshuffles”:

12.1 Stable ordering keys persist

Even if you insert blocks, existing blocks’ rowKeys do not change unless:
	•	their role/column changes
	•	their clusterKey changes
	•	their depth changes due to direct edges changing

12.2 Local insertion policy

When adding a new block to satisfy a port:
	•	assign it the same clusterKey as the consumer by default
	•	place it near the consumer in column order (local insertion)
	•	then proximity enforcement will snap it near the producer/consumer as needed

12.3 Animated transitions (UI-level)

Layout returns new positions; UI animates movement (CSS transition or FLIP) over 120–200ms.
This makes reflow readable, not jarring.

⸻

13. Determinism requirements (must satisfy)

Layout must be deterministic across:
	•	browser sessions
	•	machine architecture
	•	insertion order differences (as long as blockIds are stable)

To ensure this:
	•	all sorts use stable comparators with blockId as final tie-breaker
	•	no use of object iteration order
	•	no randomness
	•	SCC ids derived from sorted member blockIds
	•	bus signature uses stable sorted lists

⸻

14. Debug hooks (mandatory for sanity)

Provide a debug mode that can display:
	•	column boundaries
	•	cluster breaks
	•	depth numbers
	•	edge lengths
	•	overflow edges count

Expose as:
	•	layout.debug fields
	•	optional overlay component in dev builds

This is critical because layout bugs otherwise feel “haunted”.

⸻

If you say Next, I will provide (3 of 3): the complete policy table for “direct binding vs bus binding” (domain-by-domain), including the enforcement rules that prevent long edges, the conversion UX, and how lenses/operators integrate without clutter.