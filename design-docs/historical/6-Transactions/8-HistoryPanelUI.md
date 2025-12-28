History Panel — Visual Layout & Interaction Spec

(Designer- and engineer-ready; no conceptual filler, no hand-waving)

This specifies exact structure, hierarchy, affordances, and behaviors for the History Panel that supports a persistent branching revision tree while remaining fast, legible, and non-intimidating.

⸻

1) Placement & Containment

Location
	•	Right sidebar, vertically stacked above Inspector, below Bus Board
	•	Width: 280–320px (resizable)
	•	Collapsible via chevron in header
	•	Persisted open/closed state per project

┌───────────────────────────┐
│ Bus Board                 │
├───────────────────────────┤
│ History ▾                 │  ← this panel
│ ──────────────────────── │
│ [Pinned]                  │
│ ★ Ambient Loop v3         │
│ ──────────────────────── │
│ [Recent Takes]            │
│ ● Change Radius           │
│   +2                      │
│   Move Blocks             │
│   Adjust Phase            │
│ ──────────────────────── │
│ [···]                     │
├───────────────────────────┤
│ Inspector                 │
└───────────────────────────┘


⸻

2) Panel Header

Header Row
	•	Left: “History” label
	•	Right:
	•	Collapse chevron
	•	Optional menu button (⋯) for:
	•	“Expand All Variations”
	•	“Collapse All”
	•	“Show Map View” (toggle)
	•	“Clear Filters” (future)

Interaction
	•	Clicking “History” text toggles collapse
	•	Header remains visible when collapsed (icon-only mode)

⸻

3) Sections

3.1 Pinned Section (Bookmarks / Milestones)

Visibility
	•	Only shown if ≥1 pinned revision exists
	•	Sticky at top of panel

Row Anatomy (Pinned Row)

★  Ambient Loop v3        2h
   ✓ compiled

	•	★ Star icon (filled)
	•	Label (editable on double-click)
	•	Right-aligned timestamp (relative)
	•	Optional status badge:
	•	✓ compiled
	•	⚠ compile error
	•	Clicking row → checkout
	•	Context menu (right-click or ⋯ on hover):
	•	Rename
	•	Unpin
	•	Jump to in graph
	•	Duplicate variation (future)

Pinned rows do not show children inline. They are entry points.

⸻

3.2 Recent Takes Section (Primary)

This is the default, always-visible list.

Content
	•	Linear list representing the active path from root → head
	•	Default depth: last 30 revisions
	•	Scrollable independently of Inspector

Row Anatomy (Standard Row)

● Change Radius           5m
  ⤷ +2

Left column
	•	● Current revision indicator (filled circle)
	•	○ Non-current revision (empty circle)

Main column
	•	Primary label (single line, ellipsized)
	•	Secondary metadata (optional, small):
	•	“3 blocks changed”
	•	“Bus routing”
	•	(this is optional but helpful)

Right column
	•	Relative timestamp (e.g. “5m”, “1h”, “yesterday”)
	•	Optional compile badge (small dot):
	•	green = compiled OK
	•	red = compile failed

Variation badge
	•	Appears only if node has children other than the active path
	•	Shown as +N with a chevron
	•	Click expands variations inline

⸻

4) Expanded Variations (Inline Branch View)

When a row with variations is expanded:

○ Change Radius           5m
  ⤷ −
    ○ Adjust Radius Fast  4m
    ○ Adjust Radius Slow  3m

Rules
	•	Children are indented by 16px
	•	Active child is highlighted with same ● indicator
	•	Clicking a child:
	•	checks it out
	•	sets it as preferredChild of parent
	•	collapses siblings unless user holds modifier (Alt)

Styling
	•	Children use lighter text weight
	•	Background highlight for hovered row only (not parent)

⸻

5) Selection & Checkout Behavior

Single Click
	•	Immediately highlights row
	•	Calls checkout(revId)
	•	Emits compile request
	•	Shows “compiling…” indicator if needed

Visual Feedback
	•	Highlight color persists while compiling
	•	If compile fails:
	•	row gets red dot
	•	tooltip on hover shows error summary
	•	runtime remains unchanged

Keyboard Navigation
	•	↑ / ↓ move selection
	•	Enter = checkout
	•	Cmd/Ctrl+Z = parent
	•	Cmd/Ctrl+Shift+Z = preferred child
	•	Tab cycles focus between History / Bus Board / Inspector

⸻

6) Context Menu (Right Click / ⋯)

Available on any row:
	•	Checkout
	•	Bookmark / Unbookmark
	•	Rename label
	•	Start New Variation From Here
	•	Reveal in Map View
	•	Copy Revision ID (debug)
	•	Delete label only (never delete revision)

Important: No destructive history operations exist.

⸻

7) Redo Choice Overlay (When Multiple Futures)

Triggered by:
	•	Cmd+Shift+Z when multiple children exist
	•	Long-press redo button

Overlay Layout

Choose a variation
────────────────────
● Adjust Radius Fast
○ Adjust Radius Slow
○ Change Color

	•	Appears near top center or near redo button
	•	Max 6 items visible
	•	Arrow keys navigate
	•	Enter selects
	•	Esc cancels

Behavior
	•	Selecting one updates preferredChild
	•	Overlay auto-dismisses on selection or Esc

⸻

8) Map View (Secondary Mode)

Accessed via header menu.

Layout
	•	Canvas-like view inside same panel area
	•	Nodes as dots
	•	Edges as lines
	•	Active path highlighted
	•	Zoom + pan
	•	Clicking a node = checkout

Rules
	•	Read-only navigation
	•	No editing here
	•	Meant for exploration, not daily use

⸻

9) Visual Language & Styling

Color Coding
	•	Current: accent color (matches transport play color)
	•	Normal: neutral
	•	Compile error: red dot
	•	Bookmarked: star accent

Motion
	•	Expand/collapse variations: 150ms ease
	•	Checkout highlight: instant
	•	Compile indicator: subtle spinner or pulse

Density
	•	Rows ~32px height
	•	Compact but readable
	•	No icons unless they convey state

⸻

10) Performance & Jank Rules
	•	List rendering must be virtualized if >100 rows
	•	No compile or materialization triggered by hover
	•	Checkout always:
	1.	updates UI immediately
	2.	schedules compile
	3.	swaps runtime only on success

⸻

11) Engineering Contracts

History Panel depends only on:
	•	HistoryStore
	•	getHeadRevId
	•	getParent
	•	getChildren
	•	getPreferredChild
	•	checkout
	•	bookmark
	•	Compile status feed:
	•	per-revision success/failure state
	•	Gesture finalization hook:
	•	panel never mutates patch directly

⸻

12) What This Enables (Without Extra UI)
	•	Safe experimentation
	•	Infinite branching
	•	No fear of undo
	•	Clear sense of “where am I?”
	•	No mental overhead for version control concepts

⸻

If you want, next I can provide:
	•	Exact wireframe ASCII for the panel
	•	ARIA/accessibility mapping
	•	Minimal data schema for labels/bookmarks
	•	How this integrates with multi-client (locks, indicators)