Below is a complete, concrete, implementation-ready design specification for the new editor UI and interaction model.
It is written to be handed to an engineer with no prior context, no aesthetic intuition required, and no reliance on “feel it out.”
Every rule is intentional. There are no optional concepts, no “maybe later,” and no user-managed layout.

⸻

Oscilla Editor UI — Canonical Design Specification

Graph-Navigation, Bus-First, No-Edges Architecture

⸻

0. Non-Negotiable Principles (Read First)
	1.	Users do not place blocks manually.
	2.	Users do not draw or manage edges.
	3.	All layout is deterministic and programmatic.
	4.	All relationships are represented via text chips, highlights, and navigation.
	5.	The editor optimizes for exploration, substitution, and understanding — not diagramming.

If any feature requires spatial reasoning by the user, the design has failed.

⸻

1. Patch Structure Model

1.1 Patch = Tree of Graphs

A patch consists of:
	•	One Patch Root
	•	Zero or more Graph Nodes, each representing a complete, self-contained system

Patch {
  graphs: GraphId[]
}

Each Graph is:
	•	A closed dependency graph
	•	Independently valid
	•	Independently navigable
	•	Independently time-aware

No graph can directly reference another graph’s internal blocks.

⸻

2. Navigation Model

2.1 Two Navigation Levels Only

The editor has exactly two navigation states:
	1.	Root View
	2.	Graph View

No split views. No nesting beyond one level.

⸻

3. Root View (Graph Overview)

3.1 Purpose
	•	Show what systems exist
	•	Show their status
	•	Allow navigation into one system at a time

3.2 Visual Layout
	•	Centered vertical list or grid of Graph Cards
	•	No canvas, no free positioning

Each Graph Card displays:
	•	Graph Name
	•	Status badges:
	•	⟳ Infinite
	•	⏱ Finite (duration shown)
	•	⚠ Error
	•	⏸ Muted
	•	Optional live thumbnail (future-proofed, not required for v1)
	•	Bus interaction summary:
	•	Publishes: phaseA, energy
	•	Subscribes: pulse

3.3 Interactions
	•	Click card → Navigate into Graph View
	•	Add Graph → Opens Graph Template Chooser
	•	Rename / Duplicate / Delete via context menu

⸻

4. Graph View (Primary Editing Surface)

4.1 Purpose
	•	Build and edit one complete system
	•	Inspect dependencies
	•	Tune parameters
	•	Swap behaviors

4.2 Layout Regions

Graph View consists of:

┌─────────────────────────────────────────────┐
│ Breadcrumb: Patch ▸ Graph Name              │
├─────────────────────────────────────────────┤
│                                             │
│   Structured Graph Board                    │
│                                             │
├───────────────────────────┬─────────────────┤
│ Inspector                 │ Bus Board       │
└───────────────────────────┴─────────────────┘


⸻

5. Structured Graph Board

5.1 Core Concept

The Graph Board is not a canvas.
It is a programmatic, read-only layout of blocks.

Users cannot:
	•	Move blocks
	•	Resize blocks
	•	Rotate blocks
	•	Draw connections

5.2 Layout Rules

Blocks are laid out by the system using these rules:
	1.	Dependency depth defines vertical ordering
	2.	Functional role defines horizontal banding:
	•	Identity / Time
	•	Operators
	•	Render
	3.	Bus participation influences grouping
	4.	Stable order across reloads (deterministic)

5.3 Block Representation

Blocks appear as compact rows by default.

Each block row shows:
	•	Block name
	•	Minimal parameter summary
	•	Input/output port indicators (collapsed)
	•	Bus chips (publish / subscribe)

No ports or controls are visible unless the block is focused or hovered.

⸻

6. Block Interaction States

6.1 Default (Collapsed)
	•	Minimal text
	•	No ports
	•	No controls

6.2 Hover
	•	Expands vertically
	•	Reveals:
	•	Ports
	•	Inline parameter widgets
	•	Binding chips
	•	Highlights upstream/downstream blocks (via glow)

6.3 Focused
	•	Triggered by click
	•	All unrelated blocks dim
	•	Inspector populates with full details
	•	Bus bindings fully expanded

Only one block can be focused at a time.

⸻

7. Ports & Bindings (No Edges)

7.1 Ports

Ports are interaction anchors, not wiring points.

Each port:
	•	Has a type
	•	Can accept exactly one binding
	•	Displays its binding inline

7.2 Binding Chips

Bindings are displayed as textual chips:

Examples:
	•	⟵ phaseA · Scale(3→15) · Ease
	•	⟶ energy (sum)

Chips are clickable.

7.3 Binding Actions

Clicking a chip opens a Binding Editor:
	•	Change bus
	•	Edit lens chain
	•	Mute / bypass
	•	Jump to source / consumers

⸻

8. Adding Blocks (Typed Growth Model)

8.1 No “Add Block” Button

Blocks are added only by satisfying a need.

8.2 Input-Driven Creation

When an input port is unbound:
	•	It glows
	•	Clicking it opens a Typed Chooser

The chooser:
	•	Lists compatible blocks only
	•	Groups by intent
	•	Shows live preview on hover
	•	Indicates swap compatibility

Selecting a block:
	•	Inserts it
	•	Binds it
	•	Places it deterministically

⸻

9. Inline Parameters & Embedded Blocks

9.1 Port Widgets

Every input port supports three states:
	1.	Inline Literal
	•	Slider, number, dropdown, etc.
	2.	Lens Binding
	•	Bound to bus with transforms
	3.	Detached Block
	•	Spawned automatically from the port

Detaching:
	•	Creates a block
	•	Connects it
	•	Places it near the consumer (system-decided)

Users never manage the layout.

⸻

10. Bus Board

10.1 Placement
	•	Always visible on the right
	•	Vertical list

10.2 Each Bus Row Shows
	•	Bus name
	•	Type
	•	Combine mode
	•	Silent value
	•	Publisher count
	•	Subscriber count

10.3 Interactions
	•	Click bus → Focus mode
	•	Drag from port to bus → Bind
	•	Click port → Bind via menu

Focusing a bus:
	•	Dims unrelated blocks
	•	Highlights publishers/subscribers
	•	Expands binding chips

⸻

11. Inspector

11.1 Context-Sensitive

Inspector shows:
	•	Block details when block focused
	•	Bus details when bus focused
	•	Graph details when nothing focused

11.2 Inspector Capabilities
	•	Swap block implementation
	•	Edit parameters
	•	View compatibility alternatives
	•	View errors and diagnostics

⸻

12. Zoom, Pan, Navigation

12.1 Camera Controls
	•	Pan: scroll / trackpad
	•	Zoom: ctrl + scroll
	•	Zoom-to-fit: always available

Zoom affects density, not scale:
	•	More info shown at higher zoom
	•	Less info shown at lower zoom

Blocks do not resize text arbitrarily.

⸻

13. Undo / Redo / History
	•	All actions are transactions
	•	No history truncation
	•	Branching history preserved
	•	Navigation does not mutate state

⸻

14. Error Handling & Diagnostics

Errors appear as:
	•	Badges on blocks
	•	Summary at graph level
	•	Detailed explanation in inspector

Errors never break navigation or UI state.

⸻

15. Explicit Non-Features

The following are explicitly disallowed:
	•	Manual block placement
	•	Drawing edges
	•	Free-form canvas
	•	Implicit connections
	•	Hidden side effects
	•	Auto-magic behavior without explanation

⸻

16. Design Outcome

This system ensures:
	•	Zero layout toil
	•	Infinite scalability
	•	Bus-centric thinking
	•	Safe experimentation
	•	No visual entropy
	•	Strong mental model alignment

⸻

Final Guiding Rule (for engineers)

If you are about to let the user drag something, stop.
Ask: “What decision are they actually trying to make?”
Encode that decision directly instead.

This document is the spec.